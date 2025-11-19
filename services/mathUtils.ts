import * as THREE from 'three';
import { ConeData, ConeType, PathPoint, TrackMetadata } from '../types';
import { PHYSICS, VISUALS } from '../constants';

// --- Helper: Generate UUID ---
export const generateId = () => Math.random().toString(36).substring(2, 9);

// --- Helper: Parse CSV ---
export const parseTrackData = (csv: string): ConeData[] => {
  const lines = csv.split('\n');
  const cones: ConeData[] = [];
  
  lines.forEach(line => {
    const parts = line.split(',');
    if (parts.length < 3) return;
    
    const tag = parts[0].trim();
    const x = parseFloat(parts[1]);
    const y = parseFloat(parts[2]); // CSV y corresponds to our Z in 3D usually, but we map to 2D plane

    if (isNaN(x) || isNaN(y)) return;

    if (tag.includes('blue')) {
      cones.push({ id: generateId(), x, y, z: 0, type: ConeType.BLUE });
    } else if (tag.includes('yellow')) {
      cones.push({ id: generateId(), x, y, z: 0, type: ConeType.YELLOW });
    } else if (tag.includes('car_start')) {
      cones.push({ id: generateId(), x, y, z: 0, type: ConeType.CAR_START });
    } else if (tag.includes('orange')) {
      cones.push({ id: generateId(), x, y, z: 0, type: ConeType.ORANGE });
    }
  });
  
  return cones;
};

// --- Optimization 1: Laplacian Smoother (Elastic Band) ---
export const optimizeRacingLine = (centerPoints: THREE.Vector3[]): THREE.Vector3[] => {
  if (centerPoints.length < 3) return centerPoints;

  // Clone points to avoid mutating original centerline
  let racingLine = centerPoints.map(p => p.clone());
  
  // Parameters
  const iterations = 20; 
  const smoothingFactor = 0.3; // Pull towards neighbors
  
  // Track Boundary Constraint (Hard limit for visuals)
  const MAX_DEVIATION = 1.9; 

  const getIdx = (i: number, len: number) => (i + len) % len;

  for (let iter = 0; iter < iterations; iter++) {
    const newPos = racingLine.map(p => p.clone());

    for (let i = 0; i < racingLine.length; i++) {
      const prev = racingLine[getIdx(i - 1, racingLine.length)];
      const curr = racingLine[i];
      const next = racingLine[getIdx(i + 1, racingLine.length)];
      
      const center = centerPoints[i];

      // Laplacian smoothing
      const avgX = (prev.x + next.x) / 2;
      const avgZ = (prev.z + next.z) / 2; 

      newPos[i].x += (avgX - curr.x) * smoothingFactor;
      newPos[i].z += (avgZ - curr.z) * smoothingFactor;
      
      // Constraint Solver
      const dx = newPos[i].x - center.x;
      const dz = newPos[i].z - center.z;
      const distSq = dx*dx + dz*dz;
      
      if (distSq > MAX_DEVIATION * MAX_DEVIATION) {
          const dist = Math.sqrt(distSq);
          const ratio = MAX_DEVIATION / dist;
          newPos[i].x = center.x + dx * ratio;
          newPos[i].z = center.z + dz * ratio;
      }
    }
    racingLine = newPos;
  }

  return racingLine;
};

