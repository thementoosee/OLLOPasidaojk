/* ═══════════════════════════════════════════════════════════════
   Avatar3D — R3F component that loads a GLB humanoid model,
   auto-detects its skeleton, and drives bone-level reactions
   from the AvatarEventBus in real time.

   Features:
   • Loads any humanoid GLB/GLTF via URL
   • Auto-detects bone rig (Mixamo / VRM / UE / custom)
   • Saves & restores bone rest poses each frame to keep
     reactions additive and conflict-free
   • Wires carousel events → reaction controller → bone IK
   • Head/eye smooth tracking toward focused cards
   • Contextual gestures, celebrations, shock, suspense
   ═══════════════════════════════════════════════════════════════ */

import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

import { avatarEvents } from '../../systems/avatar/AvatarEventBus';
import { AvatarReactionController } from '../../systems/avatar/AvatarReactionController';
import { resolveBones, debugBoneMap } from '../../systems/avatar/AvatarModelAdapter';
import {
  createIdleReaction,
  createTrackingReaction,
  createPointGesture,
  createLookDownReaction,
  createCelebrationReaction,
  createShockedReaction,
  createSuspenseReaction,
  createNodReaction,
  createLeanReaction,
} from '../../systems/avatar/reactions';
import type { BoneRefs, CardPosition } from '../../systems/avatar/types';

interface Avatar3DProps {
  /** URL to a humanoid GLB/GLTF model */
  modelUrl: string;
  /** Scale multiplier (default 1) */
  scale?: number;
  /** Position offset [x, y, z] */
  position?: [number, number, number];
  /** Rotation offset in radians [x, y, z] */
  rotation?: [number, number, number];
  /** Show debug skeleton helper */
  debug?: boolean;
}

/* ── Euler snapshot for rest-pose save/restore ── */
interface EulerSnapshot { x: number; y: number; z: number }

function saveRestPose(bones: BoneRefs): Map<THREE.Object3D, EulerSnapshot> {
  const map = new Map<THREE.Object3D, EulerSnapshot>();
  for (const bone of Object.values(bones)) {
    if (bone) {
      map.set(bone, { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z });
    }
  }
  return map;
}

function restoreRestPose(map: Map<THREE.Object3D, EulerSnapshot>): void {
  for (const [bone, snap] of map) {
    bone.rotation.x = snap.x;
    bone.rotation.y = snap.y;
    bone.rotation.z = snap.z;
  }
}

export default function Avatar3D({
  modelUrl,
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  debug = false,
}: Avatar3DProps) {
  const { scene } = useGLTF(modelUrl);
  const groupRef = useRef<THREE.Group>(null);
  const bonesRef = useRef<BoneRefs | null>(null);
  const restPoseRef = useRef<Map<THREE.Object3D, EulerSnapshot>>(new Map());
  const controllerRef = useRef<AvatarReactionController>(new AvatarReactionController());

  // Persistent tracking reaction (continuous, not re-created)
  const trackingReaction = useMemo(() => createTrackingReaction(), []);

  // Clone the scene so multiple instances don't share bones
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    // Re-bind skinned meshes to cloned skeleton
    clone.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        const mesh = child as THREE.SkinnedMesh;
        mesh.frustumCulled = false;
      }
    });
    return clone;
  }, [scene]);

  /* ── Initialise bones + controller ── */
  useEffect(() => {
    const bones = resolveBones(clonedScene);
    bonesRef.current = bones;
    if (debug) debugBoneMap(bones);

    // Capture the model's original rest pose
    restPoseRef.current = saveRestPose(bones);

    const ctrl = controllerRef.current;
    ctrl.setBones(bones);

    // Start idle + tracking as base layers
    ctrl.play(createIdleReaction());
    ctrl.play(trackingReaction);

    return () => { ctrl.clearAll(); };
  }, [clonedScene, debug, trackingReaction]);

  /* ── Wire up event bus → reactions ── */
  useEffect(() => {
    const ctrl = controllerRef.current;
    const unsubs: (() => void)[] = [];

    // Card focused → update look target + nod
    unsubs.push(avatarEvents.on('cardFocused', ({ position }) => {
      ctrl.setLookTarget(position.x, position.y);
      // Small nod when a new card enters focus
      ctrl.play(createNodReaction());
    }));

    // Card moved → lean body in movement direction
    unsubs.push(avatarEvents.on('cardMoved', ({ direction }) => {
      ctrl.play(createLeanReaction(direction));
    }));

    // Card opened → point at it + look down
    unsubs.push(avatarEvents.on('cardOpened', ({ index, multiplier }) => {
      const dir = index <= 0 ? 'left' : 'right';
      ctrl.play(createPointGesture(dir));
      ctrl.play(createLookDownReaction());

      // If it's a big win, trigger celebration after a beat
      if (multiplier && multiplier >= 50) {
        setTimeout(() => {
          const intensity = multiplier >= 200 ? 'epic' : multiplier >= 100 ? 'big' : 'small';
          ctrl.play(createCelebrationReaction(intensity));
        }, 600);
      }
    }));

    // Big win → epic celebration
    unsubs.push(avatarEvents.on('bigWin', ({ multiplier }) => {
      const intensity = multiplier >= 500 ? 'epic' : multiplier >= 100 ? 'big' : 'small';
      ctrl.play(createCelebrationReaction(intensity));
    }));

    // Rare pull → shocked reaction
    unsubs.push(avatarEvents.on('rarePull', () => {
      ctrl.play(createShockedReaction());
    }));

    // Suspense moment → tense posture
    unsubs.push(avatarEvents.on('suspenseMoment', () => {
      ctrl.play(createSuspenseReaction());
    }));

    // Carousel idle → relax look target to center
    unsubs.push(avatarEvents.on('carouselIdle', () => {
      ctrl.setLookTarget(0, 0);
    }));

    return () => { unsubs.forEach((u) => u()); };
  }, []);

  /* ── Render loop: restore rest pose → run reactions ── */
  useFrame((_state, delta) => {
    const ctrl = controllerRef.current;
    if (!bonesRef.current) return;

    // Clamp delta to prevent huge jumps after tab-switch
    const dt = Math.min(delta, 0.1);

    // Restore all bones to their rest pose before applying reactions
    // This keeps every reaction additive from the base pose
    restoreRestPose(restPoseRef.current);

    // Run all active reactions (they add rotations on top of rest pose)
    ctrl.update(dt);
  });

  return (
    <group
      ref={groupRef}
      scale={scale}
      position={position}
      rotation={rotation}
    >
      <primitive object={clonedScene} />
    </group>
  );
}
