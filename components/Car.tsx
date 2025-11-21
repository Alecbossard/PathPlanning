import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { CameraMode, PathPoint } from '../types';
import { PHYSICS } from '../constants';
import * as THREE from 'three';

interface CarProps {
  path: PathPoint[];
  isPlaying: boolean;
  cameraMode: CameraMode;
  isNight: boolean;
  isGhost?: boolean; 
  enableSuspension?: boolean;
  color?: string;
  label?: string;
  onCarUpdate?: (position: THREE.Vector3, direction: THREE.Vector3) => void;
}

interface SkidMark {
  id: number;
  pos: THREE.Vector3;
  rotation: THREE.Euler;
  opacity: number;
}

// --- Sub-component for the Wheel Geometry to visualize spinning ---
const WheelMesh: React.FC<{ color: string, opacity: number, transparent: boolean }> = ({ color, opacity, transparent }) => (
  <group rotation={[0, 0, Math.PI / 2]}>
    {/* Tire */}
    <mesh castShadow>
      <cylinderGeometry args={[0.18, 0.18, 0.15, 24]} />
      <meshStandardMaterial color={color} roughness={0.8} transparent={transparent} opacity={opacity} />
    </mesh>
    {/* Rim / Spokes (to visualize rotation) */}
    <mesh position={[0, 0.04, 0]}>
      <boxGeometry args={[0.25, 0.05, 0.05]} />
      <meshStandardMaterial color="#333" transparent={transparent} opacity={opacity} />
    </mesh>
    <mesh position={[0, 0.04, 0]} rotation={[0, Math.PI/2, 0]}>
      <boxGeometry args={[0.25, 0.05, 0.05]} />
      <meshStandardMaterial color="#333" transparent={transparent} opacity={opacity} />
    </mesh>
  </group>
);