// --- Optimization 2: RRT* (Stochastic Shortcut Optimization) ---
export const optimizeRRTStar = (centerPoints: THREE.Vector3[]): THREE.Vector3[] => {
  if (centerPoints.length < 3) return centerPoints;

  // Initialize with centerline
  let path = centerPoints.map(p => p.clone());
  const len = path.length;
  
  // RRT* Parameters
  const ITERATIONS = 6000; // High sample count for better convergence
  const MAX_LOOKAHEAD = 50; // Look further ahead for shortcuts
  const TRACK_LIMIT = 1.85; 

  // Helper: Check validity of a shortcut candidate
  // We approximate continuous collision detection by sampling points along the shortcut
  const isShortcutValid = (idxStart: number, idxEndRaw: number, pStart: THREE.Vector3, pEnd: THREE.Vector3): boolean => {
      const distIdx = idxEndRaw - idxStart;
      if (distIdx <= 1) return true; // Neighbors are always connected

      // Check resolution: Every index step or at least 1m
      const samples = distIdx; 

      for(let k=1; k<samples; k++) {
          const t = k / samples;
          const candPos = new THREE.Vector3().lerpVectors(pStart, pEnd, t);

          // Corresponding spot on centerline (Linear Approx)
          const centerT = idxStart + distIdx * t;
          const idxLow = Math.floor(centerT) % len;
          const idxHigh = (idxLow + 1) % len;
          const subT = centerT - Math.floor(centerT);
          
          const centerPos = new THREE.Vector3().lerpVectors(centerPoints[idxLow], centerPoints[idxHigh], subT);

          if (candPos.distanceToSquared(centerPos) > TRACK_LIMIT * TRACK_LIMIT) {
              return false; // Collision with track edge
          }
      }
      return true;
  };

  // Phase 1: Stochastic Rewiring
  // Randomly picks two points and tries to connect them with a straight line (shortcut)
  for (let k = 0; k < ITERATIONS; k++) {
      const idxA = Math.floor(Math.random() * len);
      const jump = Math.floor(Math.random() * MAX_LOOKAHEAD) + 2;
      const idxB_Raw = idxA + jump;
      const idxB = idxB_Raw % len;

      const pA = path[idxA];
      const pB = path[idxB];

      // If straight line A->B is valid, replace intermediate nodes
      if (isShortcutValid(idxA, idxB_Raw, pA, pB)) {
          for (let i = 1; i < jump; i++) {
              const targetIdx = (idxA + i) % len;
              const t = i / jump;
              const newPos = new THREE.Vector3().lerpVectors(pA, pB, t);
              path[targetIdx].copy(newPos);
          }
      }
  }

  // Phase 2: Post-Process Smoothing
  // RRT* by itself creates jagged "polygonal" paths. 
  // We run a Laplacian smoother to round off the sharp corners created by shortcuts.
  const SMOOTH_ITERATIONS = 60;
  const SMOOTH_FACTOR = 0.3;

  for (let k = 0; k < SMOOTH_ITERATIONS; k++) {
      const nextPath = path.map(p => p.clone());
      for (let i = 0; i < len; i++) {
          const prev = path[(i - 1 + len) % len];
          const curr = path[i];
          const next = path[(i + 1) % len];

          // Laplacian: Move towards average of neighbors
          nextPath[i].x += ((prev.x + next.x) / 2 - curr.x) * SMOOTH_FACTOR;
          nextPath[i].z += ((prev.z + next.z) / 2 - curr.z) * SMOOTH_FACTOR;

          // Constraint Enforcing: Ensure we don't smooth "off" the track
          const center = centerPoints[i];
          const dx = nextPath[i].x - center.x;
          const dz = nextPath[i].z - center.z;
          const distSq = dx*dx + dz*dz;

          if (distSq > TRACK_LIMIT * TRACK_LIMIT) {
              const dist = Math.sqrt(distSq);
              const ratio = TRACK_LIMIT / dist;
              nextPath[i].x = center.x + dx * ratio;
              nextPath[i].z = center.z + dz * ratio;
          }
      }
      path = nextPath;
  }

  return path;
};

