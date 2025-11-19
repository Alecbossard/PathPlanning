import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CameraMode, PathPoint } from '../types';
import * as THREE from 'three';

interface CarProps {
  path: PathPoint[];
  isPlaying: boolean;
  cameraMode: CameraMode;
  isNight: boolean;
  isGhost?: boolean; // New prop for Ghost Mode
}

interface SkidMark {
  id: number;
  pos: THREE.Vector3;
  rotation: THREE.Euler;
  opacity: number;
}

const Car: React.FC<CarProps> = ({ path, isPlaying, cameraMode, isNight, isGhost = false }) => {
  const carRef = useRef<THREE.Group>(null);
  const brakeLightRef = useRef<THREE.MeshStandardMaterial>(null);
  const [skidMarks, setSkidMarks] = useState<SkidMark[]>([]);
  
  // Targets for Headlights
  const leftHeadlightTarget = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0.2, -0.2, 10); 
    return o;
  }, []);
  const rightHeadlightTarget = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(-0.2, -0.2, 10);
    return o;
  }, []);

  // Rear Point Lights for braking glow
  const leftBrakeLightObj = useRef<THREE.PointLight>(null);
  const rightBrakeLightObj = useRef<THREE.PointLight>(null);

  const { camera } = useThree();
  
  // Animation state
  const distRef = useRef(0);
  const lastIdxRef = useRef(0);
  const speedFactor = 1.0; 

  // Temp vectors
  const vec3 = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    if (!carRef.current || path.length < 2) return;

    // --- Physics & Movement Logic ---
    if (isPlaying) {
        const totalLen = path[path.length - 1].dist;
        
        let idx = lastIdxRef.current;
        if (idx >= path.length - 1) idx = 0;
        // If we wrapped around significantly, reset search
        if (path[idx].dist > distRef.current + 50) idx = 0; 

        while (idx < path.length - 2 && path[idx + 1].dist <= distRef.current) {
            idx++;
        }
        lastIdxRef.current = idx;

        const p1 = path[idx];
        const p2 = path[idx + 1];
        
        const segmentLen = p2.dist - p1.dist;
        const alpha = segmentLen > 0 ? (distRef.current - p1.dist) / segmentLen : 0;

        // Velocity & Acceleration
        const currentVelocity = THREE.MathUtils.lerp(p1.velocity, p2.velocity, alpha);
        const currentAccel = THREE.MathUtils.lerp(p1.acceleration, p2.acceleration, alpha);

        // --- Braking Logic ---
        const isBraking = currentAccel < -0.5;
        const isSkidding = currentAccel < -8.0; 

        // Skid Marks Generation (Disabled for Ghost)
        if (!isGhost && isSkidding && Math.random() > 0.7) { 
            setSkidMarks(prev => {
                const newMarks = [...prev];
                if (newMarks.length > 50) newMarks.shift();
                newMarks.push({
                    id: Date.now() + Math.random(),
                    pos: carRef.current!.position.clone(),
                    rotation: carRef.current!.rotation.clone(),
                    opacity: 1.0
                });
                return newMarks;
            });
        }

        // Visuals
        if (!isGhost) {
            if (brakeLightRef.current) {
                brakeLightRef.current.emissiveIntensity = isBraking ? 5.0 : 0.2;
                brakeLightRef.current.color.setHex(isBraking ? 0xff0000 : 0x330000);
            }
            if (leftBrakeLightObj.current) leftBrakeLightObj.current.intensity = isBraking ? 3.0 : 0.0;
            if (rightBrakeLightObj.current) rightBrakeLightObj.current.intensity = isBraking ? 3.0 : 0.0;
        }

        // Move Car
        const moveDist = currentVelocity * speedFactor * delta;
        distRef.current += moveDist;

        // --- Smooth Loop Wrapping ---
        if (distRef.current >= totalLen) {
            distRef.current = distRef.current - totalLen;
            lastIdxRef.current = 0;
        }

        // Position Calculation
        const x = THREE.MathUtils.lerp(p1.x, p2.x, alpha);
        const y = THREE.MathUtils.lerp(p1.y, p2.y, alpha);
        const zElev = THREE.MathUtils.lerp(p1.z, p2.z, alpha);
        carRef.current.position.set(x, zElev + 0.25, y);

        // Rotation Calculation
        const lookAheadDist = distRef.current + 3.0; 
        let lookIdx = idx;
        let lookDist = lookAheadDist;
        if (lookDist > totalLen) {
            lookDist -= totalLen;
            lookIdx = 0;
        }
        while (lookIdx < path.length - 2 && path[lookIdx + 1].dist < lookDist) {
            lookIdx++;
        }
        const lp1 = path[lookIdx];
        const lp2 = path[lookIdx + 1];
        const lSegmentLen = lp2.dist - lp1.dist;
        const lAlpha = lSegmentLen > 0 ? Math.max(0, Math.min(1, (lookDist - lp1.dist) / lSegmentLen)) : 0;
        
        const lx = THREE.MathUtils.lerp(lp1.x, lp2.x, lAlpha);
        const ly = THREE.MathUtils.lerp(lp1.y, lp2.y, lAlpha);
        const lzElev = THREE.MathUtils.lerp(lp1.z, lp2.z, lAlpha);
        
        carRef.current.lookAt(lx, lzElev + 0.25, ly);
    } else {
        // Reset Logic
        if (path.length > 0 && distRef.current === 0) {
             const p1 = path[0];
             carRef.current.position.set(p1.x, p1.z + 0.25, p1.y);
             if(path.length > 1) {
                 const p2 = path[1];
                 carRef.current.lookAt(p2.x, p2.z + 0.25, p2.y);
             }
        }
    }

    // --- Camera Logic (Disabled for Ghost) ---
    if (!isGhost && cameraMode !== CameraMode.ORBIT && carRef.current) {
      const carPos = carRef.current.position;
      const carQuat = carRef.current.quaternion;

      if (cameraMode === CameraMode.CHASE) {
        vec3.set(0, 2.5, -5.0); 
        vec3.applyQuaternion(carQuat);
        vec3.add(carPos);
        camera.position.lerp(vec3, 0.1);
        camera.lookAt(carPos.x, carPos.y + 0.5, carPos.z);

      } else if (cameraMode === CameraMode.COCKPIT) {
        vec3.set(0, 0.35, 0.2); 
        vec3.applyQuaternion(carQuat);
        vec3.add(carPos);
        camera.position.copy(vec3);
        target.set(0, 0, 10);
        target.applyQuaternion(carQuat);
        target.add(carPos);
        camera.lookAt(target);

      } else if (cameraMode === CameraMode.HELICOPTER) {
        const heliOffset = new THREE.Vector3(20, 25, 20);
        const targetPos = carPos.clone().add(heliOffset);
        camera.position.lerp(targetPos, 0.05);
        camera.lookAt(carPos);
      }
    }
  });

  useEffect(() => {
    distRef.current = 0;
    lastIdxRef.current = 0;
    setSkidMarks([]);
  }, [path]);

  // --- STYLING LOGIC ---
  let chassisColor = "#ef4444"; // Default Red
  let emissiveColor = "#000000";
  let emissiveIntensity = 0;

  // Ghost Mode: Neon Green "Fluo" look
  if (isGhost) {
    chassisColor = "#39ff14"; // Neon Green
    emissiveColor = "#39ff14";
    emissiveIntensity = 0.6;
  }

  const wheelColor = isGhost ? "#113311" : "#0f172a";
  const opacity = isGhost ? 0.5 : 1.0;
  const transparent = isGhost;

  return (
    <group>
      {/* Skid Marks Rendering */}
      {!isGhost && skidMarks.map(mark => (
          <mesh key={mark.id} position={[mark.pos.x, 0.03, mark.pos.z]} rotation={mark.rotation}>
              <planeGeometry args={[0.5, 0.5]} />
              <meshBasicMaterial color="#111111" transparent opacity={0.6} depthWrite={false} />
          </mesh>
      ))}

      <group ref={carRef}>
        
        {/* Only render lights if NOT ghost */}
        {!isGhost && (
            <>
                <primitive object={leftHeadlightTarget} />
                <primitive object={rightHeadlightTarget} />
                {isNight && (
                <>
                    <spotLight 
                    position={[0.2, 0.2, 0.6]} target={leftHeadlightTarget}
                    angle={0.6} penumbra={0.3} intensity={80} distance={60} color="#e0e7ff" castShadow
                    />
                    <spotLight 
                    position={[-0.2, 0.2, 0.6]} target={rightHeadlightTarget}
                    angle={0.6} penumbra={0.3} intensity={80} distance={60} color="#e0e7ff" castShadow 
                    />
                    <mesh position={[0.25, 0.2, 1.0]} rotation={[-Math.PI/2, 0, 0]}>
                        <coneGeometry args={[0.15, 1.0, 16, 1, true]} />
                        <meshBasicMaterial color="#ffffff" transparent opacity={0.15} depthWrite={false} side={THREE.DoubleSide} />
                    </mesh>
                    <mesh position={[-0.25, 0.2, 1.0]} rotation={[-Math.PI/2, 0, 0]}>
                        <coneGeometry args={[0.15, 1.0, 16, 1, true]} />
                        <meshBasicMaterial color="#ffffff" transparent opacity={0.15} depthWrite={false} side={THREE.DoubleSide} />
                    </mesh>
                </>
                )}
                <pointLight ref={leftBrakeLightObj} position={[0.2, 0.3, -0.9]} distance={5} color="#ff0000" decay={2} />
                <pointLight ref={rightBrakeLightObj} position={[-0.2, 0.3, -0.9]} distance={5} color="#ff0000" decay={2} />
            </>
        )}

        {/* Chassis */}
        <mesh position={[0, 0.15, 0]} castShadow={!isGhost}>
          <boxGeometry args={[0.6, 0.25, 1.6]} />
          <meshStandardMaterial 
            color={chassisColor} 
            roughness={0.2} 
            metalness={isGhost ? 0.1 : 0.6} 
            emissive={emissiveColor}
            emissiveIntensity={emissiveIntensity}
            transparent={transparent} 
            opacity={opacity} 
          />
        </mesh>

        {/* Cockpit */}
        <mesh position={[0, 0.28, -0.2]}>
          <boxGeometry args={[0.4, 0.15, 0.6]} />
          <meshStandardMaterial color={isGhost ? "#39ff14" : "#1e293b"} roughness={0.5} transparent={transparent} opacity={opacity} />
        </mesh>

        {/* Brake Light Meshes */}
        <mesh position={[0.2, 0.15, -0.8]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.15, 0.1]} />
          <meshStandardMaterial 
            ref={isGhost ? null : brakeLightRef} 
            color={isGhost ? "#39ff14" : "#550000"} 
            emissive={isGhost ? "#39ff14" : "#ff0000"} 
            emissiveIntensity={isGhost ? 0.5 : 0.2}
            transparent={transparent} opacity={opacity}
           />
        </mesh>
        <mesh position={[-0.2, 0.15, -0.8]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.15, 0.1]} />
          <meshStandardMaterial 
              color={isGhost ? "#39ff14" : "#550000"} 
              emissive={isGhost ? "#39ff14" : "#ff0000"} 
              emissiveIntensity={isGhost ? 0.5 : 0.2} 
              onUpdate={(self) => {
                  if (brakeLightRef.current && !isGhost) {
                      self.emissiveIntensity = brakeLightRef.current.emissiveIntensity;
                      self.color.copy(brakeLightRef.current.color);
                  }
              }}
              transparent={transparent} opacity={opacity}
          />
        </mesh>

        {/* Wheels */}
        <mesh position={[0.35, 0.15, 0.5]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.18, 0.18, 0.15, 24]} />
          <meshStandardMaterial color={wheelColor} roughness={0.8} transparent={transparent} opacity={opacity} />
        </mesh>
        <mesh position={[-0.35, 0.15, 0.5]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.18, 0.18, 0.15, 24]} />
          <meshStandardMaterial color={wheelColor} roughness={0.8} transparent={transparent} opacity={opacity} />
        </mesh>
        <mesh position={[0.35, 0.15, -0.6]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.18, 0.18, 0.15, 24]} />
          <meshStandardMaterial color={wheelColor} roughness={0.8} transparent={transparent} opacity={opacity} />
        </mesh>
        <mesh position={[-0.35, 0.15, -0.6]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.18, 0.18, 0.15, 24]} />
          <meshStandardMaterial color={wheelColor} roughness={0.8} transparent={transparent} opacity={opacity} />
        </mesh>

        {/* Wings */}
        <mesh position={[0, 0.4, -0.85]}>
          <boxGeometry args={[0.9, 0.02, 0.3]} />
          <meshStandardMaterial color={isGhost ? "#39ff14" : "#334155"} transparent={transparent} opacity={opacity} />
        </mesh>
        <mesh position={[0, 0.1, 0.9]}>
          <boxGeometry args={[0.9, 0.02, 0.3]} />
          <meshStandardMaterial color={isGhost ? "#39ff14" : "#334155"} transparent={transparent} opacity={opacity} />
        </mesh>
      </group>
    </group>
  );
};

export default Car;