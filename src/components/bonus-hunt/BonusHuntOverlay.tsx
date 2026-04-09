import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

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

export function BonusHuntOverlay({ huntId, embedded = false }: BonusHuntOverlayProps = {}) {
  const [hunt, setHunt] = useState<BonusHunt | null>(null);
  const [items, setItems] = useState<BonusHuntItem[]>([]);
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());
  const [removedItemIds, setRemovedItemIds] = useState<Set<string>>(new Set());
  const [activeCardIndex, setActiveCardIndex] = useState(0);
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
          console.log('[BonusHuntOverlay] Hunt change:', payload);

          if (payload.eventType === 'UPDATE' && currentHuntIdRef.current) {
            const newRecord = payload.new as any;
            const oldRecord = payload.old as any;

            if (newRecord.id === currentHuntIdRef.current &&
                newRecord.show_on_main_overlay !== oldRecord.show_on_main_overlay) {
              console.log('[BonusHuntOverlay] show_on_main_overlay changed, reloading');
              loadActiveHunt();
              return;
            }
          }

          loadActiveHunt();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bonus_hunt_items' },
        (payload) => {
          console.log('[BonusHuntOverlay] Item change:', payload);
          if (currentHuntIdRef.current) {
            loadHuntItems(currentHuntIdRef.current);
          }
        }
      )
      .subscribe((status) => {
        console.log('[BonusHuntOverlay] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(huntChannel);
    };
  }, [huntId]);

  const loadActiveHunt = async () => {
    try {
      let query = supabase
        .from('bonus_hunts')
        .select('*');

      if (huntId) {
        query = query.eq('id', huntId);
      } else {
        query = query
          .eq('show_on_main_overlay', true)
          .in('status', ['active', 'opening'])
          .order('created_at', { ascending: false })
          .limit(1);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;

      console.log('[BonusHuntOverlay] Hunt loaded:', data);

      if (data) {
        if (huntId && !data.show_on_main_overlay) {
          console.log('[BonusHuntOverlay] Hunt is not active on main overlay, clearing...');
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

  const loadHuntItems = async (huntId: string) => {
    try {
      const { data, error } = await supabase
        .from('bonus_hunt_items')
        .select('*')
        .eq('hunt_id', huntId)
        .order('order_index', { ascending: true });

      if (error) throw error;

      const newData = data || [];
      const newIds = new Set<string>();
      const removedIds = new Set<string>();
      const currentIds = new Set(newData.map(item => item.id));

      newData.forEach(item => {
        if (!previousItemIdsRef.current.has(item.id) && item.status === 'pending') {
          newIds.add(item.id);
        }
      });

      previousItemIdsRef.current.forEach(id => {
        if (!currentIds.has(id)) {
          removedIds.add(id);
        }
      });

      if (newIds.size > 0) {
        setNewItemIds(newIds);
        setTimeout(() => {
          setNewItemIds(new Set());
        }, 800);
      }

      if (removedIds.size > 0) {
        setRemovedItemIds(removedIds);
        setTimeout(() => {
          setRemovedItemIds(new Set());
          previousItemIdsRef.current = new Set(newData.map(item => item.id));
          setItems(newData);
        }, 500);
      } else {
        previousItemIdsRef.current = new Set(newData.map(item => item.id));
        setItems(newData);
      }
    } catch (error) {
      console.error('Error loading items:', error);
    }
  };

  const hasHunt = !!hunt;
  const isOpeningMode = hunt?.status === 'opening';

  const pendingItems = items.filter(item => item.status === 'pending');
  const openedItems = items.filter(item => item.status === 'opened');
  const superBonusCount = items.filter(item => item.is_super_bonus === true).length;
  const extremeBonusCount = items.filter(item => item.is_extreme_bonus === true).length;
  const scrollingItems = items.length > 4 ? [...items, ...items] : items;
  const progressPct = items.length > 0 ? (openedItems.length / items.length) * 100 : 0;

  const breakEvenDisplay = (() => {
    if (!hunt) return '0x';
    if (isOpeningMode) return `${hunt.current_break_even.toFixed(0)}x`;
    const be = hunt.opened_count > 0 ? hunt.current_break_even : hunt.initial_break_even;
    return `${be.toFixed(0)}x`;
  })();

  // Auto-rotate card stack every 2.5s during hunt
  useEffect(() => {
    if (isOpeningMode || items.length <= 1) return;
    const interval = setInterval(() => {
      setActiveCardIndex(prev => (prev + 1) % items.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isOpeningMode, items.length]);

  // During opening, snap to first pending bonus
  useEffect(() => {
    if (!isOpeningMode) return;
    const idx = items.findIndex(item => item.status === 'pending');
    if (idx >= 0) setActiveCardIndex(idx);
  }, [isOpeningMode, items]);

  const currentBonusIndex = isOpeningMode ? items.findIndex(item => item.status === 'pending') : -1;

  return (
    <div className="bht-root" style={{ width: '288px', height: '720px', position: 'relative', marginTop: '0px', marginLeft: '62px' }}>
      <style>{`
        .bht-root {
          --bht-text: #ffffff;
          --bht-muted: #93c5fd;
          --bht-accent: #60a5fa;
          --bht-super: #eab308;
          --bht-extreme: #ef4444;
          --bht-current: #4ade80;
          --bht-card-bg: rgba(15,21,53,0.85);
          --bht-card-border: rgba(96,165,250,0.12);
        }
        .bht-glass-card {
          background: linear-gradient(135deg, rgba(96,165,250,0.12), rgba(59,130,246,0.06));
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-radius: 12px;
          border: 1px solid rgba(96,165,250,0.15);
          padding: 8px 12px;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .bht-glass-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 10%;
          right: 10%;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
        }
        .bht-stat-label {
          display: block;
          font-size: 0.55em;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--bht-muted);
          margin-bottom: 2px;
        }
        .bht-stat-value {
          display: block;
          font-size: 1.2em;
          font-weight: 900;
          color: var(--bht-text);
          text-shadow: 0 0 12px rgba(96,165,250,0.4);
        }
        .bht-count-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          border-radius: 12px;
          padding: 10px 16px;
          font-size: 0.7em;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--bht-text);
          flex: 1;
        }
        .bht-count-super {
          background: rgba(234,179,8,0.12);
          border: 1px solid rgba(234,179,8,0.3);
        }
        .bht-count-extreme {
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.3);
        }
        .bht-count-bonuses {
          background: rgba(96,165,250,0.12);
          border: 1px solid rgba(96,165,250,0.2);
        }
        .bht-stack-wrap {
          display: flex;
          justify-content: center;
          align-items: center;
          position: relative;
          height: 210px;
          perspective: 1000px;
          perspective-origin: 50% 50%;
          margin: 6px 0;
          overflow: visible;
        }
        .bht-stack-card {
          position: absolute;
          width: 120px;
          height: 190px;
          transition: transform 0.8s cubic-bezier(0.25,0.46,0.45,0.94),
                      opacity 0.8s cubic-bezier(0.25,0.46,0.45,0.94),
                      filter 0.8s cubic-bezier(0.25,0.46,0.45,0.94),
                      z-index 0s 0.4s;
          transform-style: preserve-3d;
          will-change: transform, opacity, filter;
        }
        .bht-stack-card--hidden {
          transform: translateX(0) translateZ(-200px) rotateY(0deg) scale(0.4);
          z-index: -1; opacity: 0; pointer-events: none;
          filter: brightness(0.3) blur(3px);
        }
        .bht-stack-card--far-left {
          transform: translateX(-170px) translateZ(-120px) rotateY(35deg) scale(0.65);
          z-index: 0; opacity: 0.3; filter: brightness(0.45) blur(1px);
        }
        .bht-stack-card--left {
          transform: translateX(-95px) translateZ(-50px) rotateY(20deg) scale(0.85);
          z-index: 1; opacity: 0.7; filter: brightness(0.7);
        }
        .bht-stack-card--center {
          transform: translateX(0) translateZ(20px) rotateY(0deg) scale(1);
          z-index: 3; opacity: 1; filter: brightness(1);
        }
        .bht-stack-card--right {
          transform: translateX(95px) translateZ(-50px) rotateY(-20deg) scale(0.85);
          z-index: 1; opacity: 0.7; filter: brightness(0.7);
        }
        .bht-stack-card--far-right {
          transform: translateX(170px) translateZ(-120px) rotateY(-35deg) scale(0.65);
          z-index: 0; opacity: 0.3; filter: brightness(0.45) blur(1px);
        }
        .bht-stack-card-inner {
          width: 100%; height: 100%; border-radius: 12px; overflow: hidden;
          background: rgba(0,0,0,0.55);
          border: 1.5px solid rgba(255,255,255,0.1);
          box-shadow: 0 6px 24px rgba(0,0,0,0.6);
        }
        .bht-stack-card--center .bht-stack-card-inner {
          box-shadow: 0 0 16px rgba(74,222,128,0.35), 0 6px 24px rgba(0,0,0,0.6);
          border-color: rgba(74,222,128,0.4);
        }
        .bht-stack-card-img-wrap {
          width: 100%; height: 100%; overflow: hidden; position: relative;
        }
        .bht-stack-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .bht-stack-name {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(transparent, rgba(0,0,0,0.88));
          padding: 18px 6px 6px;
          text-align: center;
          font-size: 0.55em;
          font-weight: 800;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .bht-stack-border {
          position: absolute;
          inset: 0;
          border-radius: 12px;
          pointer-events: none;
        }
        .bht-stack-border--super {
          border: 2px solid var(--bht-super);
          box-shadow: 0 0 14px rgba(234,179,8,0.35);
        }
        .bht-stack-border--extreme {
          border: 2px solid var(--bht-extreme);
          box-shadow: 0 0 14px rgba(239,68,68,0.35);
        }
        .bht-progress-track {
          height: 4px;
          border-radius: 2px;
          background: rgba(255,255,255,0.08);
          overflow: hidden;
        }
        .bht-progress-fill {
          height: 100%;
          border-radius: 2px;
          background: linear-gradient(90deg, var(--bht-current), #22c55e);
          transition: width 0.7s ease-out;
          box-shadow: 0 0 6px rgba(74,222,128,0.4);
        }
        .bht-list-header {
          font-size: 0.78em;
          font-weight: 900;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: var(--bht-accent);
        }
        .bht-list-container {
          flex: 1 1 0;
          overflow: hidden;
          position: relative;
          padding: 0 12px;
        }
        .bht-list-track {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .bht-cpt-card {
          display: flex;
          align-items: center;
          background: var(--bht-card-bg);
          border: 1px solid var(--bht-card-border);
          border-radius: 10px;
          padding: 5px 8px;
          gap: 8px;
          flex-shrink: 0;
        }
        .bht-cpt-img {
          width: 38px;
          height: 38px;
          border-radius: 6px;
          object-fit: cover;
          flex-shrink: 0;
        }
        .bht-cpt-info {
          flex: 1;
          min-width: 0;
        }
        .bht-cpt-row1 {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 3px;
        }
        .bht-cpt-name {
          font-size: 0.65em;
          font-weight: 800;
          color: var(--bht-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          text-transform: uppercase;
        }
        .bht-cpt-index {
          font-size: 0.6em;
          font-weight: 700;
          color: rgba(255,255,255,0.35);
          flex-shrink: 0;
          margin-left: 4px;
        }
        .bht-cpt-row2 {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .bht-cpt-bet {
          font-size: 0.6em;
          font-weight: 700;
          color: var(--bht-accent);
        }
        .bht-cpt-payout {
          font-size: 0.6em;
          font-weight: 700;
        }
        .bht-cpt-multi {
          font-size: 0.6em;
          font-weight: 700;
          color: #a78bfa;
        }
        @keyframes bhtAutoScroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        @keyframes bhtSlideIn {
          from { opacity: 0; transform: translateX(-100%); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes bhtSlideOut {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(100%); }
        }
      `}</style>

      {hasHunt && (
        <div
          style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(145deg, #0a0e1a 0%, #0f1629 50%, #111d3a 100%)',
            border: '1px solid rgba(96,165,250,0.15)',
            borderRadius: '16px',
          }}
        >
          {/* HEADER */}
          <div style={{ textAlign: 'center', padding: '14px 0 10px', flexShrink: 0 }}>
            <div style={{ fontSize: '1.2em', fontWeight: 900, letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--bht-text)' }}>
              {isOpeningMode ? 'BONUS OPENING' : 'BONUS HUNT'}
            </div>
            <div style={{ fontSize: '0.58em', fontWeight: 700, letterSpacing: '4px', textTransform: 'uppercase', color: 'var(--bht-muted)', opacity: 0.6 }}>
              FEVER
            </div>
          </div>

          {/* STATS ROW */}
          <div style={{ display: 'flex', gap: '6px', padding: '0 12px', marginBottom: '8px', flexShrink: 0 }}>
            <div className="bht-glass-card" style={{ flex: 1 }}>
              <span className="bht-stat-label">START</span>
              <span className="bht-stat-value">€{hunt?.total_invested.toFixed(2)}</span>
            </div>
            <div className="bht-glass-card" style={{ flex: 1 }}>
              <span className="bht-stat-label">BREAKEVEN</span>
              <span className="bht-stat-value">{breakEvenDisplay}</span>
            </div>
          </div>

          {/* COUNT BARS */}
          <div style={{ padding: '0 12px', marginBottom: '6px', flexShrink: 0 }}>
            {(superBonusCount > 0 || extremeBonusCount > 0) && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                {superBonusCount > 0 && (
                  <div className="bht-count-bar bht-count-super">
                    <span>⚡</span><span>SUPER</span><span style={{ marginLeft: 'auto', fontWeight: 900 }}>{superBonusCount}</span>
                  </div>
                )}
                {extremeBonusCount > 0 && (
                  <div className="bht-count-bar bht-count-extreme">
                    <span>🔥</span><span>EXTREME</span><span style={{ marginLeft: 'auto', fontWeight: 900 }}>{extremeBonusCount}</span>
                  </div>
                )}
              </div>
            )}
            <div className="bht-count-bar bht-count-bonuses">
              <span>🎰</span><span>BONUSES</span><span style={{ marginLeft: 'auto', fontWeight: 900 }}>{items.length}</span>
            </div>
          </div>

          {/* 3D CARD STACK — ALL cards always rendered, stable keys, only className changes */}
          <div className="bht-stack-wrap" style={{ flexShrink: 0 }}>
            {items.map((item, bIdx) => {
              const total = items.length;
              const ci = activeCardIndex % total;
              const rawDist = ((bIdx - ci) % total + total) % total;
              const dist = rawDist <= Math.floor(total / 2) ? rawDist : rawDist - total;
              const posMap: Record<string, string> = {
                '-2': 'bht-stack-card--far-left',
                '-1': 'bht-stack-card--left',
                '0':  'bht-stack-card--center',
                '1':  'bht-stack-card--right',
                '2':  'bht-stack-card--far-right',
              };
              const posCls = posMap[String(dist)] || 'bht-stack-card--hidden';
              const isOpened = item.status === 'opened';
              return (
                <div key={`stk-${bIdx}`} className={`bht-stack-card ${posCls}`}>
                  <div className="bht-stack-card-inner">
                    <div className="bht-stack-card-img-wrap">
                      <img
                        src={item.slot_image_url || '/image.png'}
                        alt={item.slot_name}
                        className="bht-stack-img"
                        style={{ filter: isOpened ? 'brightness(0.45)' : 'none' }}
                        onError={(e) => { e.currentTarget.src = '/image.png'; }}
                      />
                      <div className="bht-stack-name">{item.slot_name}</div>
                      {item.is_super_bonus === true && <div className="bht-stack-border bht-stack-border--super" />}
                      {item.is_extreme_bonus === true && <div className="bht-stack-border bht-stack-border--extreme" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* PROGRESS BAR */}
          <div style={{ padding: '6px 16px 8px', flexShrink: 0 }}>
            <div className="bht-progress-track">
              <div className="bht-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {/* BONUS LIST HEADER */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px 6px', flexShrink: 0 }}>
            <span style={{ fontSize: '0.9em' }}>📋</span>
            <span className="bht-list-header">BONUS LIST</span>
          </div>

          {/* BONUS LIST */}
          <div className="bht-list-container">
            <div
              className="bht-list-track"
              style={
                isOpeningMode && currentBonusIndex >= 0
                  ? { transform: `translateY(-${currentBonusIndex * 58}px)`, transition: 'transform 0.5s ease-out' }
                  : items.length > 4
                    ? { animation: `bhtAutoScroll ${Math.max(18, items.length * 3.5)}s linear infinite` }
                    : undefined
              }
            >
              {(isOpeningMode ? items : scrollingItems).map((item, index) => {
                const actualIndex = items.length > 0 ? (index % items.length) : 0;
                const payment = item.payment_amount || item.bet_amount;
                const isOpened = item.status === 'opened';
                const isWin = isOpened && (item.result_amount || 0) > payment;
                const isFirst = index < items.length;
                const isNew = newItemIds.has(item.id) && isFirst;
                const isRemoved = removedItemIds.has(item.id);
                const isCurrent = isOpeningMode && actualIndex === currentBonusIndex;

                return (
                  <div
                    key={`${item.id}-${index}`}
                    className="bht-cpt-card"
                    style={{
                      borderLeft: item.is_super_bonus === true ? '3px solid var(--bht-super)'
                        : item.is_extreme_bonus === true ? '3px solid var(--bht-extreme)'
                        : isCurrent ? '3px solid var(--bht-current)'
                        : '1px solid var(--bht-card-border)',
                      boxShadow: item.is_super_bonus === true ? '0 0 10px rgba(234,179,8,0.2)'
                        : item.is_extreme_bonus === true ? '0 0 10px rgba(239,68,68,0.2)'
                        : isCurrent ? '0 0 10px rgba(74,222,128,0.2)'
                        : 'none',
                      animation: isNew ? 'bhtSlideIn 0.5s ease-out'
                        : isRemoved ? 'bhtSlideOut 0.4s ease-in forwards'
                        : 'none',
                    }}
                  >
                    <img
                      src={item.slot_image_url || '/image.png'}
                      alt={item.slot_name}
                      className="bht-cpt-img"
                      onError={(e) => { e.currentTarget.src = '/image.png'; }}
                    />
                    <div className="bht-cpt-info">
                      <div className="bht-cpt-row1">
                        <span className="bht-cpt-name">{item.slot_name}</span>
                        <span className="bht-cpt-index">#{actualIndex + 1}</span>
                      </div>
                      <div className="bht-cpt-row2">
                        <span className="bht-cpt-bet">€{payment.toFixed(2)}</span>
                        {isOpened && (
                          <>
                            <span className="bht-cpt-payout" style={{ color: isWin ? 'var(--bht-current)' : 'var(--bht-extreme)' }}>
                              €{(item.result_amount || 0).toFixed(0)}
                            </span>
                            <span className="bht-cpt-multi">{(item.multiplier || 0).toFixed(1)}x</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
