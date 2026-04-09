import React, { useMemo, useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import './BonusHuntOverlay.css';

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
   V11 "Fever" Bonus Hunt Widget — EXACT REPLICATION
   ═══════════════════════════════════════════════════════ */
function BonusHuntWidget({ config }: { config: BonusHuntConfig }) {
  const c = config || {};
  const bonuses = c.bonuses || [];
  const currency = c.currency || '€';
  const startMoney = Number(c.startMoney) || 0;
  const stopLoss = Number(c.stopLoss) || 0;

  /* ─── Derived stats ─── */
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

  /* ════════════════════════════════════════════════════════════════
     ██  AUTO-ROTATING CAROUSEL — THIS IS THE KEY PART  ██
     
     carouselIdx is a simple counter that increments every 2.5s.
     It drives which position class each card gets.
     The SAME DOM elements persist — only their className changes.
     CSS transition handles the smooth 3D animation.
     ════════════════════════════════════════════════════════════════ */
  const [carouselIdx, setCarouselIdx] = useState(0);
  useEffect(() => {
    console.log('[BonusHuntWidget] MOUNT — carousel effect. bonuses:', bonuses.length);
    if (bonuses.length < 2) return;
    const id = setInterval(() => setCarouselIdx(i => (i + 1) % bonuses.length), 2500);
    return () => {
      console.log('[BonusHuntWidget] UNMOUNT — clearing carousel interval');
      clearInterval(id);
    };
  }, [bonuses.length]);

  /* ─── Current bonus (first not-opened) ─── */
  const currentBonus = bonuses.find(b => !b.opened);
  const currentIndex = currentBonus ? bonuses.indexOf(currentBonus) : -1;
  const isOpening = !!c.bonusOpening && currentIndex >= 0;

  const huntTitle = c.bonusOpening ? 'BONUS OPENING' : 'BONUS HUNT';

  const rootStyle: React.CSSProperties = {
    fontFamily: "'Inter', sans-serif",
    fontSize: '15px',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  };

  return (
    <div className="bht11" style={rootStyle}>

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

      {/* ═══════════════════════════════════════════════════════════
           4. 3D ROTATING CARD STACK
           
           CRITICAL RULES — DO NOT VIOLATE:
           
           1. ALL bonuses are ALWAYS rendered. No .filter() or .slice().
           2. key={`stk-${bIdx}`} — bIdx is the ARRAY INDEX. NEVER 
              include carouselIdx or any changing value in the key.
           3. Only the className changes between renders. The DOM 
              element stays the same. CSS transition does the rest.
           4. Cards that are far from center get --hidden class 
              (opacity 0), but they STILL EXIST in the DOM.
           
           If you violate any of these rules, cards will TELEPORT
           instead of smoothly animating. The transition ONLY works
           when the same DOM element changes its class attribute.
           ═══════════════════════════════════════════════════════════ */}
      {bonuses.length > 0 && (
        <div className="bht11-stack-section">
          <div className={`bht-stack${!isOpening ? ' bht-stack--spinning' : ''}`}
            style={{ perspective: '1000px', perspectiveOrigin: '50% 50%' }}>
            {(() => {
              const total = bonuses.length;
              if (total === 0) return null;
              const ci = isOpening && currentIndex >= 0 ? currentIndex : carouselIdx % total;
              const posMap: Record<string, string> = {
                '-2': 'bht-stack-card--far-left',
                '-1': 'bht-stack-card--left',
                '0':  'bht-stack-card--center',
                '1':  'bht-stack-card--right',
                '2':  'bht-stack-card--far-right'
              };
              return bonuses.map((bonus, bIdx) => {
                const rawDist = ((bIdx - ci) % total + total) % total;
                const dist = rawDist <= Math.floor(total / 2) ? rawDist : rawDist - total;
                const posCls = posMap[String(dist)] || 'bht-stack-card--hidden';
                return (
                  <div key={`stk-${bIdx}`}
                    className={`bht-stack-card ${posCls}${bonus.opened ? ' bht-stack-card--opened' : ''}${bonus.isSuperBonus ? ' bht-stack-card--super' : ''}${(bonus.isExtremeBonus || bonus.isExtreme) ? ' bht-stack-card--extreme' : ''}`}
                    style={{
                      transition: 'transform 0.8s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.8s cubic-bezier(0.25,0.46,0.45,0.94), filter 0.8s cubic-bezier(0.25,0.46,0.45,0.94), z-index 0s 0.4s',
                      transformStyle: 'preserve-3d',
                      willChange: 'transform, opacity, filter',
                    }}>
                    <div className="bht-stack-card-inner">
                      <div className="bht-stack-card-img-wrap">
                        {bonus.slot?.image ? (
                          <img src={bonus.slot.image} alt={bonus.slotName} className="bht-stack-card-img"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : <div className="bht-stack-card-img-ph" />}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
          {/* ── Progress bar ── */}
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

      {/* ═══ 5. Bonus List Section (Compact style) ═══ */}
      <div className="bht11-list-section">
        <div className="bht11-list-title">
          <span className="bht11-list-title-icon">📋</span>
          <span>BONUS LIST</span>
        </div>
        <div className="bht-bonus-list">
          {(() => {
            const renderCompactCard = (bonus: Bonus, idx: number, key: string | number) => {
              const payout = Number(bonus.payout) || 0;
              const bet = Number(bonus.betSize) || 0;
              const multi = bet > 0 ? payout / bet : 0;
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
                    ) : (
                      <div className="bht-cpt-card-img-ph" />
                    )}
                    {isExtreme && <div className="bht-cpt-blood-drip" />}
                    {isExtreme && <span className="bht-cpt-badge bht-cpt-badge--extreme">EXTREME</span>}
                    {!isExtreme && isSuper && <span className="bht-cpt-badge bht-cpt-badge--super">SUPER</span>}
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

            if (isOpening) {
              const cardH = 140, gap = 6, step = cardH + gap;
              const offset = -(currentIndex * step);
              return (
                <div key="compact-static" className="bht-compact-track bht-compact-track--static"
                  style={{ transform: `translateY(${offset}px)` }}>
                  {bonuses.map((b, i) => renderCompactCard(b, i, b.id || i))}
                </div>
              );
            }
            return (
              <div key="compact-scroll" className="bht-compact-track bht-compact-track--scroll"
                style={{ '--bht-compact-count': bonuses.length } as React.CSSProperties}>
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
   Supabase Data Bridge — fetches from DB and maps
   to the V11 BonusHuntConfig format
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

  const loadHuntItems = async (hId: string) => {
    try {
      const { data, error } = await supabase
        .from('bonus_hunt_items')
        .select('*')
        .eq('hunt_id', hId)
        .order('order_index', { ascending: true });

      if (error) throw error;

      const newData = data || [];
      previousItemIdsRef.current = new Set(newData.map(item => item.id));
      setItems(newData);
    } catch (error) {
      console.error('Error loading items:', error);
    }
  };

  // Map Supabase data → V11 BonusHuntConfig
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
