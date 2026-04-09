/* ═══════════════════════════════════════════════════════════════
   Avatar System — Type Definitions
   ═══════════════════════════════════════════════════════════════ */
import type { Object3D } from 'three';

/* ── Event Types ── */

export interface CardPosition {
  /** Normalised X position: -1 (far left) to +1 (far right) */
  x: number;
  /** Normalised Y position: -1 (bottom) to +1 (top) */
  y: number;
  /** Distance offset from center: 0 = center, ±1 = adjacent, ±2 = far */
  offset: number;
}

export interface AvatarEventMap {
  cardFocused: { index: number; position: CardPosition; slotName?: string };
  cardMoved: { direction: 'left' | 'right'; fromIndex: number; toIndex: number; velocity: number };
  cardOpened: { index: number; slotName?: string; multiplier?: number };
  bigWin: { multiplier: number; amount: number };
  rarePull: { slotName?: string; type: 'super' | 'extreme' };
  suspenseMoment: { type: 'opening' | 'nearBigWin' | 'lastBonus' };
  carouselIdle: {};
  /** External trigger for custom reactions */
  customReaction: { name: string; data?: unknown };
}

export type AvatarEventName = keyof AvatarEventMap;

/* ── Animation Priority Layers ── */

export enum AnimationLayer {
  IDLE = 0,
  TRACKING = 1,
  GESTURE = 2,
  REACTION = 3,
  TTS = 4,
}

/* ── Bone Abstractions ── */

export interface BoneRefs {
  head: Object3D | null;
  neck: Object3D | null;
  spine: Object3D | null;
  upperSpine: Object3D | null;
  leftUpperArm: Object3D | null;
  rightUpperArm: Object3D | null;
  leftLowerArm: Object3D | null;
  rightLowerArm: Object3D | null;
  leftHand: Object3D | null;
  rightHand: Object3D | null;
  leftEye: Object3D | null;
  rightEye: Object3D | null;
  hips: Object3D | null;
}

export type BoneName = keyof BoneRefs;

/* ── Model Rig Preset ── */

export interface RigPreset {
  name: string;
  boneMap: Record<BoneName, string[]>;
}

/* ── Reaction Definition ── */

export interface ReactionDef {
  priority: AnimationLayer;
  /** Duration in seconds; null = until manually stopped */
  duration: number | null;
  /** Blend-in time in seconds */
  blendIn: number;
  /** Blend-out time in seconds */
  blendOut: number;
  /** Update callback called every frame; t = 0..1 progress within duration */
  update: (ctx: ReactionContext, t: number, delta: number) => void;
  /** Called when this reaction starts */
  onEnter?: (ctx: ReactionContext) => void;
  /** Called when this reaction ends */
  onExit?: (ctx: ReactionContext) => void;
}

export interface ReactionContext {
  bones: BoneRefs;
  /** The current look-at target in normalised screen coords */
  lookTarget: { x: number; y: number };
  /** Current blend weight of this reaction (0..1 including blend in/out) */
  weight: number;
  /** Time since overlay started */
  elapsedTime: number;
}
