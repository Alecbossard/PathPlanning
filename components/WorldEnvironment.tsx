import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Instance, Instances } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { PathPoint } from '../types';

interface EnvironmentProps {
  path: PathPoint[];
  currentTrack: string;
}

const TREE_COUNT = 150;
const WORLD_SIZE = 400;

// --- Helper: Check if position is safe from track (Collision Avoidance) ---
const isSafePosition = (x: number, z: number, path: PathPoint[], minDistance: number) => {
  // Check against track points to ensure object is not on or too close to the track
  for (let i = 0; i < path.length; i += 5) {
    const p = path[i];
    const dx = p.x - x;
    const dz = p.y - z;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDistance * minDistance) {
      return false; // Too close to track
    }
  }
  return true;
};

// --- Animated 3D Spectators ---
const AnimatedSpectators: React.FC<{ path: PathPoint[] }> = ({ path }) => {
  const bodiesRef = useRef<THREE.InstancedMesh>(null);
  const headsRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // 1. Generate FIXED candidates. These never change position, only visibility.
  const candidates = useMemo(() => {
    const temp = [];
    const CROWD_RADIUS = 200;
    // Generate a cloud of potential spectator spots
    for (let i = 0; i < 1500; i++) {
         const theta = Math.random() * Math.PI * 2;
         const r = 15 + Math.random() * CROWD_RADIUS; 
         temp.push(new THREE.Vector3(r * Math.cos(theta), 0, r * Math.sin(theta)));
    }
    return temp;
  }, []);

  // 2. Filter candidates based on the current track path
  const visiblePositions = useMemo(() => {
      if (path.length < 10) return [];
      const CROWD_SAFE_DIST = 6.0; // Min dist from track center
      const MAX_DIST_FROM_TRACK = 20.0; // Max dist from track to be visible (crowd gathers near track)

      return candidates.filter(pos => {
          let nearTrack = false;
          let safe = true;

          // Check proximity to track segments
          for (let i = 0; i < path.length; i += 5) {
              const p = path[i];
              const dx = p.x - pos.x;
              const dz = p.y - pos.z;
              const dSq = dx*dx + dz*dz;

              if (dSq < CROWD_SAFE_DIST * CROWD_SAFE_DIST) {
                  safe = false;
                  break; // Too close, unsafe
              }
              if (dSq < MAX_DIST_FROM_TRACK * MAX_DIST_FROM_TRACK) {
                  nearTrack = true; // Close enough to watch
              }
          }
          return safe && nearTrack;
      }).slice(0, 400); // Cap the crowd size
  }, [candidates, path]);
  
  // Random animation phases (stable based on index)
  const phases = useMemo(() => {
    return new Float32Array(visiblePositions.length).map(() => Math.random() * Math.PI * 2);
  }, [visiblePositions.length]);

  const bodyColors = useMemo(() => {
      const colors = [];
      const palette = ['#ef4444', '#3b82f6', '#eab308', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#64748b'];
      for(let i=0; i<visiblePositions.length; i++) {
          const c = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
          colors.push(c.r, c.g, c.b);
      }
      return new Float32Array(colors);
  }, [visiblePositions]);

  const headColors = useMemo(() => {
      const colors = [];
      const tones = ['#f5d0b0', '#e0ac69', '#8d5524', '#c68642'];
      for(let i=0; i<visiblePositions.length; i++) {
          const c = new THREE.Color(tones[Math.floor(Math.random() * tones.length)]);
          colors.push(c.r, c.g, c.b);
      }
      return new Float32Array(colors);
  }, [visiblePositions]);

  useFrame((state) => {
    if (!bodiesRef.current || !headsRef.current) return;
    
    const time = state.clock.elapsedTime * 10; 

    for (let i = 0; i < visiblePositions.length; i++) {
      const pos = visiblePositions[i];
      const phase = phases[i];
      
      let yOffset = Math.max(0, Math.sin(time + phase) * 0.2);
      if (i % 3 === 0) yOffset *= 1.5; 

      const currentY = pos.y + yOffset;

      // Update Body
      dummy.position.set(pos.x, currentY, pos.z);
      dummy.rotation.set(0, phase, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bodiesRef.current.setMatrixAt(i, dummy.matrix);

      // Update Head
      dummy.position.set(pos.x, currentY + 0.65, pos.z); 
      dummy.updateMatrix();
      headsRef.current.setMatrixAt(i, dummy.matrix);
    }
    bodiesRef.current.instanceMatrix.needsUpdate = true;
    headsRef.current.instanceMatrix.needsUpdate = true;
  });

  if (visiblePositions.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={bodiesRef} args={[undefined, undefined, visiblePositions.length]} castShadow receiveShadow>
        <cylinderGeometry args={[0.15, 0.25, 0.6, 8]} />
        <meshStandardMaterial color="white">
            <instancedBufferAttribute attach="attributes-color" args={[bodyColors, 3]} />
        </meshStandardMaterial>
      </instancedMesh>
      
      <instancedMesh ref={headsRef} args={[undefined, undefined, visiblePositions.length]} castShadow receiveShadow>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="white">
            <instancedBufferAttribute attach="attributes-color" args={[headColors, 3]} />
        </meshStandardMaterial>
      </instancedMesh>
    </group>
  );
};

// --- Trees ---
const Trees: React.FC<{ path: PathPoint[] }> = ({ path }) => {
  // 1. Generate FIXED candidates.
  const allCandidates = useMemo(() => {
    const temp = [];
    for (let i = 0; i < 500; i++) {
      const r = 30 + Math.random() * 250;
      const theta = Math.random() * Math.PI * 2;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);
      const scale = 0.8 + Math.random() * 0.6;
      temp.push({ 
          position: [x, 0, z] as [number, number, number], 
          scale: [scale, scale * (1 + Math.random()), scale] as [number, number, number] 
      });
    }
    return temp;
  }, []);

  // 2. Filter candidates. Trees that are safe stay; others are hidden.
  const visibleTrees = useMemo(() => {
      return allCandidates.filter(t => isSafePosition(t.position[0], t.position[2], path, 8.0)).slice(0, TREE_COUNT);
  }, [allCandidates, path]);

  return (
    <group>
      <Instances range={visibleTrees.length}>
        <cylinderGeometry args={[0.2, 0.4, 1]} />
        <meshStandardMaterial color="#5d4037" />
        {visibleTrees.map((data, i) => (
          <Instance key={`trunk-${i}`} position={[data.position[0], 0.5 * data.scale[1], data.position[2]]} scale={data.scale} />
        ))}
      </Instances>
      <Instances range={visibleTrees.length}>
        <coneGeometry args={[1.5, 3, 8]} />
        <meshStandardMaterial color="#1a472a" />
        {visibleTrees.map((data, i) => (
          <Instance key={`leaf-${i}`} position={[data.position[0], 2 * data.scale[1], data.position[2]]} scale={data.scale} />
        ))}
      </Instances>
    </group>
  );
};

// --- Tire Barriers ---
const TireBarriers: React.FC<{ path: PathPoint[] }> = ({ path }) => {
  const tireData = useMemo(() => {
    if (path.length < 2) return [];
    
    const instances = [];
    const BARRIER_OFFSET_DIST = 4.0; 
    const TIRE_HEIGHT = 0.25;
    const STACK_COUNT = 3;
    
    const totalDist = path[path.length - 1].dist;
    const step = 0.7; 
    
    let d = 0;
    let idx = 0;
    
    while (d < totalDist) {
        while (idx < path.length - 1 && path[idx + 1].dist < d) {
            idx++;
        }
        const p1 = path[idx];
        const p2 = path[idx + 1] || p1;
        const segLen = p2.dist - p1.dist;
        const alpha = segLen > 0.001 ? (d - p1.dist) / segLen : 0;
        
        const x = THREE.MathUtils.lerp(p1.x, p2.x, alpha);
        const z = THREE.MathUtils.lerp(p1.y, p2.y, alpha);
        
        const dx = p2.x - p1.x;
        const dz = p2.y - p1.y;
        const len = Math.sqrt(dx*dx + dz*dz) || 1;
        const nx = -dz / len;
        const nz = dx / len;
        
        const isWhite = Math.floor(d / 4.0) % 2 === 0;
        const color = isWhite ? '#f8fafc' : '#ef4444';
        
        [BARRIER_OFFSET_DIST, -BARRIER_OFFSET_DIST].forEach(off => {
            const bx = x + nx * off;
            const bz = z + nz * off;
            
            for(let s=0; s<STACK_COUNT; s++) {
                const jx = (Math.random() - 0.5) * 0.05;
                const jz = (Math.random() - 0.5) * 0.05;
                instances.push({
                    pos: [bx + jx, TIRE_HEIGHT/2 + s*TIRE_HEIGHT, bz + jz],
                    color
                });
            }
        });
        
        d += step;
    }
    return instances;
  }, [path]);

  return (
    <Instances range={tireData.length}>
       <cylinderGeometry args={[0.3, 0.3, 0.25, 12]} />
       <meshStandardMaterial roughness={0.8} />
       {tireData.map((d, i) => (
         <Instance key={i} position={d.pos as any} color={d.color} />
       ))}
    </Instances>
  );
}

const WorldEnvironment: React.FC<EnvironmentProps> = ({ path, currentTrack }) => {
  return (
    <group>
      {/* Ground Plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
        <planeGeometry args={[WORLD_SIZE, WORLD_SIZE, 64, 64]} />
        <meshStandardMaterial color="#3f6212" roughness={1} />
      </mesh>

      <Trees path={path} />
      {path.length > 10 && currentTrack !== 'shanghai' && currentTrack !== 'circuit_3' && <TireBarriers path={path} />}
      
      {/* Spectators */}
      <AnimatedSpectators path={path} />
    </group>
  );
};

export default WorldEnvironment;