/* ═══════════════════════════════════════════════════════════════
   AvatarReactionController — Priority-based animation state machine
   ─────────────────────────────────────────────────────────────────
   Manages concurrent reactions with proper blending, priorities,
   and clean enter/exit lifecycle.

   Priority layers (low → high):
     IDLE(0) → TRACKING(1) → GESTURE(2) → REACTION(3) → TTS(4)

   Higher-priority reactions suppress lower ones but don't cancel them.
   When a higher-priority reaction ends, the lower one resumes.
   ═══════════════════════════════════════════════════════════════ */

import { AnimationLayer } from './types';
import type { BoneRefs, ReactionDef, ReactionContext } from './types';

interface ActiveReaction {
  def: ReactionDef;
  startTime: number;
  weight: number;
  phase: 'blendIn' | 'active' | 'blendOut' | 'done';
}

export class AvatarReactionController {
  private active: ActiveReaction[] = [];
  private bones: BoneRefs | null = null;
  private lookTarget = { x: 0, y: 0 };
  private elapsedTime = 0;

  setBones(bones: BoneRefs): void {
    this.bones = bones;
  }

  setLookTarget(x: number, y: number): void {
    this.lookTarget.x = x;
    this.lookTarget.y = y;
  }

  getLookTarget(): { x: number; y: number } {
    return { ...this.lookTarget };
  }

  /**
   * Push a new reaction onto the stack.
   * If the same priority already has an active reaction, it replaces it.
   */
  play(def: ReactionDef): void {
    // Remove existing reactions at the same priority
    this.active = this.active.filter((r) => {
      if (r.def.priority === def.priority && r.phase !== 'blendOut') {
        r.phase = 'blendOut';
        r.startTime = this.elapsedTime;
      }
      return true;
    });

    const reaction: ActiveReaction = {
      def,
      startTime: this.elapsedTime,
      weight: 0,
      phase: 'blendIn',
    };

    this.active.push(reaction);
    if (this.bones) {
      def.onEnter?.({ bones: this.bones, lookTarget: this.lookTarget, weight: 0, elapsedTime: this.elapsedTime });
    }
  }

  /**
   * Stop a reaction at a specific priority layer.
   */
  stop(priority: AnimationLayer): void {
    for (const r of this.active) {
      if (r.def.priority === priority && r.phase !== 'blendOut' && r.phase !== 'done') {
        r.phase = 'blendOut';
        r.startTime = this.elapsedTime;
      }
    }
  }

  /**
   * Call every frame from useFrame.
   * @param delta - Frame delta time in seconds
   */
  update(delta: number): void {
    if (!this.bones) return;
    this.elapsedTime += delta;

    // Find the highest active priority to suppress lower ones
    let highestActive = -1;
    for (const r of this.active) {
      if (r.phase !== 'done' && r.def.priority > highestActive) {
        highestActive = r.def.priority;
      }
    }

    // Update each reaction
    for (const r of this.active) {
      const age = this.elapsedTime - r.startTime;

      // Phase transitions
      if (r.phase === 'blendIn') {
        r.weight = r.def.blendIn > 0 ? Math.min(1, age / r.def.blendIn) : 1;
        if (r.weight >= 1) {
          r.phase = 'active';
          r.startTime = this.elapsedTime;
        }
      } else if (r.phase === 'active') {
        r.weight = 1;
        if (r.def.duration !== null && age >= r.def.duration) {
          r.phase = 'blendOut';
          r.startTime = this.elapsedTime;
        }
      } else if (r.phase === 'blendOut') {
        r.weight = r.def.blendOut > 0 ? Math.max(0, 1 - age / r.def.blendOut) : 0;
        if (r.weight <= 0) {
          r.phase = 'done';
          r.def.onExit?.({
            bones: this.bones, lookTarget: this.lookTarget,
            weight: 0, elapsedTime: this.elapsedTime,
          });
        }
      }

      // Suppress weight if a higher priority is active
      const suppressed = r.def.priority < highestActive;
      const effectiveWeight = suppressed ? r.weight * 0.15 : r.weight;

      // Compute progress (0..1) within the reaction's duration
      let t = 0;
      if (r.def.duration !== null && r.def.duration > 0) {
        if (r.phase === 'blendIn') t = 0;
        else if (r.phase === 'active') t = age / r.def.duration;
        else if (r.phase === 'blendOut') t = 1;
        else t = 1;
      } else {
        // Infinite duration: t is just a clock
        t = r.phase === 'blendIn' ? 0 : (this.elapsedTime % 100);
      }

      // Call update
      if (r.phase !== 'done' && effectiveWeight > 0.001) {
        const ctx: ReactionContext = {
          bones: this.bones,
          lookTarget: this.lookTarget,
          weight: effectiveWeight,
          elapsedTime: this.elapsedTime,
        };
        r.def.update(ctx, t, delta);
      }
    }

    // Prune done reactions
    this.active = this.active.filter((r) => r.phase !== 'done');
  }

  /** Check if a specific priority layer has an active reaction */
  isPlaying(priority: AnimationLayer): boolean {
    return this.active.some((r) => r.def.priority === priority && r.phase !== 'done');
  }

  /** Clear all reactions immediately */
  clearAll(): void {
    if (this.bones) {
      for (const r of this.active) {
        r.def.onExit?.({
          bones: this.bones, lookTarget: this.lookTarget,
          weight: 0, elapsedTime: this.elapsedTime,
        });
      }
    }
    this.active = [];
  }
}
