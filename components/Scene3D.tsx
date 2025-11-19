import React, { useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
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
  onConeMove: (id: string, x: number, z: number) => void;
  onConeSelect: (id: string | null) => void;
  onAddCone: (x: number, z: number) => void;
}

// Handle Ground Clicks
const EditorGroundInteraction: React.FC<{ 
  mode: EditorState['mode']; 
  onAddCone: (x: number, z: number) => void;
  onDeselect: () => void;
}> = ({ mode, onAddCone, onDeselect }) => {
  
  const handleClick = (e: any) => {
    if (mode === 'ADD_BLUE' || mode === 'ADD_YELLOW') {
      e.stopPropagation();
      onAddCone(e.point.x, e.point.z);
    } else {
      onDeselect();
    }
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
  onConeMove, 
  onConeSelect, 
  onAddCone
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
             <directionalLight 
                position={[-20, 50, -20]} 
                intensity={0.2} 
                color="#64748b"
                castShadow 
             />
             <pointLight position={[50, 100, 50]} intensity={0.5} color="#94a3b8" />
           </>
        ) : (
           <>
             <Sky sunPosition={[100, 20, 100]} turbidity={0.5} rayleigh={0.5} />
             <fog attach="fog" args={['#dbeafe', 20, 350]} />
             <Environment preset="sunset" />
             <ambientLight intensity={0.5} />
             <directionalLight 
                position={[50, 50, 25]} 
                intensity={1.2} 
                castShadow 
                shadow-mapSize={[2048, 2048]}
                shadow-bias={-0.0001}
             />
           </>
        )}

        <OrbitControls 
          makeDefault 
          enabled={!editorState.isDragging && orbitEnabled} 
          maxPolarAngle={Math.PI / 2 - 0.05} 
          minDistance={5}
          maxDistance={500}
        />
        
        <EditorGroundInteraction 
          mode={editorState.mode} 
          onAddCone={onAddCone} 
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

        {/* Main Car */}
        {racingPath.length > 1 && (
          <Car 
            path={racingPath} 
            isPlaying={isPlaying} 
            cameraMode={cameraMode}
            isNight={isNight}
            isGhost={false}
          />
        )}

        {/* Ghost Car (RRT+QP Trajectory) */}
        {ghostPath && ghostPath.length > 1 && (
          <Car 
            path={ghostPath} 
            isPlaying={isPlaying} 
            cameraMode={cameraMode}
            isNight={isNight}
            isGhost={true}
          />
        )}

      </Canvas>
    </div>
  );
};

export default Scene3D;