// --- Optimization 3: QP / Biharmonic Smoothing (Minimum Curvature) ---
// Modified to accept an initialGuess (e.g. from RRT*)
export const optimizeQP = (centerPoints: THREE.Vector3[], initialGuess?: THREE.Vector3[]): THREE.Vector3[] => {
  if (centerPoints.length < 3) return centerPoints;

  // Initialize with initialGuess if provided, otherwise centerline
  let path = initialGuess 
    ? initialGuess.map(p => p.clone()) 
    : centerPoints.map(p => p.clone());

  // Safety check: lengths must match for constraint logic
  if (path.length !== centerPoints.length) {
      path = centerPoints.map(p => p.clone());
  }

  const len = path.length;

  // Algorithm: Iterative Biharmonic Smoothing
  const ITERATIONS = 200; 
  const ALPHA = 0.1; // Learning rate
  const TRACK_LIMIT = 1.8; // Constraint width

  for (let k = 0; k < ITERATIONS; k++) {
      const nextPath = path.map(p => p.clone());
      
      for (let i = 0; i < len; i++) {
          const im2 = (i - 2 + len) % len;
          const im1 = (i - 1 + len) % len;
          const ip1 = (i + 1) % len;
          const ip2 = (i + 2) % len;

          // Biharmonic Operator (Finite Difference for 4th derivative d4/dx4)
          const targetX = (-path[im2].x + 4*path[im1].x + 4*path[ip1].x - path[ip2].x) / 6;
          const targetZ = (-path[im2].z + 4*path[im1].z + 4*path[ip1].z - path[ip2].z) / 6;

          // Move towards target
          nextPath[i].x += (targetX - path[i].x) * ALPHA;
          nextPath[i].z += (targetZ - path[i].z) * ALPHA;

          // Enforce Constraints (Always relative to the original CENTER line)
          const center = centerPoints[i];
          const dx = nextPath[i].x - center.x;
          const dz = nextPath[i].z - center.z;
          const distSq = dx*dx + dz*dz;

          if (distSq > TRACK_LIMIT * TRACK_LIMIT) {
              const dist = Math.sqrt(distSq);
              const ratio = TRACK_LIMIT / dist;
              nextPath[i].x = center.x + dx * ratio;
              nextPath[i].z = center.z + dz * ratio;
          }
      }
      path = nextPath;
  }

  return path;
};

// --- Optimization 4: Hybrid (QP + Laplacian Blend) ---
export const optimizeHybrid = (centerPoints: THREE.Vector3[]): THREE.Vector3[] => {
  if (centerPoints.length < 3) return centerPoints;

  let path = centerPoints.map(p => p.clone());
  const len = path.length;
  
  const ITERATIONS = 100;
  const ALPHA = 0.15; // Learning rate
  const TRACK_LIMIT = 1.8;
  const QP_WEIGHT = 0.6; // 60% Curvature Min (QP), 40% Shortest Path (Laplacian)

  for (let k = 0; k < ITERATIONS; k++) {
      const nextPath = path.map(p => p.clone());

      for (let i = 0; i < len; i++) {
          const im2 = (i - 2 + len) % len;
          const im1 = (i - 1 + len) % len;
          const ip1 = (i + 1) % len;
          const ip2 = (i + 2) % len;

          // 1. Laplacian Target (Shortest Path)
          const laplacianX = (path[im1].x + path[ip1].x) / 2;
          const laplacianZ = (path[im1].z + path[ip1].z) / 2;

          // 2. QP/Biharmonic Target (Min Curvature)
          const qpX = (-path[im2].x + 4*path[im1].x + 4*path[ip1].x - path[ip2].x) / 6;
          const qpZ = (-path[im2].z + 4*path[im1].z + 4*path[ip1].z - path[ip2].z) / 6;

          // 3. Blend
          const targetX = (1 - QP_WEIGHT) * laplacianX + QP_WEIGHT * qpX;
          const targetZ = (1 - QP_WEIGHT) * laplacianZ + QP_WEIGHT * qpZ;

          // Move towards target
          nextPath[i].x += (targetX - path[i].x) * ALPHA;
          nextPath[i].z += (targetZ - path[i].z) * ALPHA;

          // Enforce Constraints
          const center = centerPoints[i];
          const dx = nextPath[i].x - center.x;
          const dz = nextPath[i].z - center.z;
          const distSq = dx*dx + dz*dz;

          if (distSq > TRACK_LIMIT * TRACK_LIMIT) {
              const dist = Math.sqrt(distSq);
              const ratio = TRACK_LIMIT / dist;
              nextPath[i].x = center.x + dx * ratio;
              nextPath[i].z = center.z + dz * ratio;
          }
      }
      path = nextPath;
  }
  return path;
};

// --- Optimization 5: Pipeline RRT* + QP ---
export const optimizeRRTQP = (centerPoints: THREE.Vector3[]): THREE.Vector3[] => {
    // 1. Exploration: Find topology and shortcuts using RRT*
    // This finds the "Global Best Guess" through the track
    const rrtPath = optimizeRRTStar(centerPoints);

    // 2. Optimization: Polish the rough shortcuts with Minimum Curvature (QP)
    // This transforms the jagged shortcuts into physically drivable arcs
    // We pass rrtPath as the initial guess, but use centerPoints for constraints
    return optimizeQP(centerPoints, rrtPath);
};

