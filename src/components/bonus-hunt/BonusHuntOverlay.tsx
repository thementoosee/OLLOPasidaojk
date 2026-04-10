import React, { useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { calculateBE, calculateLiveBE, calculateTotalBetAll } from '../../lib/breakEvenCalculations';
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
  originalBet?: number;
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
  initialBE?: number;
  liveBE?: number;
}

interface BonusHuntConfig {
  bonuses?: Bonus[];
  currency?: string;
  startMoney?: number;
  stopLoss?: number;
  bonusOpening?: boolean;
  initialBE?: number;
  liveBE?: number;
}

/* ═══════════════════════════════════════════════════════
   Best/Worst Slot Cards — Premium 3D card animation system
   ───────────────────────────────────────────────────────
   Uses Web Animations API for GPU-accelerated, zero-rerender
   animation sequencing. The card slides out from behind the
   container, pauses, flips to reveal stats, then retracts.
   ═══════════════════════════════════════════════════════ */
interface BestWorstCardData {
  type: 'best' | 'worst';
  slotName: string;
  multiplier: number;
  payout: number;
  betSize: number;
  image: string;
}

function BestWorstCards({ best, worst, currency }: { best: BestWorstCardData; worst: BestWorstCardData; currency: string }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const flipperRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef(true);
  const cycleIdRef = useRef(0);

  /* ── Keep latest data in refs so the loop never restarts ── */
  const bestRef = useRef(best);
  const worstRef = useRef(worst);
  const currencyRef = useRef(currency);
  bestRef.current = best;
  worstRef.current = worst;
  currencyRef.current = currency;

  /* ── Timing constants (ms) ── */
  const SLIDE_DUR   = 1200;
  const FLIP_DUR    = 800;
  const PAUSE_IMAGE = 5000;   // show image face
  const PAUSE_INFO  = 5000;   // show info face after flip
  const PAUSE_BETWEEN = 5000; // hidden gap between best → worst
  const PAUSE_LOOP  = 15000;  // hidden gap after worst before restarting
  const INITIAL_DELAY = 4000; // first appearance delay

  /* ── Premium easing curves ── */
  const EASE_SLIDE_IN  = 'cubic-bezier(0.16, 1, 0.3, 1)';    // fast start, soft land
  const EASE_SLIDE_OUT = 'cubic-bezier(0.7, 0, 0.84, 0)';     // slow start, fast exit
  const EASE_FLIP      = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'; // smooth mid-weight

  /* ── Helper: promisified delay ── */
  const wait = (ms: number, id: number) =>
    new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        if (cycleIdRef.current !== id) reject('cancelled');
        else resolve();
      }, ms);
    });

  /* ── Helper: run a WAAPI animation and resolve when done ── */
  const animate = (
    el: HTMLElement,
    keyframes: Keyframe[],
    opts: KeyframeAnimationOptions,
    id: number
  ) =>
    new Promise<void>((resolve, reject) => {
      if (cycleIdRef.current !== id) { reject('cancelled'); return; }
      let finished = false;
      const anim = el.animate(keyframes, opts);
      anim.onfinish = () => {
        finished = true;
        if (cycleIdRef.current !== id) { reject('cancelled'); return; }
        // Commit final frame to inline styles
        const last = keyframes[keyframes.length - 1];
        Object.entries(last).forEach(([k, v]) => {
          el.style.setProperty(k.replace(/([A-Z])/g, '-$1').toLowerCase(), v as string);
        });
        // Remove fill:forwards so it doesn't override future inline style changes
        anim.cancel();
        resolve();
      };
      anim.oncancel = () => { if (!finished) reject('cancelled'); };
    });

  /* ── Single slot sequence: slide down → pause → flip → pause → slide up ── */
  const playSlot = async (data: BestWorstCardData, id: number) => {
    const card = cardRef.current!;
    const flipper = flipperRef.current!;
    const anchor = anchorRef.current!;

    // --- Populate card faces ---
    const frontImg = anchor.querySelector<HTMLImageElement>('.bht-bw-face--front .bht-bw-img');
    const backBadge = anchor.querySelector<HTMLElement>('.bht-bw-back-badge');
    const backWinVal = anchor.querySelector<HTMLElement>('.bht-bw-back-win-val');
    const backWinLabel = anchor.querySelector<HTMLElement>('.bht-bw-back-win-label');
    const backMultiVal = anchor.querySelector<HTMLElement>('.bht-bw-back-multi-val');
    const backMultiLabel = anchor.querySelector<HTMLElement>('.bht-bw-back-multi-label');
    const backBetVal = anchor.querySelector<HTMLElement>('.bht-bw-back-bet-val');
    const frontInner = anchor.querySelector<HTMLElement>('.bht-bw-face--front .bht-stack-card-inner');
    const backInner = anchor.querySelector<HTMLElement>('.bht-bw-face--back .bht-bw-stats-panel');

    if (frontImg) { frontImg.src = data.image; frontImg.alt = data.slotName; frontImg.style.display = 'block'; }
    const isBest = data.type === 'best';
    if (backBadge) {
      backBadge.textContent = isBest ? '★ BEST SLOT' : '▼ WORST SLOT';
      backBadge.className = `bht-bw-stats-badge bht-bw-back-badge bht-bw-stats-badge--${data.type}`;
    }
    if (backWinVal) backWinVal.textContent = `${currencyRef.current}${data.payout.toFixed(2)}`;
    if (backWinLabel) backWinLabel.textContent = isBest ? 'BEST WIN' : 'WORST WIN';
    if (backMultiVal) backMultiVal.textContent = `${data.multiplier.toFixed(1)}x`;
    if (backMultiLabel) backMultiLabel.textContent = isBest ? 'BEST MULTI' : 'WORST MULTI';
    if (backBetVal) backBetVal.textContent = `${currencyRef.current}${data.betSize.toFixed(2)}`;

    // Set glow based on type
    const glowColor = isBest ? '74, 222, 128' : '239, 68, 68';
    if (frontInner) {
      frontInner.style.borderColor = `rgba(${glowColor}, 0.5)`;
      frontInner.style.boxShadow = `0 6px 24px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 14px 3px rgba(${glowColor}, 0.35), 0 0 30px 6px rgba(${glowColor}, 0.12)`;
    }
    if (backInner) {
      backInner.style.borderColor = `rgba(${glowColor}, 0.5)`;
      backInner.style.boxShadow = `0 6px 24px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 14px 3px rgba(${glowColor}, 0.35), 0 0 30px 6px rgba(${glowColor}, 0.12)`;
    }

    // Reset flipper to 0 rotation (front face showing)
    flipper.style.transform = 'rotateY(0deg)';

    // 1. Slide card down into view
    await animate(card, [
      { transform: 'translateY(0%)', opacity: '0' },
      { transform: 'translateY(15%)', opacity: '1', offset: 0.2 },
      { transform: 'translateY(calc(100% + 10px))', opacity: '1' },
    ], { duration: SLIDE_DUR, easing: EASE_SLIDE_IN, fill: 'forwards' }, id);

    // 2. Pause — show the image face
    await wait(PAUSE_IMAGE, id);

    // 3. Flip to reveal stats
    await animate(flipper, [
      { transform: 'rotateY(0deg)' },
      { transform: 'rotateY(180deg)' },
    ], { duration: FLIP_DUR, easing: EASE_FLIP, fill: 'forwards' }, id);

    // 4. Pause — show the info face
    await wait(PAUSE_INFO, id);

    // 5. Slide card back up behind container
    await animate(card, [
      { transform: 'translateY(calc(100% + 10px))', opacity: '1' },
      { transform: 'translateY(15%)', opacity: '1', offset: 0.8 },
      { transform: 'translateY(0%)', opacity: '0' },
    ], { duration: SLIDE_DUR, easing: EASE_SLIDE_OUT, fill: 'forwards' }, id);
  };

  /* ── Main animation loop ── */
  useEffect(() => {
    runningRef.current = true;
    const id = ++cycleIdRef.current;

    const loop = async () => {
      try {
        await wait(INITIAL_DELAY, id);

        while (runningRef.current && cycleIdRef.current === id) {
          // Best slot sequence — read from ref for latest data
          await playSlot(bestRef.current, id);

          // 5s hidden — preload worst image
          await wait(PAUSE_BETWEEN, id);

          // Worst slot sequence — read from ref for latest data
          await playSlot(worstRef.current, id);

          // 15s hidden before loop restarts
          await wait(PAUSE_LOOP, id);
        }
      } catch {
        // cancelled — clean exit
      }
    };

    loop();

    return () => {
      runningRef.current = false;
      cycleIdRef.current++;
    };
  // Run loop once on mount — data is read from refs so it's always fresh
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Static JSX — content is mutated via DOM refs, no re-renders ── */
  return (
    <div className="bht-bw-anchor" ref={anchorRef}>
      <div className="bht-bw-flipcard" ref={cardRef} style={{ transform: 'translateY(0%)', opacity: 0 }}>
        <div className="bht-bw-flipper" ref={flipperRef}>
          {/* Front face: slot image only */}
          <div className="bht-bw-face bht-bw-face--front">
            <div className="bht-stack-card-inner">
              <div className="bht-stack-card-img-wrap">
                <img alt="" className="bht-stack-card-img bht-bw-img" style={{ display: 'none' }} />
              </div>
            </div>
          </div>
          {/* Back face: stats panel (no image, dark card with rows) */}
          <div className="bht-bw-face bht-bw-face--back">
            <div className="bht-bw-stats-panel">
              <span className="bht-bw-stats-badge bht-bw-back-badge"></span>
              <div className="bht-bw-stats-row">
                <span className="bht-bw-stats-icon">🏆</span>
                <div className="bht-bw-stats-text">
                  <span className="bht-bw-stats-value bht-bw-back-win-val"></span>
                  <span className="bht-bw-stats-label bht-bw-back-win-label">BEST WIN</span>
                </div>
              </div>
              <div className="bht-bw-stats-row">
                <span className="bht-bw-stats-icon">📊</span>
                <div className="bht-bw-stats-text">
                  <span className="bht-bw-stats-value bht-bw-back-multi-val"></span>
                  <span className="bht-bw-stats-label bht-bw-back-multi-label">BEST MULTI</span>
                </div>
              </div>
              <div className="bht-bw-stats-row">
                <span className="bht-bw-stats-icon">💰</span>
                <div className="bht-bw-stats-text">
                  <span className="bht-bw-stats-value bht-bw-back-bet-val"></span>
                  <span className="bht-bw-stats-label">BET SIZE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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

  /* ── Deferred visual mode: only swaps while widget is off-screen ── */
  const [visualMode, setVisualMode] = useState(!!c.bonusOpening);
  const isOpening = visualMode && currentIndex >= 0;
  const huntTitle = visualMode ? 'BONUS OPENING' : 'BONUS HUNT';

  /* ── Mode transition animation (hunt ↔ opening) ── */
  const widgetContentRef = useRef<HTMLDivElement>(null);
  const prevModeRef = useRef(!!c.bonusOpening);
  useEffect(() => {
    const isOpeningNow = !!c.bonusOpening;
    if (prevModeRef.current === isOpeningNow) return;
    prevModeRef.current = isOpeningNow;
    const el = widgetContentRef.current;
    if (!el) return;
    // Slide out — keep old layout visible during exit
    const slideOut = el.animate([
      { transform: 'translateX(0)', opacity: 1 },
      { transform: 'translateX(-110%)', opacity: 0 },
    ], { duration: 1100, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' });
    slideOut.onfinish = () => {
      // Commit off-screen position to inline styles, then kill the animation
      el.style.transform = 'translateX(-110%)';
      el.style.opacity = '0';
      slideOut.cancel();
      // Now fully off-screen — safe to swap layout
      setVisualMode(isOpeningNow);
      setTimeout(() => {
        const slideIn = el.animate([
          { transform: 'translateX(-110%)', opacity: 0 },
          { transform: 'translateX(0)', opacity: 1 },
        ], { duration: 1800, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
        slideIn.onfinish = () => { slideIn.cancel(); el.style.transform = ''; el.style.opacity = ''; };
      }, 200);
    };
  }, [c.bonusOpening]);

  const stats = useMemo(() => {
    const totalBetAll = bonuses.reduce((s, b) => s + (Number(b.originalBet) || Number(b.betSize) || 0), 0);
    const openedBonuses = bonuses.filter(b => b.opened);
    const totalWin = openedBonuses.reduce((s, b) => s + (Number(b.payout) || 0), 0);
    const superCount = bonuses.filter(b => b.isSuperBonus).length;
    const extremeCount = bonuses.filter(b => b.isExtremeBonus || b.isExtreme).length;
    const target = Math.max(startMoney - stopLoss, 0);
    const breakEven = totalBetAll > 0 ? target / totalBetAll : 0;
    const remaining = Math.max(target - totalWin, 0);
    const costPerBonus = bonuses.length > 0 ? totalBetAll / bonuses.length : 0;
    const remainingCount = bonuses.filter(b => !b.opened).length;
    const totalBetRemaining = remainingCount * costPerBonus;
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
        root.querySelectorAll<HTMLElement>('.bht-cpt-card--super .bht-cpt-card-img').forEach(img => {
          // Pulse the image only (scale breathe), keep static glow
          const p = (Math.sin(t * 2.1) + 1) / 2; // 0→1 ~3s
          const s = 1 + p * 0.025; // scale 1.0 → 1.025
          img.style.transform = `scale(${s})`;
        });
        root.querySelectorAll<HTMLElement>('.bht-cpt-card--extreme .bht-cpt-card-img').forEach(img => {
          // Slower, smoother trill on image only
          const vx = Math.sin(t * 18) * 0.7;
          const vy = Math.cos(t * 23) * 0.5;
          img.style.transform = `translate(${vx}px, ${vy}px)`;
        });
        // Reset transform on the card itself so the box doesn't move/scale
        root.querySelectorAll<HTMLElement>('.bht-cpt-card--super, .bht-cpt-card--extreme').forEach(card => {
          card.style.transform = '';
        });
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={`bht11${visualMode ? ' bht11--opening' : ''}`} ref={widgetContentRef} style={{ fontFamily: "'Inter', sans-serif", fontSize: '15px', width: '100%', height: '100%', overflow: 'visible' }}>

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
        <div className="bht11-stat-card bht11-stat-card--be">
          <div className="bht11-be-slide bht11-be-slide--a">
            <span className="bht11-stat-card-label">INICIAL BE</span>
            <span className="bht11-stat-card-value">{(c.initialBE || 0).toFixed(1)}x</span>
          </div>
          <div className="bht11-be-slide bht11-be-slide--b">
            <span className="bht11-stat-card-label">ACTUAL BE</span>
            <span className="bht11-stat-card-value">{(c.liveBE || 0).toFixed(1)}x</span>
          </div>
        </div>
      </div>

      {/* ═══ 3. Counts ═══ */}
      <div className="bht11-counts-col">
        <div className="bht11-count-bar-row">
          <div className="bht11-count-bar bht11-count-bar--super">
            <span className="bht11-count-bar-icon">⚡</span>
            <span className="bht11-count-bar-label">SUPER</span>
            <span className="bht11-count-bar-value">{stats.superCount}</span>
          </div>
          <div className="bht11-count-bar bht11-count-bar--extreme">
            <span className="bht11-count-bar-icon">🔥</span>
            <span className="bht11-count-bar-label">EXTREME</span>
            <span className="bht11-count-bar-value">{stats.extremeCount}</span>
          </div>
        </div>
        {!c.bonusOpening && (
          <div className="bht11-count-bar">
            <span className="bht11-count-bar-icon">🎁</span>
            <span className="bht11-count-bar-label">BONUSES</span>
            <span className="bht11-count-bar-value">{bonuses.length}</span>
          </div>
        )}
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
              const bet = Number(bonus.originalBet) || Number(bonus.betSize) || 0;
              const multi = bonus.multiplier != null ? bonus.multiplier : (bet > 0 ? payout / bet : 0);
              const isExtreme = bonus.isExtremeBonus || bonus.isExtreme;
              const isSuper = bonus.isSuperBonus;
              return (
                <div key={key}
                  className={`bht-cpt-card${idx === currentIndex ? ' bht-cpt-card--active' : ''}${bonus.opened ? ' bht-cpt-card--opened' : ''}${isSuper ? ' bht-cpt-card--super' : ''}${isExtreme ? ' bht-cpt-card--extreme' : ''}`}
                  style={{ position: 'relative' }}>
                  <div className="bht-cpt-card-img-wrap">
                    {bonus.slot?.image ? (
                      <img src={bonus.slot.image} alt={bonus.slotName}
                        className="bht-cpt-card-img"
                        onError={(e) => { const t = e.target as HTMLImageElement; t.src = ''; t.style.display = 'none'; }} />
                    ) : <div className="bht-cpt-card-img-ph" />}
                  </div>
                  <span className="bht-cpt-card-corner bht-cpt-card-corner--tl" style={{ position: 'absolute', top: 0, left: 0, zIndex: 3 }}>{currency}{payout.toFixed(2)}</span>
                  <span className="bht-cpt-card-corner bht-cpt-card-corner--tr" style={{ position: 'absolute', top: 0, right: 0, zIndex: 3 }}>{multi.toFixed(1)}x</span>
                  <div className="bht-cpt-card-info" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', padding: '0 6px', zIndex: 2 }}>
                    <span className="bht-cpt-card-bet-lbl">{currency}{bet.toFixed(2)}</span>
                    <span className="bht-cpt-card-name" style={{ flex: 1, textAlign: 'center', fontWeight: 900 }}>{bonus.slotName || bonus.slot?.name}</span>
                    <span className="bht-cpt-card-idx-lbl">#{idx + 1}</span>
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

      {/* ═══ 7. Best/Worst Slot Cards ═══ */}
      {(() => {
        if (!isOpening) return null;
        const openedBonuses = bonuses.filter(b => b.opened && (Number(b.payout) || 0) > 0);
        if (openedBonuses.length < 2) return null;

        const best = openedBonuses.reduce((a, b) => {
          const aMulti = a.multiplier ?? ((Number(a.payout) || 0) / (Number(a.originalBet) || Number(a.betSize) || 1));
          const bMulti = b.multiplier ?? ((Number(b.payout) || 0) / (Number(b.originalBet) || Number(b.betSize) || 1));
          return bMulti > aMulti ? b : a;
        });
        const worst = openedBonuses.reduce((a, b) => {
          const aMulti = a.multiplier ?? ((Number(a.payout) || 0) / (Number(a.originalBet) || Number(a.betSize) || 1));
          const bMulti = b.multiplier ?? ((Number(b.payout) || 0) / (Number(b.originalBet) || Number(b.betSize) || 1));
          return bMulti < aMulti ? b : a;
        });

        const bestBet = Number(best.originalBet) || Number(best.betSize) || 0;
        const bestPayout = Number(best.payout) || 0;
        const bestMulti = best.multiplier ?? (bestBet > 0 ? bestPayout / bestBet : 0);

        const worstBet = Number(worst.originalBet) || Number(worst.betSize) || 0;
        const worstPayout = Number(worst.payout) || 0;
        const worstMulti = worst.multiplier ?? (worstBet > 0 ? worstPayout / worstBet : 0);

        return (
          <BestWorstCards
            currency={currency}
            best={{ type: 'best', slotName: best.slotName || best.slot?.name || '???', multiplier: bestMulti, payout: bestPayout, betSize: bestBet, image: best.slot?.image || '' }}
            worst={{ type: 'worst', slotName: worst.slotName || worst.slot?.name || '???', multiplier: worstMulti, payout: worstPayout, betSize: worstBet, image: worst.slot?.image || '' }}
          />
        );
      })()}
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
                n.total_invested !== o.total_invested ||
                n.initial_break_even !== o.initial_break_even ||
                n.current_break_even !== o.current_break_even;
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
    initialBE: calculateBE(hunt?.total_invested || 0, calculateTotalBetAll(items)),
    liveBE: calculateLiveBE(items, hunt?.total_invested || 0),
    bonuses: items.map(item => ({
      id: item.id,
      slotName: item.slot_name,
      slot: { name: item.slot_name, image: item.slot_image_url || '/image.png' },
      betSize: item.payment_amount || item.bet_amount,
      originalBet: item.bet_amount,
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
