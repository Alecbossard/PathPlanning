import React, { useMemo, useRef } from 'react';
import { ConeData, ConeType, PathPoint, EditorState } from '../types';
import { VISUALS } from '../constants';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { ThreeEvent, useThree } from '@react-three/fiber';

interface TrackObjectsProps {
  cones: ConeData[];
  roadPath: PathPoint[];   // Asphalt Geometry
  racingPath: PathPoint[]; // Colored Line
  editorState: EditorState;
  onConeMove: (id: string, x: number, z: number) => void;
  onConeSelect: (id: string | null) => void;
}

interface DraggableConeProps {
  cone: ConeData;
  isSelected: boolean;
  mode: string;
  onMove: (id: string, x: number, z: number) => void;
  onSelect: (id: string) => void;
}

// Draggable Cone Component
const DraggableCone: React.FC<DraggableConeProps> = ({ 
  cone, 
  isSelected, 
  mode,
  onMove, 
  onSelect 
}) => {
  let color = VISUALS.BLUE_COLOR;
  if (cone.type === ConeType.YELLOW) color = VISUALS.YELLOW_COLOR;
  if (cone.type === ConeType.CAR_START) color = VISUALS.ORANGE_COLOR;
  if (cone.type === ConeType.ORANGE) color = VISUALS.ORANGE_COLOR;

  const { raycaster } = useThree();
  const isDragging = useRef(false);
  const planeIntersect = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  
  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (mode !== 'EDIT') {
        onSelect(cone.id);
        return;
    }
    e.stopPropagation();
    isDragging.current = true;
    onSelect(cone.id);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    isDragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (isDragging.current && mode === 'EDIT') {
      e.stopPropagation();
      const target = new THREE.Vector3();
      raycaster.ray.intersectPlane(planeIntersect, target);
      onMove(cone.id, target.x, target.z);
    }
  };

  return (
    <group position={[cone.x, 0, cone.y]}>
      <mesh
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        castShadow
        position={[0, VISUALS.CONE_HEIGHT/2, 0]}
      >
        {cone.type === ConeType.CAR_START ? (
           <boxGeometry args={[0.4, 0.4, 0.4]} />
        ) : (
           <coneGeometry args={[VISUALS.CONE_RADIUS, VISUALS.CONE_HEIGHT, 32]} />
        )}
        <meshStandardMaterial 
          color={color} 
          emissive={isSelected ? '#ffffff' : '#000000'}
          emissiveIntensity={isSelected ? 0.5 : 0}
          roughness={0.3}
        />
      </mesh>
      {/* Cone Base/Shadow fake */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI/2,0,0]}>
         <circleGeometry args={[VISUALS.CONE_RADIUS + 0.05, 16]} />
         <meshBasicMaterial color="black" opacity={0.4} transparent depthWrite={false} />
      </mesh>
    </group>
  );
};

// Dedicated Racing Line Component to ensure Geometry Updates correctly
const RacingLine: React.FC<{ points: PathPoint[] }> = ({ points }) => {
    const geometry = useMemo(() => {
        if (points.length === 0) return null;

        const geo = new THREE.BufferGeometry();
        
        // Flatten positions [x, y, z]
        const positions = new Float32Array(points.length * 3);
        // Flatten colors [r, g, b]
        const colors = new Float32Array(points.length * 3);

        points.forEach((p, i) => {
            positions[i * 3] = p.x;
            positions[i * 3 + 1] = 0.05; // Lift slightly above asphalt to avoid z-fighting
            positions[i * 3 + 2] = p.y;

            const c = new THREE.Color(p.color);
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
        });

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeBoundingSphere();

        return geo;
    }, [points]);

    if (!geometry) return null;

    return (
        <lineLoop geometry={geometry} frustumCulled={false}>
            <lineBasicMaterial 
                vertexColors 
                linewidth={3} 
                opacity={1.0} 
                transparent 
                depthTest={false} // Always draw on top
                toneMapped={false} // Ignore lighting/post-processing for vibrant HUD colors
            />
        </lineLoop>
    );
};