const Car: React.FC<CarProps> = ({ 
  path, 
  isPlaying, 
  cameraMode, 
  isNight, 
  isGhost = false, 
  enableSuspension = false,
  color,
  label,
  onCarUpdate
}) => {
  // Parent Group (Follows Path)
  const carRef = useRef<THREE.Group>(null);
  // Child Group (Simulates Suspension/Body Roll)
  const chassisRef = useRef<THREE.Group>(null);
  
  const brakeLightRef = useRef<THREE.MeshStandardMaterial>(null);
  const [skidMarks, setSkidMarks] = useState<SkidMark[]>([]);
  
  // Wheel Refs for Animation
  const flSteerRef = useRef<THREE.Group>(null);
  const frSteerRef = useRef<THREE.Group>(null);
  const flRollRef = useRef<THREE.Group>(null);
  const frRollRef = useRef<THREE.Group>(null);
  const blRollRef = useRef<THREE.Group>(null);
  const brRollRef = useRef<THREE.Group>(null);

  // HUD Refs
  const speedTextRef = useRef<any>(null);
  const gearTextRef = useRef<any>(null);
  const rpmBarRef = useRef<THREE.Mesh>(null);

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
  
  // Suspension State for smooth lerping
  const currentRollRef = useRef(0);
  const currentPitchRef = useRef(0);
  const currentDriftRef = useRef(0);
  
  // Throttle state for onCarUpdate (don't spam parent every frame)
  const lastUpdateRef = useRef(0);

  // Temp vectors
  const vec3 = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const dirVec = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    if (!carRef.current || path.length < 2) return;

    // --- Physics & Movement Logic ---
    if (isPlaying) {
        const totalLen = path[path.length - 1].dist;
        
        let idx = lastIdxRef.current;
        if (idx >= path.length - 1) idx = 0;
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

        // Determine Steering Sign (Left/Right)
        const vx = p2.x - p1.x;
        const vz = p2.y - p1.y;
        const p3 = path[idx + 2] || path[0];
        const nx = p3.x - p2.x;
        const nz = p3.y - p2.y;
        const cross = vx * nz - vz * nx;
        const steerSign = cross > 0 ? -1 : 1; // +1 Right, -1 Left

        // --- Dynamic Suspension Logic ---
        if (chassisRef.current) {
            let targetRoll = 0;
            let targetPitch = 0;
            let targetDrift = 0;

            if (enableSuspension && !isGhost) {
                 // 1. Calculate G-Forces
                 // Lat G = v^2 * curvature.
                 const latG = (currentVelocity * currentVelocity * p1.curvature * steerSign) / PHYSICS.GRAVITY; 
                 const longG = currentAccel / PHYSICS.GRAVITY; 
                 
                 // 2. Roll (Body leans OUT of turn)
                 targetRoll = latG * 0.12; 

                 // 3. Pitch (Dive on brake, Squat on accel)
                 targetPitch = longG * 0.04; 

                 // 4. Drift / Slip Angle (Yaw Offset)
                 const DRIFT_THRESHOLD = 0.8; // Lowered to show drift easier
                 if (Math.abs(latG) > DRIFT_THRESHOLD) {
                     const driftIntensity = Math.min((Math.abs(latG) - DRIFT_THRESHOLD) * 0.25, 0.45);
                     // Left turn (steer -1) -> Nose points Left (Yaw +) -> Drift Positive
                     targetDrift = -steerSign * driftIntensity;
                 }
            }

            // Smooth Damping (Spring/Damper simulation)
            const dt = Math.min(delta, 0.1);
            const lerpFactor = dt * 4.0; // Softer suspension
            
            currentRollRef.current = THREE.MathUtils.lerp(currentRollRef.current, targetRoll, lerpFactor);
            currentPitchRef.current = THREE.MathUtils.lerp(currentPitchRef.current, targetPitch, lerpFactor);
            currentDriftRef.current = THREE.MathUtils.lerp(currentDriftRef.current, targetDrift, lerpFactor);

            // Apply to Chassis
            chassisRef.current.rotation.z = currentRollRef.current;
            chassisRef.current.rotation.x = currentPitchRef.current; 
            chassisRef.current.rotation.y = currentDriftRef.current;
        }


        // --- Telemetry Calculation for HUD ---
        if (!isGhost && cameraMode === CameraMode.COCKPIT) {
            const kph = Math.max(0, currentVelocity * 3.6);
            const gear = Math.max(1, Math.min(6, Math.floor(kph / 35) + 1));
            // Simulating RPM based on gear band
            const rangeSize = 35; 
            const distInGear = (kph % rangeSize) / rangeSize;
            // Base RPM 3000, Max 12000. 
            const rpm = 3000 + distInGear * 8000 + (Math.random() * 150); 

            if (speedTextRef.current) speedTextRef.current.text = Math.round(kph).toString();
            if (gearTextRef.current) gearTextRef.current.text = gear.toString();
            
            if (rpmBarRef.current) {
                const rpmPercent = Math.min(1, rpm / 11000);
                rpmBarRef.current.scale.x = rpmPercent;
                rpmBarRef.current.position.x = -0.15 + (rpmPercent * 0.3) / 2; // Re-center based on scale
                
                const mat = rpmBarRef.current.material as THREE.MeshBasicMaterial;
                if (rpmPercent > 0.9) mat.color.setHex(0xff0000); // Redline
                else if (rpmPercent > 0.7) mat.color.setHex(0xffaa00); // Warning
                else mat.color.setHex(0x00ffaa); // Normal
            }
        }

        // --- Braking Logic ---
        const isBraking = currentAccel < -0.5;
        const isSkidding = currentAccel < -8.0 || Math.abs(currentDriftRef.current) > 0.1; 

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

        // Move Car (Parent Group)
        const moveDist = currentVelocity * speedFactor * delta;
        distRef.current += moveDist;

        if (distRef.current >= totalLen) {
            distRef.current = distRef.current - totalLen;
            lastIdxRef.current = 0;
        }

        // Position
        const x = THREE.MathUtils.lerp(p1.x, p2.x, alpha);
        const y = THREE.MathUtils.lerp(p1.y, p2.y, alpha);
        const zElev = THREE.MathUtils.lerp(p1.z, p2.z, alpha);
        carRef.current.position.set(x, zElev + 0.25, y);

        // Rotation (Look Ahead)
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

        // --- Report Position for Local Planner Visibility ---
        if (onCarUpdate && state.clock.elapsedTime - lastUpdateRef.current > 0.1) {
            // Calculate forward direction vector
            dirVec.set(0, 0, 1).applyQuaternion(carRef.current.quaternion).normalize();
            onCarUpdate(carRef.current.position, dirVec);
            lastUpdateRef.current = state.clock.elapsedTime;
        }

        // --- Wheel Animations ---
        // 1. Rolling (Rotation X)
        // Dist / Radius (0.18)
        const rollAngle = -distRef.current / 0.18;
        if (flRollRef.current) flRollRef.current.rotation.x = rollAngle;
        if (frRollRef.current) frRollRef.current.rotation.x = rollAngle;
        if (blRollRef.current) blRollRef.current.rotation.x = rollAngle;
        if (brRollRef.current) brRollRef.current.rotation.x = rollAngle;

        // 2. Steering (Rotation Y)
        const maxSteer = 0.6; // ~35 degrees
        const rawSteer = p1.curvature * 4.0 * steerSign; 
        
        // Counter-steer visuals: If drifting significantly, wheels should counter-steer
        let visualSteer = rawSteer;
        if (Math.abs(currentDriftRef.current) > 0.1) {
             // If car is drifting Left (nose left), wheels point Right to correct.
             visualSteer -= currentDriftRef.current * 1.2; 
        }

        const steerAngle = Math.max(-maxSteer, Math.min(maxSteer, visualSteer));

        if (flSteerRef.current) flSteerRef.current.rotation.y = steerAngle;
        if (frSteerRef.current) frSteerRef.current.rotation.y = steerAngle;

    } else {
        // Reset Logic
        if (path.length > 0 && distRef.current === 0) {
             const p1 = path[0];
             carRef.current.position.set(p1.x, p1.z + 0.25, p1.y);
             if(path.length > 1) {
                 const p2 = path[1];
                 carRef.current.lookAt(p2.x, p2.z + 0.25, p2.y);
             }
             if (chassisRef.current) {
                 chassisRef.current.rotation.set(0,0,0);
             }
             currentRollRef.current = 0;
             currentPitchRef.current = 0;
             currentDriftRef.current = 0;

             // Reset Wheels
             if (flSteerRef.current) flSteerRef.current.rotation.y = 0;
             if (frSteerRef.current) frSteerRef.current.rotation.y = 0;
             
             // Reset HUD
             if (speedTextRef.current) speedTextRef.current.text = "0";
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
        // Camera moves WITH the chassis pitch/roll for immersion
        // Standard Cockpit pos relative to Car Ref
        vec3.set(0, 0.35, 0.2); 
        
        // If suspension enabled, add a bit of shake/lean to camera
        if (enableSuspension) {
             // Simple approximation: Tilt camera slightly with drift
             vec3.x += currentDriftRef.current * 0.1;
             vec3.y += currentPitchRef.current * 0.05; // Camera moves with nose
        }

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
  let chassisColor = color || "#ef4444"; 
  let emissiveColor = "#000000";
  let emissiveIntensity = 0;

  if (isGhost && !color) {
    chassisColor = "#39ff14"; 
    emissiveColor = "#39ff14";
    emissiveIntensity = 0.6;
  }
  
  if (label) {
      emissiveColor = chassisColor;
      emissiveIntensity = 0.2;
  }

  const wheelColor = (isGhost && !color) ? "#113311" : "#0f172a";
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

      {/* Main Car Group (Follows Path) */}
      <group ref={carRef}>
        
         {/* Label inside carRef so it moves with it */}
         {label && (
            <Text 
                position={[0, 1.2, 0]} 
                fontSize={0.3} 
                color="white" 
                anchorX="center" 
                anchorY="bottom"
                outlineWidth={0.04}
                outlineColor={chassisColor}
            >
                {label}
            </Text>
         )}

        {/* Suspended Mass (Chassis, Cockpit, Lights) - Rotates with Suspension */}
        <group ref={chassisRef}>
            
            {/* --- COCKPIT HUD (Only visible in Cockpit Mode) --- */}
            {!isGhost && cameraMode === CameraMode.COCKPIT && (
                <group position={[0, 0.32, 0.7]} rotation={[0, Math.PI, 0]}>
                    {/* Holographic Glass Panel */}
                    <mesh position={[0, 0, 0.01]}>
                        <planeGeometry args={[0.35, 0.15]} />
                        <meshBasicMaterial color="#0f172a" transparent opacity={0.6} side={THREE.DoubleSide} />
                    </mesh>
                    <lineSegments>
                        <edgesGeometry args={[new THREE.PlaneGeometry(0.35, 0.15)]} />
                        <lineBasicMaterial color="#3b82f6" opacity={0.5} transparent />
                    </lineSegments>

                    {/* Speed (Center) */}
                    <Text 
                        ref={speedTextRef}
                        position={[0, 0.02, 0]} 
                        fontSize={0.08} 
                        color="white" 
                        anchorX="center" 
                        anchorY="middle"
                        font="https://fonts.gstatic.com/s/roboto/v18/KFOmCnqEu92Fr1Mu4mxM.woff"
                    >
                        0
                    </Text>
                    <Text 
                        position={[0, -0.04, 0]} 
                        fontSize={0.02} 
                        color="#94a3b8" 
                        anchorX="center" 
                        anchorY="middle"
                    >
                        KM/H
                    </Text>

                    {/* Gear (Top Left) */}
                    <group position={[-0.12, 0.03, 0]}>
                        <Text 
                            position={[0, 0.01, 0]} 
                            fontSize={0.015} 
                            color="#94a3b8" 
                            anchorX="center"
                        >
                            GEAR
                        </Text>
                        <Text 
                            ref={gearTextRef}
                            position={[0, -0.02, 0]} 
                            fontSize={0.05} 
                            color="#eab308" 
                            anchorX="center"
                        >
                            1
                        </Text>
                    </group>

                    {/* RPM Bar (Bottom) */}
                    <group position={[0, -0.06, 0.01]}>
                        {/* Background Bar */}
                        <mesh position={[0, 0, 0]}>
                            <planeGeometry args={[0.3, 0.015]} />
                            <meshBasicMaterial color="#1e293b" />
                        </mesh>
                        {/* Active Bar */}
                        <mesh ref={rpmBarRef} position={[-0.15, 0, 0.001]}>
                            <planeGeometry args={[0.3, 0.015]} />
                            <meshBasicMaterial color="#00ffaa" />
                        </mesh>
                    </group>
                </group>
            )}

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
                        {/* Light Beams */}
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

            {/* Brake Lights */}
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

            {/* Wings */}
            <mesh position={[0, 0.4, -0.85]}>
            <boxGeometry args={[0.9, 0.02, 0.3]} />
            <meshStandardMaterial color={isGhost ? "#39ff14" : "#334155"} transparent={transparent} opacity={opacity} />
            </mesh>
            <mesh position={[0, 0.1, 0.9]}>
            <boxGeometry args={[0.9, 0.02, 0.3]} />
            <meshStandardMaterial color={isGhost ? "#39ff14" : "#334155"} transparent={transparent} opacity={opacity} />
            </mesh>
        </group> {/* End Chassis Group */}

        {/* --- Wheels (Stay on the 'Ground' / Parent Group) --- */}
        {/* They do NOT inherit chassis pitch/roll, creating a realistic suspension effect where body moves over wheels */}
        
        {/* Front Left (Steers + Rolls) */}
        <group position={[0.35, 0.15, 0.5]} ref={flSteerRef}>
           <group ref={flRollRef}>
              <WheelMesh color={wheelColor} opacity={opacity} transparent={transparent} />
           </group>
        </group>

        {/* Front Right (Steers + Rolls) */}
        <group position={[-0.35, 0.15, 0.5]} ref={frSteerRef}>
           <group ref={frRollRef}>
              <WheelMesh color={wheelColor} opacity={opacity} transparent={transparent} />
           </group>
        </group>

        {/* Rear Left (Rolls only) */}
        <group position={[0.35, 0.15, -0.6]} ref={blRollRef}>
            <WheelMesh color={wheelColor} opacity={opacity} transparent={transparent} />
        </group>

        {/* Rear Right (Rolls only) */}
        <group position={[-0.35, 0.15, -0.6]} ref={brRollRef}>
            <WheelMesh color={wheelColor} opacity={opacity} transparent={transparent} />
        </group>

      </group>
    </group>
  );
};

export default Car;