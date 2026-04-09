import React, { useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import './BonusHuntOverlay.css';

/* ═══════════════════════════════════════════════════════
   TypeScript interfaces
   ═══════════════════════════════════════════════════════ */
interface BonusHunt {
  id: string;
  name: string;
  hunt_number: number;
  streamer_name?: string;
  status: 'active' | 'opening' | 'completed';
  total_invested: number;
  total_won: number;
  initial_break_even: number;
  current_break_even: number;
  profit_loss: number;
  bonus_count: number;
  opened_count: number;
}

interface BonusHuntItem {
  id: string;
  slot_name: string;
  slot_image_url?: string;
  bet_amount: number;
  payment_amount: number | null;
  result_amount: number | null;
  multiplier: number | null;
  status: 'pending' | 'opened';
  order_index: number;
  is_super_bonus: boolean | null;
  is_extreme_bonus?: boolean | null;
}

interface BonusHuntOverlayProps {
  huntId?: string;
  embedded?: boolean;
}

interface Bonus {
  id?: string;
  slotName?: string;
  slot?: { name?: string; image?: string };
  betSize?: number;
  payout?: number;
  multiplier?: number | null;
  opened?: boolean;
  isSuperBonus?: boolean;
  isExtremeBonus?: boolean;
  isExtreme?: boolean;
}

interface BonusHuntConfig {
  bonuses?: Bonus[];
  currency?: string;
  startMoney?: number;
  stopLoss?: number;
  bonusOpening?: boolean;
}

/* ═══════════════════════════════════════════════════════
   V11 "Fever" Bonus Hunt Widget
   ═══════════════════════════════════════════════════════ */
function BonusHuntWidget({ config }: { config: BonusHuntConfig }) {
  const c = config || {};
  const bonuses = c.bonuses || [];
  const currency = c.currency || '€';
  const startMoney = Number(c.startMoney) || 0;
  const stopLoss = Number(c.stopLoss) || 0;

  const currentBonus = bonuses.find(b => !b.opened);
  const currentIndex = currentBonus ? bonuses.indexOf(currentBonus) : -1;
  const isOpening = !!c.bonusOpening && currentIndex >= 0;
  const huntTitle = c.bonusOpening ? 'BONUS OPENING' : 'BONUS HUNT';

  /* ── Mode transition animation (hunt ↔ opening) ── */
  const widgetContentRef = useRef<HTMLDivElement>(null);
  const prevModeRef = useRef(!!c.bonusOpening);
  useEffect(() => {
    const isOpeningNow = !!c.bonusOpening;
    if (prevModeRef.current === isOpeningNow) return;
    prevModeRef.current = isOpeningNow;
    const el = widgetContentRef.current;
    if (!el) return;
    // Slow slide out to the left until fully gone
    el.animate([
      { transform: 'translateX(0)', opacity: 1 },
      { transform: 'translateX(-110%)', opacity: 0 },
    ], { duration: 800, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' })
      .onfinish = () => {
        // Pause, then slowly slide in from the left to center
        setTimeout(() => {
          el.animate([
            { transform: 'translateX(-110%)', opacity: 0 },
            { transform: 'translateX(0)', opacity: 1 },
          ], { duration: 1200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
        }, 500);
      };
  }, [c.bonusOpening]);

  const stats = useMemo(() => {
    const totalBetAll = bonuses.reduce((s, b) => s + (Number(b.betSize) || 0), 0);
    const openedBonuses = bonuses.filter(b => b.opened);
    const totalBetOpened = openedBonuses.reduce((s, b) => s + (Number(b.betSize) || 0), 0);
    const totalWin = openedBonuses.reduce((s, b) => s + (Number(b.payout) || 0), 0);
    const totalBetRemaining = Math.max(totalBetAll - totalBetOpened, 0);
    const superCount = bonuses.filter(b => b.isSuperBonus).length;
    const extremeCount = bonuses.filter(b => b.isExtremeBonus || b.isExtreme).length;
    const target = Math.max(startMoney - stopLoss, 0);
    const breakEven = totalBetAll > 0 ? target / totalBetAll : 0;
    const remaining = Math.max(target - totalWin, 0);
    const liveBE = totalBetRemaining > 0 ? remaining / totalBetRemaining : 0;
    return { totalBetAll, totalWin, superCount, extremeCount, breakEven, liveBE, openedCount: openedBonuses.length };
  }, [bonuses, startMoney, stopLoss]);

  /* ══════════════════════════════════════════════════════
     3D Carousel — Web Animations API (zero CSS transitions)
     ──────────────────────────────────────────────────────
     Uses element.animate() for explicit keyframe animations.
     CSS transitions are REMOVED from .bht-carousel-card so React
     re-renders can never break in-flight animation.
     ══════════════════════════════════════════════════════ */

  const stageRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef(0);
  const mountedRef = useRef(false);
  const prevCountRef = useRef(0);

  const ANIM_MS = 800;
  const EASING = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

  // Slot presets: [translateX, translateZ, rotateY, scale, opacity, blur]
  const SLOTS: [number, number, number, number, number, number][] = [
    [-170, -120,  45, 0.65, 0.3, 1],
    [ -95,  -50,  25, 0.85, 0.7, 0],
    [   0,   20,   0, 1,    1,   0],
    [  95,  -50, -25, 0.85, 0.7, 0],
    [ 170, -120, -45, 0.65, 0.3, 1],
  ];

  const buildTfm = (tx: number, tz: number, ry: number, sc: number) =>
    `translateX(${tx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${sc})`;

  const targetFor = (dist: number) => {
    const s = SLOTS[dist + 2];
    if (s) {
      const [tx, tz, ry, sc, op, bl] = s;
      return {
        transform: buildTfm(tx, tz, ry, sc),
        opacity: String(op),
        filter: bl > 0 ? `brightness(0.45) blur(${bl}px)` : 'none',
        zIndex: dist === 0 ? '3' : Math.abs(dist) === 1 ? '1' : '0',
        pointerEvents: '' as string,
      };
    }
    const exitX = dist < 0 ? -260 : 260;
    const exitRY = dist < 0 ? 50 : -50;
    return {
      transform: buildTfm(exitX, -200, exitRY, 0.4),
      opacity: '0',
      filter: 'brightness(0.3) blur(3px)',
      zIndex: '-1',
      pointerEvents: 'none',
    };
  };

  /** Set position immediately — no animation */
  const setImmediate = (el: HTMLElement, t: ReturnType<typeof targetFor>) => {
    el.getAnimations().forEach(a => a.cancel());
    el.style.transform = t.transform;
    el.style.opacity = t.opacity;
    el.style.filter = t.filter;
    el.style.zIndex = t.zIndex;
    el.style.pointerEvents = t.pointerEvents;
  };

  /** Animate from current computed position to target via Web Animations API */
  const animateTo = (el: HTMLElement, t: ReturnType<typeof targetFor>) => {
    // Commit and cancel running animations so getComputedStyle reads final values
    el.getAnimations().forEach(a => { try { a.commitStyles(); } catch(_) {} a.cancel(); });
    const cs = getComputedStyle(el);
    const from = {
      transform: cs.transform || 'none',
      opacity: cs.opacity || '1',
      filter: cs.filter || 'none',
    };
    // Set final inline styles (take effect after animation ends)
    el.style.transform = t.transform;
    el.style.opacity = t.opacity;
    el.style.filter = t.filter;
    el.style.zIndex = t.zIndex;
    el.style.pointerEvents = t.pointerEvents;
    // Run explicit from→to animation
    el.animate(
      [
        { transform: from.transform, opacity: from.opacity, filter: from.filter },
        { transform: t.transform, opacity: t.opacity, filter: t.filter },
      ],
      { duration: ANIM_MS, easing: EASING }
    );
  };

  /** Position all cards relative to center index */
  const positionAll = useCallback((ci: number, animate: boolean) => {
    const stage = stageRef.current;
    if (!stage) return;
    const cards = stage.querySelectorAll<HTMLElement>('[data-idx]');
    const total = cards.length;
    if (total === 0) return;
    cards.forEach((el) => {
      const idx = parseInt(el.getAttribute('data-idx')!, 10);
      const rawDist = ((idx - ci) % total + total) % total;
      const dist = rawDist <= Math.floor(total / 2) ? rawDist : rawDist - total;
      const t = targetFor(dist);
      if (animate) animateTo(el, t); else setImmediate(el, t);
    });
  }, []);

  // First mount: position without animation before paint
  useLayoutEffect(() => {
    if (bonuses.length === 0) return;
    if (!mountedRef.current) {
      mountedRef.current = true;
      const ci = isOpening && currentIndex >= 0 ? currentIndex : 0;
      centerRef.current = ci;
      positionAll(ci, false);
    } else if (bonuses.length !== prevCountRef.current) {
      centerRef.current = Math.min(centerRef.current, bonuses.length - 1);
      positionAll(centerRef.current, false);
    }
    prevCountRef.current = bonuses.length;
  }, [bonuses.length, positionAll]);

  // Auto-rotate
  useEffect(() => {
    if (bonuses.length < 2 || isOpening) return;
    const id = setInterval(() => {
      centerRef.current = (centerRef.current + 1) % bonuses.length;
      positionAll(centerRef.current, true);
    }, 2500);
    return () => clearInterval(id);
  }, [bonuses.length, isOpening, positionAll]);

  // Opening mode: snap to current with animation (only when center actually changes)
  useEffect(() => {
    if (isOpening && currentIndex >= 0 && centerRef.current !== currentIndex) {
      centerRef.current = currentIndex;
      positionAll(currentIndex, true);
    }
  }, [isOpening, currentIndex, positionAll]);

  /* ── Auto-scroll for bonus list ── */
  const scrollTrackRef = useRef<HTMLDivElement>(null);
  const bonusListRef = useRef<HTMLDivElement>(null);
  const scrollRaf = useRef<number>(0);
  const scrollOffset = useRef(0);

  // Start once on mount, never restart. Tick is a no-op when track doesn't exist (<3 items).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const speed = 30; // pixels per second
    let lastTime = 0;
    const tick = (now: number) => {
      if (!scrollTrackRef.current) {
        lastTime = 0; // reset so dt doesn't spike when track appears
        scrollRaf.current = requestAnimationFrame(tick);
        return;
      }
      if (lastTime === 0) lastTime = now;
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      scrollOffset.current += speed * dt;
      const half = scrollTrackRef.current.scrollHeight / 2;
      if (half > 0 && scrollOffset.current >= half) scrollOffset.current -= half;
      scrollTrackRef.current.style.transform = `translateY(-${scrollOffset.current}px)`;
      scrollRaf.current = requestAnimationFrame(tick);
    };
    scrollRaf.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(scrollRaf.current); };
  }, []);

  // Separate rAF for card glow/vibrate – queries from bonusListRef (always mounted)
  // so it works regardless of scroll track state or number of items.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let raf = 0;
    const animate = (now: number) => {
      const root = bonusListRef.current;
      if (root) {
        const t = now / 1000;
        root.querySelectorAll<HTMLElement>('.bht-cpt-card--super').forEach(card => {
          // Pulse the card itself (scale breathe), keep static glow
          const p = (Math.sin(t * 2.1) + 1) / 2; // 0→1 ~3s
          const s = 1 + p * 0.025; // scale 1.0 → 1.025
          card.style.transform = `scale(${s})`;
        });
        root.querySelectorAll<HTMLElement>('.bht-cpt-card--extreme').forEach(card => {
          // Slower, smoother trill
          const vx = Math.sin(t * 18) * 0.7;
          const vy = Math.cos(t * 23) * 0.5;
          card.style.transform = `translate(${vx}px, ${vy}px)`;
        });
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="bht11" ref={widgetContentRef} style={{ fontFamily: "'Inter', sans-serif", fontSize: '15px', width: '100%', height: '100%', overflow: 'hidden' }}>

      {/* ═══ 1. Header ═══ */}
      <div className="bht11-header">
        <div className="bht11-header-left">
          <div className="bht11-header-titles">
            <span className="bht11-header-title">{huntTitle}</span>
            <span className="bht11-header-subtitle">fever</span>
          </div>
        </div>
      </div>

      {/* ═══ 2. Stats Row ═══ */}
      <div className="bht11-stats-row">
        <div className="bht11-stat-card">
          <div className="bht11-stat-card-text">
            <span className="bht11-stat-card-label">START</span>
            <span className="bht11-stat-card-value">{currency}{startMoney.toFixed(2)}</span>
          </div>
        </div>
        <div className="bht11-stat-card">
          <div className="bht11-stat-card-text">
            <span className="bht11-stat-card-label">BREAKEVEN</span>
            <span className="bht11-stat-card-value">{(c.bonusOpening ? stats.liveBE : stats.breakEven).toFixed(0)}x</span>
          </div>
        </div>
      </div>

      {/* ═══ 3. Counts ═══ */}
      <div className="bht11-counts-col">
        {(stats.superCount > 0 || stats.extremeCount > 0) && (
          <div className="bht11-count-bar-row">
            {stats.superCount > 0 && (
              <div className="bht11-count-bar bht11-count-bar--super">
                <span className="bht11-count-bar-icon">⚡</span>
                <span className="bht11-count-bar-label">SUPER</span>
                <span className="bht11-count-bar-value">{stats.superCount}</span>
              </div>
            )}
            {stats.extremeCount > 0 && (
              <div className="bht11-count-bar bht11-count-bar--extreme">
                <span className="bht11-count-bar-icon">🔥</span>
                <span className="bht11-count-bar-label">EXTREME</span>
                <span className="bht11-count-bar-value">{stats.extremeCount}</span>
              </div>
            )}
          </div>
        )}
        <div className="bht11-count-bar">
          <span className="bht11-count-bar-icon">🎁</span>
          <span className="bht11-count-bar-label">BONUSES</span>
          <span className="bht11-count-bar-value">{bonuses.length}</span>
        </div>
      </div>

      {/* ═══ 4. 3D Rotating Card Stack ═══ */}
      {bonuses.length > 0 && (
        <div className="bht11-stack-section">
          <div className="bht-carousel-stage" ref={stageRef}>
            {bonuses.map((bonus, bIdx) => (
              <div key={bonus.id || `card-${bonus.slotName}-${bIdx}`}
                data-idx={bIdx}
                className={`bht-carousel-card${bonus.isSuperBonus ? ' bht-stack-card--super' : ''}${(bonus.isExtremeBonus || bonus.isExtreme) ? ' bht-stack-card--extreme' : ''}`}>
                <div className="bht-stack-card-inner">
                  <div className="bht-stack-card-img-wrap">
                    {bonus.slot?.image ? (
                      <img src={bonus.slot.image} alt={bonus.slotName} className="bht-stack-card-img"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : <div className="bht-stack-card-img-ph" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {(() => {
            const total = bonuses.length;
            const opened = bonuses.filter(b => b.opened).length;
            const pct = total > 0 ? (opened / total) * 100 : 0;
            return (
              <div className="bht-progress">
                <div className="bht-progress-bar">
                  <div className="bht-progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="bht-progress-text">{opened}/{total}</span>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══ 5. Bonus List Section ═══ */}
      <div className="bht11-list-section">
        <div className="bht-bonus-list" ref={bonusListRef}>
          {(() => {
            const renderCompactCard = (bonus: Bonus, idx: number, key: string | number) => {
              const payout = Number(bonus.payout) || 0;
              const bet = Number(bonus.betSize) || 0;
              const multi = bonus.multiplier != null ? bonus.multiplier : (bet > 0 ? payout / bet : 0);
              const isExtreme = bonus.isExtremeBonus || bonus.isExtreme;
              const isSuper = bonus.isSuperBonus;
              return (
                <div key={key}
                  className={`bht-cpt-card${idx === currentIndex ? ' bht-cpt-card--active' : ''}${bonus.opened ? ' bht-cpt-card--opened' : ''}${isSuper ? ' bht-cpt-card--super' : ''}${isExtreme ? ' bht-cpt-card--extreme' : ''}`}>
                  <div className="bht-cpt-card-img-wrap">
                    {bonus.slot?.image ? (
                      <img src={bonus.slot.image} alt={bonus.slotName}
                        className="bht-cpt-card-img"
                        onError={(e) => { const t = e.target as HTMLImageElement; t.src = ''; t.style.display = 'none'; }} />
                    ) : <div className="bht-cpt-card-img-ph" />}
                  </div>
                  <div className="bht-cpt-card-info">
                    <div className="bht-cpt-card-row1">
                      <span className="bht-cpt-card-idx">#{idx + 1}</span>
                      <span className="bht-cpt-card-name">{bonus.slotName || bonus.slot?.name}</span>
                    </div>
                    <div className="bht-cpt-card-row2">
                      <span className="bht-cpt-card-bet">BET {currency}{bet.toFixed(2)}</span>
                      {bonus.opened && (
                        <>
                          <span className="bht-cpt-card-payout">{currency}{payout.toFixed(2)}</span>
                          <span className={`bht-cpt-card-multi${multi >= 100 ? ' bht-cpt-card-multi--huge' : multi >= 50 ? ' bht-cpt-card-multi--big' : ''}`}>{multi.toFixed(1)}x</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            };
            if (bonuses.length === 0) return null;
            if (bonuses.length < 3) {
              return (
                <div key="compact-static" className="bht-compact-track">
                  {bonuses.map((b, i) => renderCompactCard(b, i, b.id || i))}
                </div>
              );
            }
            return (
              <div key="compact-scroll" ref={scrollTrackRef} className="bht-compact-track">
                {[...bonuses, ...bonuses].map((b, i) => {
                  const idx = i % bonuses.length;
                  return renderCompactCard(b, idx, `${b.id || idx}-${i >= bonuses.length ? 'c' : 'o'}`);
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

const MemoizedWidget = React.memo(BonusHuntWidget);

/* ═══════════════════════════════════════════════════════
   Supabase Data Bridge
   ═══════════════════════════════════════════════════════ */
export function BonusHuntOverlay({ huntId, embedded = false }: BonusHuntOverlayProps = {}) {
  const [hunt, setHunt] = useState<BonusHunt | null>(null);
  const [items, setItems] = useState<BonusHuntItem[]>([]);
  const previousItemIdsRef = useRef<Set<string>>(new Set());
  const currentHuntIdRef = useRef<string | null>(null);

  useEffect(() => {
    loadActiveHunt();

    const huntChannel = supabase
      .channel('bonus_hunt_overlay_channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bonus_hunts' },
        (payload) => {
          if (payload.eventType === 'UPDATE' && currentHuntIdRef.current) {
            const n = payload.new as any;
            const o = payload.old as any;
            if (n.id === currentHuntIdRef.current) {
              // Only reload if overlay-relevant fields changed
              const changed =
                n.show_on_main_overlay !== o.show_on_main_overlay ||
                n.status !== o.status ||
                n.total_invested !== o.total_invested;
              if (changed) {
                setHunt(prev => prev ? { ...prev, ...n } : prev);
              }
              return;
            }
          }
          // INSERT / DELETE / different hunt → full reload
          loadActiveHunt();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bonus_hunt_items' },
        (payload) => {
          if (!currentHuntIdRef.current) return;
          const n = payload.new as any;
          const o = payload.old as any;

          if (payload.eventType === 'UPDATE' && n.hunt_id === currentHuntIdRef.current) {
            // Surgical patch — only update the changed item in-place
            setItems(prev => {
              const idx = prev.findIndex(it => it.id === n.id);
              if (idx < 0) return prev;
              const old = prev[idx];
              // Skip if nothing overlay-relevant changed
              if (old.result_amount === n.result_amount &&
                  old.status === n.status &&
                  old.slot_name === n.slot_name &&
                  old.payment_amount === n.payment_amount &&
                  old.bet_amount === n.bet_amount &&
                  old.is_super_bonus === n.is_super_bonus &&
                  old.is_extreme_bonus === n.is_extreme_bonus &&
                  old.slot_image_url === n.slot_image_url) {
                return prev;
              }
              const copy = [...prev];
              copy[idx] = { ...old, ...n };
              return copy;
            });
            return;
          }

          if (payload.eventType === 'INSERT' && n.hunt_id === currentHuntIdRef.current) {
            // Add new item in order without refetching
            setItems(prev => {
              if (prev.some(it => it.id === n.id)) return prev;
              const next = [...prev, n as BonusHuntItem];
              next.sort((a, b) => a.order_index - b.order_index);
              return next;
            });
            return;
          }

          if (payload.eventType === 'DELETE') {
            const deletedId = o?.id;
            if (deletedId) {
              setItems(prev => {
                const filtered = prev.filter(it => it.id !== deletedId);
                return filtered.length === prev.length ? prev : filtered;
              });
              return;
            }
          }

          // Fallback → full reload
          loadHuntItems(currentHuntIdRef.current);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(huntChannel); };
  }, [huntId]);

  const loadActiveHunt = async () => {
    try {
      let query = supabase.from('bonus_hunts').select('*');
      if (huntId) {
        query = query.eq('id', huntId);
      } else {
        query = query.eq('show_on_main_overlay', true).in('status', ['active', 'opening']).order('created_at', { ascending: false }).limit(1);
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (data) {
        if (huntId && !data.show_on_main_overlay) {
          currentHuntIdRef.current = null;
          setHunt(null);
          setItems([]);
          previousItemIdsRef.current = new Set();
          return;
        }
        currentHuntIdRef.current = data.id;
        setHunt(data);
        loadHuntItems(data.id);
      } else {
        currentHuntIdRef.current = null;
        setHunt(null);
        setItems([]);
        previousItemIdsRef.current = new Set();
      }
    } catch (error) {
      console.error('Error loading hunt:', error);
    }
  };

  const loadHuntItems = async (hId: string) => {
    try {
      const { data, error } = await supabase.from('bonus_hunt_items').select('*').eq('hunt_id', hId).order('order_index', { ascending: true });
      if (error) throw error;
      const newData = data || [];
      previousItemIdsRef.current = new Set(newData.map(item => item.id));
      setItems(newData);
    } catch (error) {
      console.error('Error loading items:', error);
    }
  };

  const config = useMemo<BonusHuntConfig>(() => ({
    startMoney: hunt?.total_invested || 0,
    stopLoss: 0,
    currency: '€',
    bonusOpening: hunt?.status === 'opening',
    bonuses: items.map(item => ({
      id: item.id,
      slotName: item.slot_name,
      slot: { name: item.slot_name, image: item.slot_image_url || '/image.png' },
      betSize: item.payment_amount || item.bet_amount,
      payout: item.result_amount || 0,
      multiplier: item.multiplier,
      opened: item.status === 'opened',
      isSuperBonus: item.is_super_bonus === true,
      isExtremeBonus: item.is_extreme_bonus === true,
    })),
  }), [hunt, items]);

  if (!hunt) return null;

  return (
    <div style={{ width: '288px', height: '720px', position: 'relative', marginTop: '0px', marginLeft: '62px' }}>
      <MemoizedWidget config={config} />
    </div>
  );
}