// Procedural Road Mesh Generation
const RoadMesh: React.FC<{ path: PathPoint[] }> = ({ path }) => {
    const geometry = useMemo(() => {
        // We use 'path' (Road Path) for the geometry generation
        // This ensures the road stays fixed even if racingPath changes
        if (path.length < 2) return null;

        const TRACK_WIDTH = 5.0; 
        const KERB_WIDTH = 0.4;
        
        // Asphalt Lists
        const aVertices: number[] = [];
        const aIndices: number[] = [];
        
        // Kerb Lists
        const kVertices: number[] = [];
        const kColors: number[] = [];
        const kIndices: number[] = [];

        for (let i = 0; i < path.length; i++) {
            const p = path[i];
            
            // Smooth Tangents
            const prevIdx = (i - 1 + path.length) % path.length;
            const nextIdx = (i + 1) % path.length;
            
            const prev = path[prevIdx];
            const next = path[nextIdx];
            
            let dx = next.x - prev.x;
            let dz = next.y - prev.y;
            const len = Math.sqrt(dx*dx + dz*dz) || 1;
            
            const nx = -dz / len;
            const nz = dx / len;

            // --- Asphalt ---
            const lx = p.x + nx * (TRACK_WIDTH / 2);
            const lz = p.y + nz * (TRACK_WIDTH / 2);
            const rx = p.x - nx * (TRACK_WIDTH / 2);
            const rz = p.y - nz * (TRACK_WIDTH / 2);

            aVertices.push(lx, 0.015, lz); // Slightly above ground
            aVertices.push(rx, 0.015, rz);

            // --- Kerbs ---
            // Left Kerb Outer Edge
            const kLxOut = p.x + nx * (TRACK_WIDTH / 2 + KERB_WIDTH);
            const kLzOut = p.y + nz * (TRACK_WIDTH / 2 + KERB_WIDTH);
            // Right Kerb Outer Edge
            const kRxOut = p.x - nx * (TRACK_WIDTH / 2 + KERB_WIDTH);
            const kRzOut = p.y - nz * (TRACK_WIDTH / 2 + KERB_WIDTH);

            // Add vertices for this slice
            // 0: Left Out, 1: Left In (Road Edge), 2: Right In (Road Edge), 3: Right Out
            kVertices.push(kLxOut, 0.02, kLzOut); 
            kVertices.push(lx, 0.02, lz);
            kVertices.push(rx, 0.02, rz);
            kVertices.push(kRxOut, 0.02, kRzOut);

            // Checkerboard pattern calculation
            const segLength = 1.0; 
            const isRed = Math.floor(p.dist / segLength) % 2 === 0;
            const c = isRed ? [0.8, 0.1, 0.1] : [0.9, 0.9, 0.9];
            
            kColors.push(...c, ...c, ...c, ...c);
        }

        // Indices Generation
        for (let i = 0; i < path.length - 1; i++) {
            // Asphalt Triangles
            const aOffset = i * 2;
            aIndices.push(aOffset, aOffset + 1, aOffset + 2);
            aIndices.push(aOffset + 1, aOffset + 3, aOffset + 2);

            // Kerb Triangles
            const kOffset = i * 4;
            
            // Left Kerb
            kIndices.push(kOffset + 0, kOffset + 1, kOffset + 4);
            kIndices.push(kOffset + 1, kOffset + 5, kOffset + 4);

            // Right Kerb
            kIndices.push(kOffset + 2, kOffset + 3, kOffset + 6);
            kIndices.push(kOffset + 3, kOffset + 7, kOffset + 6);
        }

        const aGeo = new THREE.BufferGeometry();
        aGeo.setAttribute('position', new THREE.Float32BufferAttribute(aVertices, 3));
        aGeo.setIndex(aIndices);
        aGeo.computeVertexNormals();

        const kGeo = new THREE.BufferGeometry();
        kGeo.setAttribute('position', new THREE.Float32BufferAttribute(kVertices, 3));
        kGeo.setAttribute('color', new THREE.Float32BufferAttribute(kColors, 3));
        kGeo.setIndex(kIndices);
        kGeo.computeVertexNormals();

        return { aGeo, kGeo };
    }, [path]);

    if (!geometry) return null;

    return (
        <group>
            {/* Dark Asphalt */}
            <mesh geometry={geometry.aGeo} receiveShadow>
                <meshStandardMaterial 
                    color="#2a2a2a" 
                    roughness={0.8} 
                    metalness={0.1} 
                    side={THREE.DoubleSide}
                />
            </mesh>
            
            {/* Kerbs */}
            <mesh geometry={geometry.kGeo} receiveShadow>
                <meshStandardMaterial 
                    vertexColors 
                    roughness={0.6} 
                    side={THREE.DoubleSide}
                />
            </mesh>
        </group>
    );
}

const TrackObjects: React.FC<TrackObjectsProps> = ({ 
  cones, 
  roadPath,
  racingPath,
  editorState,
  onConeMove,
  onConeSelect
}) => {
  // Only show cones if we are NOT in purely VIEW mode.
  const showCones = editorState.mode !== 'VIEW';

  return (
    <group>
      {/* Render Cones (Plots) conditionally */}
      {showCones && cones.map(cone => (
        <DraggableCone 
          key={cone.id} 
          cone={cone} 
          isSelected={editorState.selectedConeId === cone.id}
          mode={editorState.mode}
          onMove={onConeMove}
          onSelect={onConeSelect}
        />
      ))}

      {/* Render Realistic Road (Asphalt follows Centerline) */}
      <RoadMesh path={roadPath} />

      {/* Render Trajectory separately to ensure it updates when algorithm changes */}
      <RacingLine points={racingPath} />

      {/* Start/Finish Label */}
      {roadPath.length > 0 && (
        <Text 
          position={[roadPath[0].x, 3.5, roadPath[0].y]} 
          fontSize={1} 
          color="white" 
          anchorX="center" 
          anchorY="bottom"
          outlineWidth={0.1}
          outlineColor="#000000"
        >
          START
        </Text>
      )}
    </group>
  );
};

export default TrackObjects;