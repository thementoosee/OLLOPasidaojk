/* ═══════════════════════════════════════════════════════════════
   AvatarModelAdapter — Maps generic bone names to model-specific
   bone names, supporting multiple rig formats (Mixamo, VRM, UE, etc.)
   ═══════════════════════════════════════════════════════════════ */

import type { Object3D } from 'three';
import type { BoneRefs, BoneName, RigPreset } from './types';

/* ── Built-in Rig Presets ── */

const MIXAMO_RIG: RigPreset = {
  name: 'mixamo',
  boneMap: {
    head:          ['mixamorigHead', 'Head'],
    neck:          ['mixamorigNeck', 'Neck'],
    spine:         ['mixamorigSpine1', 'Spine1'],
    upperSpine:    ['mixamorigSpine2', 'Spine2'],
    leftUpperArm:  ['mixamorigLeftArm', 'LeftArm'],
    rightUpperArm: ['mixamorigRightArm', 'RightArm'],
    leftLowerArm:  ['mixamorigLeftForeArm', 'LeftForeArm'],
    rightLowerArm: ['mixamorigRightForeArm', 'RightForeArm'],
    leftHand:      ['mixamorigLeftHand', 'LeftHand'],
    rightHand:     ['mixamorigRightHand', 'RightHand'],
    leftEye:       ['mixamorigLeftEye', 'LeftEye'],
    rightEye:      ['mixamorigRightEye', 'RightEye'],
    hips:          ['mixamorigHips', 'Hips'],
  },
};

const VRM_RIG: RigPreset = {
  name: 'vrm',
  boneMap: {
    head:          ['J_Bip_C_Head', 'head'],
    neck:          ['J_Bip_C_Neck', 'neck'],
    spine:         ['J_Bip_C_Spine', 'spine'],
    upperSpine:    ['J_Bip_C_UpperChest', 'J_Bip_C_Chest', 'chest'],
    leftUpperArm:  ['J_Bip_L_UpperArm', 'leftUpperArm'],
    rightUpperArm: ['J_Bip_R_UpperArm', 'rightUpperArm'],
    leftLowerArm:  ['J_Bip_L_LowerArm', 'leftLowerArm'],
    rightLowerArm: ['J_Bip_R_LowerArm', 'rightLowerArm'],
    leftHand:      ['J_Bip_L_Hand', 'leftHand'],
    rightHand:     ['J_Bip_R_Hand', 'rightHand'],
    leftEye:       ['J_Adj_L_FaceEye', 'leftEye'],
    rightEye:      ['J_Adj_R_FaceEye', 'rightEye'],
    hips:          ['J_Bip_C_Hips', 'hips'],
  },
};

const UE_RIG: RigPreset = {
  name: 'unreal',
  boneMap: {
    head:          ['head', 'Head'],
    neck:          ['neck_01', 'neck_1', 'Neck'],
    spine:         ['spine_02', 'spine_2', 'Spine2'],
    upperSpine:    ['spine_03', 'spine_3', 'Spine3'],
    leftUpperArm:  ['upperarm_l', 'UpperArm_L'],
    rightUpperArm: ['upperarm_r', 'UpperArm_R'],
    leftLowerArm:  ['lowerarm_l', 'LowerArm_L'],
    rightLowerArm: ['lowerarm_r', 'LowerArm_R'],
    leftHand:      ['hand_l', 'Hand_L'],
    rightHand:     ['hand_r', 'Hand_R'],
    leftEye:       ['eye_l', 'Eye_L'],
    rightEye:      ['eye_r', 'Eye_R'],
    hips:          ['pelvis', 'Pelvis'],
  },
};

const PRESETS: RigPreset[] = [MIXAMO_RIG, VRM_RIG, UE_RIG];

/**
 * Traverse a loaded model scene and auto-detect bone mappings.
 * Tries all presets; picks the one with the most bones matched.
 * Falls back to a fuzzy case-insensitive name search.
 */
export function resolveBones(root: Object3D, customPreset?: RigPreset): BoneRefs {
  const allBones: Object3D[] = [];
  root.traverse((child) => {
    if ((child as any).isBone || child.type === 'Bone') {
      allBones.push(child);
    }
  });

  // Also include all named children as fallback for non-skeleton rigs
  const namedNodes = new Map<string, Object3D>();
  root.traverse((child) => {
    if (child.name) namedNodes.set(child.name, child);
  });

  const findByNames = (names: string[]): Object3D | null => {
    for (const n of names) {
      const found = namedNodes.get(n);
      if (found) return found;
    }
    // Fuzzy: case-insensitive partial match
    for (const n of names) {
      const lower = n.toLowerCase();
      for (const [name, obj] of namedNodes) {
        if (name.toLowerCase() === lower) return obj;
      }
    }
    return null;
  };

  const presetsToTry = customPreset ? [customPreset, ...PRESETS] : PRESETS;
  let bestRefs: BoneRefs | null = null;
  let bestScore = -1;

  for (const preset of presetsToTry) {
    const refs = {} as Record<BoneName, Object3D | null>;
    let score = 0;
    for (const [key, names] of Object.entries(preset.boneMap)) {
      const bone = findByNames(names);
      refs[key as BoneName] = bone;
      if (bone) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRefs = refs as BoneRefs;
    }
  }

  return bestRefs || {
    head: null, neck: null, spine: null, upperSpine: null,
    leftUpperArm: null, rightUpperArm: null,
    leftLowerArm: null, rightLowerArm: null,
    leftHand: null, rightHand: null,
    leftEye: null, rightEye: null,
    hips: null,
  };
}

/**
 * Debug: log which bones were found vs. missing.
 */
export function debugBoneMap(refs: BoneRefs): void {
  const found: string[] = [];
  const missing: string[] = [];
  for (const [key, val] of Object.entries(refs)) {
    if (val) found.push(`${key} → ${(val as Object3D).name}`);
    else missing.push(key);
  }
  console.log('[AvatarModelAdapter] Found bones:', found.join(', '));
  if (missing.length) console.warn('[AvatarModelAdapter] Missing bones:', missing.join(', '));
}
