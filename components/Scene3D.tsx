import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Sky, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { ConeData, EditorState, PathPoint, CameraMode } from '../types';
import TrackObjects from './TrackObjects';
import WorldEnvironment from './WorldEnvironment';
import Car from './Car';

interface SceneProps {
  cones: ConeData[];
  roadPath: PathPoint[];   // The physical asphalt geometry (centerline)
  racingPath: PathPoint[]; // The trajectory (can be optimized)
  ghostPath?: PathPoint[]; // The "Fastest" trajectory for ghost car
  editorState: EditorState;
  isPlaying: boolean;
  cameraMode: CameraMode;
  isNight: boolean;
  currentTrack: string;
  enableSuspension?: boolean;
  raceMode?: boolean;
  racePaths?: { laplacian: PathPoint[], qp: PathPoint[], rrt: PathPoint[] };
  onConeMove: (id: string, x: number, z: number) => void;
  onConeSelect: (id: string | null) => void;
}

// --- Dynamic Shadow System ---
// Updates the directional light position to follow the camera's focus point.
// This ensures high-resolution shadows are always computed for the visible area.
const DynamicDirectionalLight: React.FC<{ isNight: boolean }> = ({ isNight }) => {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const { camera } = useThree();
  
  useFrame(() => {
    if (!lightRef.current) return;

    // 1. Determine the center of attention on the ground plane
    const target = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    
    // Raycast from camera center to ground
    if (raycaster.ray.intersectPlane(plane, target)) {
        // Clamp distance to avoid light drifting too far when looking at horizon
        const dist = target.distanceTo(camera.position);
        if (dist > 150) {
             // Fallback to projected point in front of camera
             target.copy(camera.position).add(raycaster.ray.direction.multiplyScalar(50));
             target.y = 0;
        }
    } else {
        // Fallback if looking at sky
        target.copy(camera.position);
        target.y = 0;
    }

    // 2. Set Sun/Moon Position Offset relative to target
    // Day: Steep angle for clear shadows
    // Night: Lower angle, different azimuth
    const offset = isNight 
        ? new THREE.Vector3(-40, 30, -40) // Moon
        : new THREE.Vector3(60, 80, 40);  // Sun

    // Update light position and target
    lightRef.current.position.copy(target).add(offset);
    lightRef.current.target.position.copy(target);
    lightRef.current.target.updateMatrixWorld();
  });

  return (
    <directionalLight 
      ref={lightRef}
      intensity={isNight ? 0.3 : 1.4} 
      color={isNight ? "#a5b4fc" : "#fff7ed"} // Cool blue night, warm white day
      castShadow 
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0005} // Reduces shadow acne
    >
       {/* Shadow Camera covers the area around the focus point */}
       <orthographicCamera attach="shadow-camera" args={[-80, 80, 80, -80]} />
    </directionalLight>
  );
};

// Handle Ground Clicks
const EditorGroundInteraction: React.FC<{ 
  onDeselect: () => void;
}> = ({ onDeselect }) => {
  
  const handleClick = (e: any) => {
    onDeselect();
  };

  return (
    <mesh 
      rotation={[-Math.PI / 2, 0, 0]} 
      position={[0, 0.01, 0]} 
      onClick={handleClick}
      visible={false}
    >
      <planeGeometry args={[500, 500]} />
    </mesh>
  );
};

const Scene3D: React.FC<SceneProps> = ({ 
  cones, 
  roadPath,
  racingPath, 
  ghostPath,
  editorState, 
  isPlaying, 
  cameraMode,
  isNight,
  currentTrack,
  enableSuspension = false,
  raceMode = false,
  racePaths,
  onConeMove, 
  onConeSelect
}) => {
  // Strict camera control: Only enable orbit controls if specifically in ORBIT mode.
  // Other modes are driven programmatically by the Car component.
  const orbitEnabled = cameraMode === CameraMode.ORBIT;

  return (
    <div 
      className={`w-full h-full transition-colors duration-1000 ${isNight ? 'bg-slate-950' : 'bg-sky-300'}`} 
      onContextMenu={(e) => e.preventDefault()} 
    >
      <Canvas shadows camera={{ position: [50, 50, 50], fov: 45 }}>
        {/* --- Atmosphere & Lighting --- */}
        {isNight ? (
           <>
             <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
             <fog attach="fog" args={['#020617', 10, 150]} />
             <ambientLight intensity={0.1} color="#1e293b" />
             <pointLight position={[50, 100, 50]} intensity={0.5} color="#94a3b8" />
           </>
        ) : (
           <>
             <Sky sunPosition={[100, 20, 100]} turbidity={0.5} rayleigh={0.5} />
             <fog attach="fog" args={['#dbeafe', 20, 350]} />
             <Environment preset="sunset" />
             <ambientLight intensity={0.5} />
           </>
        )}

        {/* Dynamic Shadows (Replaces static directional lights) */}
        <DynamicDirectionalLight isNight={isNight} />

        <OrbitControls 
          makeDefault 
          enabled={!editorState.isDragging && orbitEnabled} 
          maxPolarAngle={Math.PI / 2 - 0.05} 
          minDistance={5}
          maxDistance={500}
        />
        
        <EditorGroundInteraction 
          onDeselect={() => onConeSelect(null)}
        />

        <WorldEnvironment path={roadPath} currentTrack={currentTrack} />

        <TrackObjects 
          cones={cones} 
          roadPath={roadPath}
          racingPath={racingPath}
          editorState={editorState}
          onConeMove={onConeMove}
          onConeSelect={onConeSelect}
        />

        {/* AI Race Mode Cars */}
        {raceMode && racePaths ? (
            <>
                {/* Laplacian (Purple) */}
                {racePaths.laplacian.length > 1 && (
                    <Car 
                        path={racePaths.laplacian} 
                        isPlaying={isPlaying} 
                        cameraMode={cameraMode} 
                        isNight={isNight} 
                        enableSuspension={enableSuspension}
                        color="#a855f7" 
                        label="Laplacian"
                    />
                )}
                {/* QP (Orange) */}
                {racePaths.qp.length > 1 && (
                    <Car 
                        path={racePaths.qp} 
                        isPlaying={isPlaying} 
                        cameraMode={cameraMode} 
                        isNight={isNight} 
                        enableSuspension={enableSuspension}
                        color="#f97316" 
                        label="QP"
                    />
                )}
                {/* RRT (Emerald) */}
                {racePaths.rrt.length > 1 && (
                    <Car 
                        path={racePaths.rrt} 
                        isPlaying={isPlaying} 
                        cameraMode={cameraMode} 
                        isNight={isNight} 
                        enableSuspension={enableSuspension}
                        color="#10b981" 
                        label="RRT*"
                    />
                )}
            </>
        ) : (
            /* Standard Mode Cars */
            <>
                {/* Main Car */}
                {racingPath.length > 1 && (
                <Car 
                    path={racingPath} 
                    isPlaying={isPlaying} 
                    cameraMode={cameraMode}
                    isNight={isNight}
                    isGhost={false}
                    enableSuspension={enableSuspension}
                />
                )}

                {/* Ghost Car (Fastest Lap) */}
                {ghostPath && ghostPath.length > 1 && (
                <Car 
                    path={ghostPath} 
                    isPlaying={isPlaying} 
                    cameraMode={cameraMode}
                    isNight={isNight}
                    isGhost={true}
                    enableSuspension={false} 
                />
                )}
            </>
        )}

      </Canvas>
    </div>
  );
};

export default Scene3D;