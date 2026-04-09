/* ═══════════════════════════════════════════════════════════════
   AvatarCanvas — R3F Canvas wrapper for embedding the 3D avatar
   into the DOM overlay layout.

   Drop this anywhere in the component tree:
     <AvatarCanvas modelUrl="/models/character.glb" />

   The canvas is transparent (alpha) so it composites over the
   2D overlay below it.
   ═══════════════════════════════════════════════════════════════ */

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import Avatar3D from './Avatar3D';

interface AvatarCanvasProps {
  /** URL to a humanoid GLB/GLTF model */
  modelUrl: string;
  /** CSS width (default '100%') */
  width?: string;
  /** CSS height (default '100%') */
  height?: string;
  /** Model scale (default 1) */
  scale?: number;
  /** Model position [x, y, z] */
  position?: [number, number, number];
  /** Model rotation [x, y, z] radians */
  rotation?: [number, number, number];
  /** Camera field of view (default 35) */
  fov?: number;
  /** Camera position [x, y, z] (default [0, 1.2, 3]) */
  cameraPosition?: [number, number, number];
  /** Show debug helpers */
  debug?: boolean;
  /** Extra CSS class */
  className?: string;
  /** Extra inline styles */
  style?: React.CSSProperties;
}

export default function AvatarCanvas({
  modelUrl,
  width = '100%',
  height = '100%',
  scale = 1,
  position = [0, -0.8, 0],
  rotation = [0, 0, 0],
  fov = 35,
  cameraPosition = [0, 1.2, 3],
  debug = false,
  className = '',
  style,
}: AvatarCanvasProps) {
  return (
    <div
      className={`avatar-canvas-wrapper ${className}`}
      style={{
        width,
        height,
        position: 'relative',
        pointerEvents: 'none',
        ...style,
      }}
    >
      <Canvas
        gl={{ alpha: true, antialias: true, preserveDrawingBuffer: false }}
        camera={{ fov, position: cameraPosition, near: 0.1, far: 100 }}
        style={{ background: 'transparent' }}
        dpr={[1, 1.5]}
        frameloop="always"
      >
        {/* Lighting: soft ambient + directional key light */}
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 4]} intensity={1.2} castShadow={false} />
        <directionalLight position={[-1, 2, -2]} intensity={0.3} />

        <Suspense fallback={null}>
          <Avatar3D
            modelUrl={modelUrl}
            scale={scale}
            position={position}
            rotation={rotation}
            debug={debug}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
