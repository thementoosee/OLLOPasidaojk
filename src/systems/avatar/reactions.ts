/* ═══════════════════════════════════════════════════════════════
   Built-in Reaction Library
   ─────────────────────────────────────────────────────────────────
   Each reaction is a factory function returning a ReactionDef.
   All bone rotations are ADDITIVE via weight-scaled Euler deltas
   so they blend cleanly with the model's rest pose.
   ═══════════════════════════════════════════════════════════════ */

import { AnimationLayer } from './types';
import type { ReactionDef, ReactionContext } from './types';

/* ── Helpers ── */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const DEG = Math.PI / 180;

/* ═══════════════════════════════════════════════════════════════
   1. IDLE — Subtle breathing + body sway
   ═══════════════════════════════════════════════════════════════ */
export function createIdleReaction(): ReactionDef {
  return {
    priority: AnimationLayer.IDLE,
    duration: null, // infinite
    blendIn: 0.8,
    blendOut: 0.5,
    update(ctx: ReactionContext, _t: number, _delta: number) {
      const { bones, weight, elapsedTime: t } = ctx;
      const w = weight;

      // Breathing: spine + upper spine gentle oscillation
      if (bones.spine) {
        bones.spine.rotation.x += Math.sin(t * 1.2) * 0.008 * w;
        bones.spine.rotation.z += Math.sin(t * 0.7) * 0.004 * w;
      }
      if (bones.upperSpine) {
        bones.upperSpine.rotation.x += Math.sin(t * 1.2 + 0.3) * 0.006 * w;
      }

      // Head micro-sway (very subtle, organic feel)
      if (bones.head) {
        bones.head.rotation.y += Math.sin(t * 0.5) * 0.015 * w;
        bones.head.rotation.x += Math.sin(t * 0.8 + 1.0) * 0.008 * w;
        bones.head.rotation.z += Math.sin(t * 0.35 + 2.0) * 0.005 * w;
      }

      // Hips micro-shift
      if (bones.hips) {
        bones.hips.rotation.z += Math.sin(t * 0.4) * 0.003 * w;
      }

      // Arms relax sway
      if (bones.leftUpperArm) {
        bones.leftUpperArm.rotation.z += Math.sin(t * 0.6) * 0.006 * w;
      }
      if (bones.rightUpperArm) {
        bones.rightUpperArm.rotation.z += Math.sin(t * 0.6 + 1.5) * 0.006 * w;
      }
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   2. HEAD TRACKING — Follow card positions smoothly
   ═══════════════════════════════════════════════════════════════ */

/** Smooth head tracking state */
interface TrackingState {
  currentYaw: number;
  currentPitch: number;
  targetYaw: number;
  targetPitch: number;
  velocityYaw: number;
  velocityPitch: number;
}

export function createTrackingReaction(): ReactionDef & { state: TrackingState } {
  const state: TrackingState = {
    currentYaw: 0, currentPitch: 0,
    targetYaw: 0, targetPitch: 0,
    velocityYaw: 0, velocityPitch: 0,
  };

  return {
    priority: AnimationLayer.TRACKING,
    duration: null, // continuous
    blendIn: 0.4,
    blendOut: 0.6,
    state,
    update(ctx: ReactionContext, _t: number, delta: number) {
      const { bones, lookTarget, weight } = ctx;

      // Convert normalised screen position to yaw/pitch angles
      // x: -1 (left) to +1 (right)  → yaw:  +30° to -30°
      // y: -1 (bottom) to +1 (top)  → pitch: -15° to +15°
      state.targetYaw = -lookTarget.x * 30 * DEG;
      state.targetPitch = lookTarget.y * 15 * DEG;

      // Spring-damper smoothing (prevents robotic snapping)
      const spring = 6.0;   // responsiveness
      const damping = 0.82; // decay

      state.velocityYaw += (state.targetYaw - state.currentYaw) * spring * delta;
      state.velocityYaw *= damping;
      state.currentYaw += state.velocityYaw * delta;

      state.velocityPitch += (state.targetPitch - state.currentPitch) * spring * delta;
      state.velocityPitch *= damping;
      state.currentPitch += state.velocityPitch * delta;

      // Clamp to prevent unnatural over-rotation
      state.currentYaw = clamp(state.currentYaw, -35 * DEG, 35 * DEG);
      state.currentPitch = clamp(state.currentPitch, -20 * DEG, 20 * DEG);

      const w = weight;

      // Distribute rotation across neck + head for natural look
      if (bones.neck) {
        bones.neck.rotation.y += state.currentYaw * 0.35 * w;
        bones.neck.rotation.x += state.currentPitch * 0.3 * w;
      }
      if (bones.head) {
        bones.head.rotation.y += state.currentYaw * 0.65 * w;
        bones.head.rotation.x += state.currentPitch * 0.7 * w;
      }

      // Eyes track faster and more aggressively
      const eyeYaw = state.targetYaw * 1.3;
      const eyePitch = state.targetPitch * 1.2;
      if (bones.leftEye) {
        bones.leftEye.rotation.y += eyeYaw * w;
        bones.leftEye.rotation.x += eyePitch * w;
      }
      if (bones.rightEye) {
        bones.rightEye.rotation.y += eyeYaw * w;
        bones.rightEye.rotation.x += eyePitch * w;
      }

      // Subtle spine follow (body turns slightly toward focus)
      if (bones.upperSpine) {
        bones.upperSpine.rotation.y += state.currentYaw * 0.12 * w;
      }
      if (bones.spine) {
        bones.spine.rotation.y += state.currentYaw * 0.06 * w;
      }
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   3. POINT GESTURE — Arm extends toward a card direction
   ═══════════════════════════════════════════════════════════════ */
export function createPointGesture(direction: 'left' | 'right' | 'center'): ReactionDef {
  return {
    priority: AnimationLayer.GESTURE,
    duration: 1.8,
    blendIn: 0.35,
    blendOut: 0.5,
    update(ctx: ReactionContext, t: number, _delta: number) {
      const { bones, weight } = ctx;
      const w = weight;

      // Ease in/out envelope
      const env = t < 0.25 ? smoothstep(t / 0.25) : t > 0.7 ? smoothstep(1 - (t - 0.7) / 0.3) : 1;
      const e = env * w;

      const isLeft = direction === 'left';
      const isCenter = direction === 'center';

      // Choose which arm points (toward the card direction)
      const upperArm = isLeft ? bones.leftUpperArm : bones.rightUpperArm;
      const lowerArm = isLeft ? bones.leftLowerArm : bones.rightLowerArm;
      const hand = isLeft ? bones.leftHand : bones.rightHand;

      if (upperArm) {
        // Raise arm outward and forward
        upperArm.rotation.z += (isLeft ? 60 : -60) * DEG * e;
        upperArm.rotation.x += (isCenter ? -30 : -15) * DEG * e;
        // Add subtle wave motion
        upperArm.rotation.z += Math.sin(t * 8) * 2 * DEG * e;
      }
      if (lowerArm) {
        lowerArm.rotation.x += -30 * DEG * e;
      }
      if (hand) {
        // Point finger orientation
        hand.rotation.z += (isLeft ? 15 : -15) * DEG * e;
      }

      // Slight body lean toward gesture direction
      if (bones.upperSpine) {
        const leanDir = isLeft ? 1 : -1;
        bones.upperSpine.rotation.z += leanDir * 3 * DEG * e;
      }
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   4. LOOK DOWN (card approach) — Avatar looks down at nearby card
   ═══════════════════════════════════════════════════════════════ */
export function createLookDownReaction(): ReactionDef {
  return {
    priority: AnimationLayer.GESTURE,
    duration: 2.0,
    blendIn: 0.3,
    blendOut: 0.5,
    update(ctx: ReactionContext, t: number, _delta: number) {
      const { bones, weight } = ctx;
      const env = t < 0.2 ? smoothstep(t / 0.2) : t > 0.75 ? smoothstep(1 - (t - 0.75) / 0.25) : 1;
      const e = env * weight;

      if (bones.head) {
        bones.head.rotation.x += 20 * DEG * e;
      }
      if (bones.neck) {
        bones.neck.rotation.x += 10 * DEG * e;
      }
      if (bones.upperSpine) {
        bones.upperSpine.rotation.x += 5 * DEG * e;
      }
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   5. CELEBRATION — Arms up, body bounce, head tilt
   ═══════════════════════════════════════════════════════════════ */
export function createCelebrationReaction(intensity: 'small' | 'big' | 'epic' = 'big'): ReactionDef {
  const mult = intensity === 'epic' ? 1.5 : intensity === 'big' ? 1.0 : 0.6;
  const dur = intensity === 'epic' ? 3.5 : intensity === 'big' ? 2.5 : 1.5;

  return {
    priority: AnimationLayer.REACTION,
    duration: dur,
    blendIn: 0.15,
    blendOut: 0.6,
    update(ctx: ReactionContext, t: number, _delta: number) {
      const { bones, weight } = ctx;
      const env = t < 0.1 ? smoothstep(t / 0.1) : t > 0.7 ? smoothstep(1 - (t - 0.7) / 0.3) : 1;
      const e = env * weight * mult;

      // Both arms up!
      if (bones.leftUpperArm) {
        const pump = Math.sin(t * 12) * 8 * DEG;
        bones.leftUpperArm.rotation.z += (75 * DEG + pump) * e;
        bones.leftUpperArm.rotation.x += -20 * DEG * e;
      }
      if (bones.rightUpperArm) {
        const pump = Math.sin(t * 12 + Math.PI) * 8 * DEG;
        bones.rightUpperArm.rotation.z += (-75 * DEG + pump) * e;
        bones.rightUpperArm.rotation.x += -20 * DEG * e;
      }

      // Forearms bent
      if (bones.leftLowerArm) {
        bones.leftLowerArm.rotation.x += -40 * DEG * e;
      }
      if (bones.rightLowerArm) {
        bones.rightLowerArm.rotation.x += -40 * DEG * e;
      }

      // Body bounce
      if (bones.hips) {
        bones.hips.position.y += Math.abs(Math.sin(t * 10)) * 0.02 * e;
      }
      if (bones.spine) {
        bones.spine.rotation.x += Math.sin(t * 10) * 5 * DEG * e;
      }

      // Head happy tilt
      if (bones.head) {
        bones.head.rotation.z += Math.sin(t * 6) * 8 * DEG * e;
        bones.head.rotation.x += -10 * DEG * e; // look up slightly
      }
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   6. SHOCKED / DISAPPOINTED — Hands to head, lean back
   ═══════════════════════════════════════════════════════════════ */
export function createShockedReaction(): ReactionDef {
  return {
    priority: AnimationLayer.REACTION,
    duration: 2.0,
    blendIn: 0.1,
    blendOut: 0.5,
    update(ctx: ReactionContext, t: number, _delta: number) {
      const { bones, weight } = ctx;
      const env = t < 0.08 ? smoothstep(t / 0.08) : t > 0.65 ? smoothstep(1 - (t - 0.65) / 0.35) : 1;
      const e = env * weight;

      // Lean back in shock
      if (bones.spine) {
        bones.spine.rotation.x += -12 * DEG * e;
      }
      if (bones.upperSpine) {
        bones.upperSpine.rotation.x += -8 * DEG * e;
      }

      // Head snaps back then wobbles
      if (bones.head) {
        bones.head.rotation.x += -15 * DEG * e;
        bones.head.rotation.y += Math.sin(t * 14) * 4 * DEG * e * (1 - t);
      }

      // Hands up to face level (shocked gesture)
      if (bones.leftUpperArm) {
        bones.leftUpperArm.rotation.z += 40 * DEG * e;
        bones.leftUpperArm.rotation.x += -25 * DEG * e;
      }
      if (bones.rightUpperArm) {
        bones.rightUpperArm.rotation.z += -40 * DEG * e;
        bones.rightUpperArm.rotation.x += -25 * DEG * e;
      }
      if (bones.leftLowerArm) {
        bones.leftLowerArm.rotation.x += -80 * DEG * e;
      }
      if (bones.rightLowerArm) {
        bones.rightLowerArm.rotation.x += -80 * DEG * e;
      }
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   7. SUSPENSE — Lean forward, hands clasped, tense posture
   ═══════════════════════════════════════════════════════════════ */
export function createSuspenseReaction(): ReactionDef {
  return {
    priority: AnimationLayer.REACTION,
    duration: 3.0,
    blendIn: 0.5,
    blendOut: 0.8,
    update(ctx: ReactionContext, t: number, _delta: number) {
      const { bones, weight, elapsedTime } = ctx;
      const env = t < 0.15 ? smoothstep(t / 0.15) : t > 0.75 ? smoothstep(1 - (t - 0.75) / 0.25) : 1;
      const e = env * weight;

      // Lean forward tensely
      if (bones.spine) {
        bones.spine.rotation.x += 10 * DEG * e;
      }
      if (bones.upperSpine) {
        bones.upperSpine.rotation.x += 8 * DEG * e;
      }

      // Head forward, intense look
      if (bones.head) {
        bones.head.rotation.x += 5 * DEG * e;
        // Tension tremor
        bones.head.rotation.y += Math.sin(elapsedTime * 18) * 1.5 * DEG * e;
      }

      // Arms brought in, tense
      if (bones.leftUpperArm) {
        bones.leftUpperArm.rotation.z += 15 * DEG * e;
        bones.leftUpperArm.rotation.x += -10 * DEG * e;
      }
      if (bones.rightUpperArm) {
        bones.rightUpperArm.rotation.z += -15 * DEG * e;
        bones.rightUpperArm.rotation.x += -10 * DEG * e;
      }
      if (bones.leftLowerArm) {
        bones.leftLowerArm.rotation.x += -50 * DEG * e;
      }
      if (bones.rightLowerArm) {
        bones.rightLowerArm.rotation.x += -50 * DEG * e;
      }
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   8. NOD — Quick acknowledgment when card enters focus
   ═══════════════════════════════════════════════════════════════ */
export function createNodReaction(): ReactionDef {
  return {
    priority: AnimationLayer.GESTURE,
    duration: 0.8,
    blendIn: 0.1,
    blendOut: 0.2,
    update(ctx: ReactionContext, t: number, _delta: number) {
      const { bones, weight } = ctx;
      const nod = Math.sin(t * Math.PI * 2) * (1 - t);
      const e = weight;

      if (bones.head) {
        bones.head.rotation.x += nod * 12 * DEG * e;
      }
      if (bones.neck) {
        bones.neck.rotation.x += nod * 5 * DEG * e;
      }
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   9. LEAN — Subtle posture shift following carousel direction
   ═══════════════════════════════════════════════════════════════ */
export function createLeanReaction(direction: 'left' | 'right'): ReactionDef {
  const dir = direction === 'left' ? 1 : -1;
  return {
    priority: AnimationLayer.TRACKING,
    duration: 1.5,
    blendIn: 0.4,
    blendOut: 0.6,
    update(ctx: ReactionContext, t: number, _delta: number) {
      const { bones, weight } = ctx;
      const env = t < 0.3 ? smoothstep(t / 0.3) : t > 0.6 ? smoothstep(1 - (t - 0.6) / 0.4) : 1;
      const e = env * weight;

      if (bones.spine) {
        bones.spine.rotation.z += dir * 4 * DEG * e;
      }
      if (bones.upperSpine) {
        bones.upperSpine.rotation.z += dir * 3 * DEG * e;
      }
      if (bones.hips) {
        bones.hips.rotation.z += dir * -1.5 * DEG * e;
      }
    },
  };
}
