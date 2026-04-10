import { useState, useEffect, useRef } from 'react';
import { Gift, Trophy, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Giveaway {
  id: string;
  name: string;
  command: string;
  status: 'active' | 'drawing' | 'completed';
  winner_username: string | null;
  winner_profile_image_url: string | null;
  total_participants: number;
  is_visible: boolean;
  end_time: string | null;
}

interface Participant {
  id: string;
  username: string;
  user_id: string;
  profile_image_url: string;
}

const FALLBACK_AVATAR = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="70" height="70" viewBox="0 0 70 70"%3E%3Crect fill="%239147ff" width="70" height="70" rx="35"/%3E%3Cpath fill="%23fff" d="M35 35m-15 0a15 15 0 1 0 30 0a15 15 0 1 0 -30 0" opacity="0.3"/%3E%3C/svg%3E';
const CARD_WIDTH = 100; // px per participant card in the strip

export function GiveawayOverlay() {
  const [giveaway, setGiveaway] = useState<Giveaway | null>(null);
  const [showWinner, setShowWinner] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('00:00');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isRolling, setIsRolling] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [stripOffset, setStripOffset] = useState(0);
  const [winnerIndex, setWinnerIndex] = useState(-1);
  const [showWinnerHighlight, setShowWinnerHighlight] = useState(false);
  const animFrameRef = useRef<number>(0);
  const stripRef = useRef<Participant[]>([]);

  useEffect(() => {
    loadActiveGiveaway();

    const channel = supabase
      .channel('giveaway_overlay')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'giveaways' }, (payload) => {
        if (payload.new && (payload.new as any).status === 'drawing') {
          startRolling((payload.new as any).id);
        } else {
          loadActiveGiveaway();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  useEffect(() => {
    if (giveaway?.winner_username) {
      setShowWinner(true);
      const timer = setTimeout(() => setShowWinner(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [giveaway?.winner_username]);

  useEffect(() => {
    if (!giveaway?.end_time) return;
    const updateTimer = () => {
      const diff = new Date(giveaway.end_time!).getTime() - Date.now();
      if (diff <= 0) { setTimeRemaining('00:00'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [giveaway?.end_time]);

  const loadActiveGiveaway = async () => {
    const { data } = await supabase
      .from('giveaways')
      .select('*')
      .eq('is_visible', true)
      .eq('status', 'active')
      .maybeSingle();

    if (!data) {
      const { data: completed } = await supabase
        .from('giveaways')
        .select('*')
        .eq('is_visible', true)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (completed) {
        setGiveaway(completed);
        setTimeout(() => setIsVisible(true), 50);
      } else {
        setIsVisible(false);
        setTimeout(() => setGiveaway(null), 1000);
      }
    } else {
      setGiveaway(data);
      setTimeout(() => setIsVisible(true), 50);
    }
  };

  const startRolling = async (giveawayId: string) => {
    // Fetch participants with profile images
    const { data: participantData } = await supabase
      .from('giveaway_participants')
      .select('*')
      .eq('giveaway_id', giveawayId);

    if (!participantData || participantData.length === 0) return;

    // If most participants have no profile image, fetch from Twitch API
    const missingImages = participantData.filter(p => !p.profile_image_url || p.profile_image_url.trim() === '');
    if (missingImages.length > participantData.length * 0.5) {
      try {
        const usernames = participantData.map(p => (p.user_id || p.username).toLowerCase());
        const res = await fetch('/api/twitch-users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernames }),
        });
        if (res.ok) {
          const { users } = await res.json();
          for (const p of participantData) {
            const key = (p.user_id || p.username).toLowerCase();
            if (users[key]?.profile_image_url) {
              p.profile_image_url = users[key].profile_image_url;
            }
          }
        }
      } catch (_) { /* continue with fallback avatars */ }
    }

    setParticipants(participantData);
    setShowWinnerHighlight(false);
    setWinnerIndex(-1);

    // Build a long strip: repeat participants many times, place winner near end
    const repeatCount = Math.max(8, Math.ceil(60 / participantData.length));
    const strip: Participant[] = [];
    for (let i = 0; i < repeatCount; i++) {
      const shuffled = [...participantData].sort(() => Math.random() - 0.5);
      strip.push(...shuffled);
    }

    // Pick a random winner and place them at a known position near the end
    const winnerIdx = Math.floor(Math.random() * participantData.length);
    const winner = participantData[winnerIdx];
    const winnerPos = strip.length - 5; // 5 cards from end
    strip[winnerPos] = winner;

    stripRef.current = strip;
    setWinnerIndex(winnerPos);
    setIsRolling(true);
    setIsVisible(true);

    // Animate: start fast, decelerate, stop with winner centered
    const containerWidth = 288; // overlay panel width
    const centerOffset = (containerWidth / 2) - (CARD_WIDTH / 2);
    const targetOffset = winnerPos * CARD_WIDTH - centerOffset;
    const totalDuration = 5000; // 5 seconds
    const startTime = performance.now();
    const startOffset = 0;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / totalDuration, 1);

      // Ease out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentOffset = startOffset + (targetOffset - startOffset) * eased;

      setStripOffset(currentOffset);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        // Animation done — highlight winner
        setShowWinnerHighlight(true);
        setTimeout(() => {
          setIsRolling(false);
          loadActiveGiveaway();
        }, 2000);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);
  };

  if (!giveaway && !isRolling) return null;

  // ── ROLLING STATE: Horizontal marquee with arrow ──
  if (isRolling) {
    const strip = stripRef.current;
    return (
      <div
        className="absolute w-full z-[9999]"
        style={{
          left: 0, right: 0, top: 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(-100%)',
          transition: 'transform 280ms ease',
        }}
      >
        <div
          className="overflow-hidden relative"
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            border: '2px solid rgba(234, 179, 8, 0.5)',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(234, 179, 8, 0.2)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-center gap-2 py-2" style={{ background: 'rgba(234, 179, 8, 0.1)' }}>
            <Gift className="w-4 h-4 text-yellow-400" />
            <span className="text-yellow-400 text-xs font-black uppercase tracking-wider">Giveaway</span>
          </div>

          {/* Arrow pointing down */}
          <div className="flex justify-center" style={{ marginBottom: '-6px', zIndex: 10, position: 'relative' }}>
            <div style={{
              width: 0, height: 0,
              borderLeft: '10px solid transparent',
              borderRight: '10px solid transparent',
              borderTop: '12px solid #fbbf24',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
            }} />
          </div>

          {/* Scrolling strip */}
          <div className="relative" style={{ height: '110px', overflow: 'hidden' }}>
            <div
              className="flex items-center absolute"
              style={{
                transform: `translateX(-${stripOffset}px)`,
                height: '100%',
                willChange: 'transform',
              }}
            >
              {strip.map((p, i) => {
                const isWinner = showWinnerHighlight && i === winnerIndex;
                const avatar = p.profile_image_url?.trim() || FALLBACK_AVATAR;
                return (
                  <div
                    key={`${p.id}-${i}`}
                    className="flex flex-col items-center justify-center flex-shrink-0"
                    style={{
                      width: `${CARD_WIDTH}px`,
                      transition: isWinner ? 'all 0.3s ease' : 'none',
                      transform: isWinner ? 'scale(1.15)' : 'scale(1)',
                    }}
                  >
                    <img
                      src={avatar}
                      alt={p.username}
                      className="rounded-full object-cover"
                      style={{
                        width: isWinner ? '60px' : '52px',
                        height: isWinner ? '60px' : '52px',
                        border: isWinner ? '3px solid #fbbf24' : '2px solid rgba(255,255,255,0.2)',
                        boxShadow: isWinner ? '0 0 20px rgba(234, 179, 8, 0.6)' : 'none',
                        transition: 'all 0.3s ease',
                      }}
                      onError={(e) => { e.currentTarget.src = FALLBACK_AVATAR; }}
                    />
                    <span
                      className="text-center mt-1 font-bold truncate"
                      style={{
                        fontSize: '9px',
                        maxWidth: `${CARD_WIDTH - 8}px`,
                        color: isWinner ? '#fbbf24' : 'rgba(255,255,255,0.7)',
                      }}
                    >
                      {p.username}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Side fades */}
            <div className="absolute inset-y-0 left-0 w-12 pointer-events-none"
              style={{ background: 'linear-gradient(to right, #0f172a, transparent)' }} />
            <div className="absolute inset-y-0 right-0 w-12 pointer-events-none"
              style={{ background: 'linear-gradient(to left, #0f172a, transparent)' }} />
          </div>
        </div>
      </div>
    );
  }

  if (!giveaway) return null;

  // ── WINNER STATE ──
  if (showWinner && giveaway.winner_username) {
    const winnerAvatar = giveaway.winner_profile_image_url?.trim() || FALLBACK_AVATAR;
    return (
      <div
        className="absolute w-full z-[9999] transition-opacity duration-1000"
        style={{
          left: 0, right: 0, top: 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(-100%)',
          transition: 'opacity 280ms ease, transform 280ms ease',
          opacity: isVisible ? 1 : 0,
        }}
      >
        <div
          className="rounded-t-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
            border: '2px solid rgba(96, 165, 250, 0.3)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4 text-yellow-400 drop-shadow-lg" />
              <p className="text-yellow-400/90 text-xs font-bold uppercase tracking-wide">Vencedor</p>
            </div>

            <div className="flex items-center gap-2">
              <img
                src={winnerAvatar}
                alt={giveaway.winner_username}
                className="w-7 h-7 rounded-full border-2 border-yellow-400/50"
                onError={(e) => { e.currentTarget.src = FALLBACK_AVATAR; }}
              />
              <p className="text-sm font-black text-white drop-shadow-lg break-all flex-1">{giveaway.winner_username}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── ACTIVE STATE: Participant count, timer, command ──
  return (
    <div
      className="absolute w-full z-[9999] transition-opacity duration-1000"
      style={{
        left: 0, right: 0, top: 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(-100%)',
        transition: 'opacity 280ms ease, transform 280ms ease',
        opacity: isVisible ? 1 : 0,
      }}
    >
      <div
        className="rounded-t-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
          border: '2px solid rgba(96, 165, 250, 0.3)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div className="p-3">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="flex items-center gap-1.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <Gift className="w-4 h-4 text-white" />
              </div>
              <span className="text-white text-lg font-black">{giveaway.total_participants}</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-yellow-400" />
              <span className="text-yellow-400 text-sm font-bold">{timeRemaining}</span>
            </div>
          </div>

          <div className="text-center">
            <p className="text-white/90 text-xs">
              Type <span
                className="font-black px-1.5 py-0.5 rounded text-xs"
                style={{ background: 'rgba(234, 179, 8, 0.3)', color: '#fbbf24' }}
              >{giveaway.command}</span> in chat to join!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