// --- 1. Pairing Logic (Improved with Spatial Filtering) ---
export const calculateCenterline = (cones: ConeData[]): THREE.Vector3[] => {
  const blues = cones.filter(c => c.type === ConeType.BLUE);
  const yellows = cones.filter(c => c.type === ConeType.YELLOW);
  const startNode = cones.find(c => c.type === ConeType.CAR_START);
  
  const startPos = startNode ? { x: startNode.x, y: startNode.y } : { x: 0, y: 0 };

  if (!yellows.length || !blues.length) return [];

  // 1. Generate Candidate Pairs (Yellow -> Nearest Blue)
  const candidates: { x: number, y: number, pairingDist: number }[] = [];

  yellows.forEach(yPt => {
    let minDist = Infinity;
    let nearestBlue = null;
    
    blues.forEach(bPt => {
        const dx = yPt.x - bPt.x;
        const dy = yPt.y - bPt.y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < minDist) { 
            minDist = d; 
            nearestBlue = bPt; 
        }
    });

    // Constraint: Only accept pairs within valid track width
    if (nearestBlue && minDist < PHYSICS.TRACK_WIDTH_LIMIT) {
        candidates.push({ 
            x: (yPt.x + nearestBlue.x) / 2, 
            y: (yPt.y + nearestBlue.y) / 2,
            pairingDist: minDist
        });
    }
  });

  if (candidates.length === 0) return [];

  // 2. Filter Overlaps / Superpositions
  // "Keep the closest" -> We prioritize points from tighter/better-defined sections (shorter pairing dist).
  // This ensures that if a point from a wide straight overlaps a point from a tight corner, we keep the corner point.
  candidates.sort((a, b) => a.pairingDist - b.pairingDist);

  const midpoints: {x: number, y: number}[] = [];
  const MIN_SPACING = 2.5; // Meters. Prevents knots/overlaps (z-fighting)

  candidates.forEach(cand => {
      // Check if this candidate is too close to any already accepted midpoint
      const isTooClose = midpoints.some(m => {
          const dx = m.x - cand.x;
          const dy = m.y - cand.y;
          return (dx*dx + dy*dy) < (MIN_SPACING * MIN_SPACING);
      });

      if (!isTooClose) {
          midpoints.push({ x: cand.x, y: cand.y });
      }
  });

  if (midpoints.length === 0) return [];

  // 3. Sort Points (Greedy Nearest Neighbor with Directional Bias)
  const sortedPoints: THREE.Vector3[] = [];
  const visited = new Set<number>();

  // Find closest midpoint to Start Position
  let startIdx = -1;
  let minStartDist = Infinity;
  
  midpoints.forEach((pt, i) => {
      const dx = startPos.x - pt.x;
      const dy = startPos.y - pt.y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < minStartDist) { 
          minStartDist = d; 
          startIdx = i; 
      }
  });

  if (startIdx === -1) return [];

  let currentIdx = startIdx;
  sortedPoints.push(new THREE.Vector3(midpoints[currentIdx].x, 0, midpoints[currentIdx].y));
  visited.add(currentIdx);

  while (sortedPoints.length < midpoints.length) {
      const currentPos = midpoints[currentIdx];
      let nearestIdx = -1;
      let minScore = Infinity;

      // Determine current heading from previous points
      let heading: THREE.Vector3 | null = null;
      if (sortedPoints.length > 1) {
          const p1 = sortedPoints[sortedPoints.length - 2];
          const p2 = sortedPoints[sortedPoints.length - 1];
          heading = new THREE.Vector3().subVectors(p2, p1).normalize();
      }

      for (let i = 0; i < midpoints.length; i++) {
          if (!visited.has(i)) {
              const dx = midpoints[i].x - currentPos.x;
              const dy = midpoints[i].y - currentPos.y;
              const dSq = dx*dx + dy*dy;
              const d = Math.sqrt(dSq);
              
              // Heuristic Score = Distance * Penalty
              let penalty = 1.0;
              if (heading) {
                  const toCandidate = new THREE.Vector3(dx, 0, dy).normalize();
                  const alignment = heading.dot(toCandidate); // 1.0 = forward, -1.0 = backward
                  penalty = 3.0 - 2.0 * alignment; 
              }

              const score = d * penalty;
              
              if (score < minScore) { 
                  minScore = score; 
                  nearestIdx = i; 
              }
          }
      }

      // Jump detection using constant from Physics
      const rawDist = nearestIdx !== -1 
          ? Math.sqrt(Math.pow(midpoints[nearestIdx].x - currentPos.x, 2) + Math.pow(midpoints[nearestIdx].y - currentPos.y, 2))
          : Infinity;

      if (nearestIdx === -1 || rawDist > PHYSICS.TRACK_WIDTH_LIMIT) break;

      sortedPoints.push(new THREE.Vector3(midpoints[nearestIdx].x, 0, midpoints[nearestIdx].y));
      visited.add(nearestIdx);
      currentIdx = nearestIdx;
  }

  return sortedPoints;
};

// --- 2. Path Generation & Physics Engine ---
export const generateDetailedPath = (controlPoints: THREE.Vector3[]): PathPoint[] => {
  if (controlPoints.length < 3) return [];

  const curve = new THREE.CatmullRomCurve3(controlPoints);
  curve.closed = true; 
  curve.curveType = 'catmullrom';
  curve.tension = 0.5;

  const samples = Math.max(200, controlPoints.length * 8); 
  const points = curve.getSpacedPoints(samples);
  
  const pathData: PathPoint[] = [];
  let cumulativeDist = 0;
  const maxGripAcc = PHYSICS.FRICTION_COEFF * PHYSICS.GRAVITY; 

  // --- Pass 0: Geometry & Apex Limits ---
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0) cumulativeDist += p.distanceTo(points[i - 1]);

    const prevIdx = (i - 1 + points.length) % points.length;
    const nextIdx = (i + 1) % points.length;

    const pPrev = points[prevIdx];
    const pNext = points[nextIdx];
    
    const v1 = new THREE.Vector3().subVectors(p, pPrev).normalize();
    const v2 = new THREE.Vector3().subVectors(pNext, p).normalize();
    
    const angle = v1.angleTo(v2);
    const segLen = pPrev.distanceTo(p) + p.distanceTo(pNext);
    
    // Local curvature
    const k = angle / (segLen * 0.5 + 0.001);

    const radius = k > 0.001 ? 1 / k : 10000;
    const maxLatVel = Math.sqrt(maxGripAcc * radius);
    const limitVel = Math.min(maxLatVel, PHYSICS.MAX_VELOCITY);

    const yaw = Math.atan2(v2.z, v2.x);
    const pitch = Math.asin(v2.y);

    pathData.push({
      x: p.x,
      y: p.z,
      z: p.y,
      dist: cumulativeDist,
      curvature: k,
      maxVelocity: limitVel,
      velocity: limitVel, // Initialize with MAX possible
      acceleration: 0,
      yaw: -yaw,
      pitch: pitch,
      color: '#ffffff'
    });
  }

  // --- Flying Lap Solver (Circular Integration) ---
  // Iterate to connect end -> start ensures the car carries speed across the start/finish line.
  const ITERATIONS = 4; // Increased iterations for better convergence

  for(let iter = 0; iter < ITERATIONS; iter++) {
    
    // 1. Link End -> Start (Anticipate Turn 1 braking from the previous lap)
    // We seed the End velocity from the Start velocity of the previous pass (or current state)
    if (iter > 0) {
      const startVel = pathData[0].velocity;
      const endVel = pathData[pathData.length - 1].velocity;
      // The true boundary condition is that start velocity MUST equal end velocity
      pathData[pathData.length - 1].velocity = Math.min(endVel, startVel);
    }

    // Pass 1: Backward (Braking Solver)
    for (let i = pathData.length - 2; i >= 0; i--) {
      const dist = pathData[i+1].dist - pathData[i].dist;
      const vNext = pathData[i+1].velocity;
      const k = pathData[i].curvature;

      // Traction Circle (approx)
      const latAccel = vNext * vNext * k;
      const gripSq = maxGripAcc * maxGripAcc;
      const latSq = latAccel * latAccel;
      
      // Available longitudinal grip for braking
      const availableDecel = Math.sqrt(Math.max(0, gripSq - latSq));
      const brakingLimit = Math.min(availableDecel, PHYSICS.MAX_BRAKING);

      // v_current^2 = v_next^2 + 2 * a * d
      const vLimit = Math.sqrt(vNext * vNext + 2 * brakingLimit * dist);
      pathData[i].velocity = Math.min(pathData[i].velocity, vLimit);
    }

    // 2. Link Start -> End (Carry Momentum)
    // The speed at index 0 is determined by the end of the previous lap
    const endVel = pathData[pathData.length - 1].velocity;
    pathData[0].velocity = endVel;

    // Pass 2: Forward (Acceleration Solver)
    for (let i = 1; i < pathData.length; i++) {
      const dist = pathData[i].dist - pathData[i-1].dist;
      const vPrev = pathData[i-1].velocity;
      const k = pathData[i].curvature;

      const latAccel = vPrev * vPrev * k;
      const gripSq = maxGripAcc * maxGripAcc;
      const latSq = latAccel * latAccel;
      
      const availableAccel = Math.sqrt(Math.max(0, gripSq - latSq));
      const engineLimit = Math.min(availableAccel, PHYSICS.MAX_ACCEL);

      // v_current^2 = v_prev^2 + 2 * a * d
      const vLimit = Math.sqrt(vPrev * vPrev + 2 * engineLimit * dist);
      pathData[i].velocity = Math.min(pathData[i].velocity, vLimit);
    }
    
    // Sync final point again to ensure closed loop consistency
    pathData[pathData.length-1].velocity = pathData[0].velocity;
  }

  // --- Pass 3: Calculate Final Acceleration & Heatmap ---
  for (let i = 0; i < pathData.length - 1; i++) {
    const p = pathData[i];
    const pNext = pathData[i+1];
    const dist = pNext.dist - p.dist;
    
    let accel = (pNext.velocity * pNext.velocity - p.velocity * p.velocity) / (2 * dist);
    
    // Filter noise
    if (Math.abs(accel) < 0.1) accel = 0;
    p.acceleration = accel;

    const color = new THREE.Color();
    if (accel < -0.5) {
      const t = Math.min(Math.abs(accel) / PHYSICS.MAX_BRAKING, 1);
      color.lerpColors(new THREE.Color(VISUALS.COLOR_BRAKE), new THREE.Color(VISUALS.COLOR_BRAKE), t);
    } else if (accel > 0.5) {
      const t = Math.min(accel / PHYSICS.MAX_ACCEL, 1);
      color.lerpColors(new THREE.Color(VISUALS.COLOR_ACCEL), new THREE.Color(VISUALS.COLOR_ACCEL), t);
    } else {
      color.set(VISUALS.COLOR_COAST);
    }
    p.color = '#' + color.getHexString();
  }
  
  // Handle last point
  const last = pathData[pathData.length - 1];
  last.acceleration = pathData[0].acceleration;
  last.color = pathData[0].color;

  return pathData;
};

export const getTrackMetadata = (path: PathPoint[]): TrackMetadata => {
  if (path.length === 0) return { name: 'Empty', totalLength: 0, avgSpeed: 0, estLapTime: 0, maxLatG: 0, maxLongG: 0, minLongG: 0 };
  
  const totalLength = path[path.length - 1].dist;
  const avgSpeed = path.reduce((acc, p) => acc + p.velocity, 0) / path.length;
  const estLapTime = totalLength / (avgSpeed + 0.01); 
  
  let maxLatG = 0;
  let maxLongG = 0;
  let minLongG = 0;

  path.forEach(p => {
    const latG = (p.velocity * p.velocity * p.curvature) / PHYSICS.GRAVITY;
    const longG = p.acceleration / PHYSICS.GRAVITY;
    if (latG > maxLatG) maxLatG = latG;
    if (longG > maxLongG) maxLongG = longG;
    if (longG < minLongG) minLongG = longG;
  });

  return {
    name: 'Custom Circuit',
    totalLength,
    avgSpeed,
    estLapTime,
    maxLatG,
    maxLongG,
    minLongG
  };
};
