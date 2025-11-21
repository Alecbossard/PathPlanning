import * as THREE from 'three';
import { ConeData, ConeType, PathPoint, TrackMetadata } from '../types';
import { PHYSICS, VISUALS } from '../constants';

// --- Helper: Generate UUID ---
export const generateId = () => Math.random().toString(36).substring(2, 9);

// --- Service: Fetch Community Tracks from GitHub ---
export const fetchGithubTracks = async (): Promise<Record<string, string>> => {
  const API_URL = "https://api.github.com/repos/guilhem0908/PathPlanning/contents/data";
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
        console.warn("Could not fetch GitHub tracks list");
        return {};
    }
    
    const files = await response.json();
    if (!Array.isArray(files)) return {};

    const csvFiles = files.filter((f: any) => f.name && f.name.endsWith('.csv'));
    const tracks: Record<string, string> = {};
    
    console.log(`Found ${csvFiles.length} community tracks on GitHub.`);

    await Promise.all(csvFiles.map(async (file: any) => {
       try {
         const res = await fetch(file.download_url);
         const text = await res.text();
         // Use filename without extension as key
         const key = file.name.replace('.csv', '');
         tracks[key] = text;
       } catch (err) {
         console.warn(`Failed to download track content: ${file.name}`, err);
       }
    }));
    
    return tracks;
  } catch (e) {
    console.error("Error connecting to GitHub tracks repository", e);
    return {};
  }
};

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
      
      // Constraint Solver (Dynamic Width)
      // The width is stored in center.y (we packed it there in calculateCenterline)
      const trackWidth = center.y > 0 ? center.y : 3.0;
      const halfWidth = trackWidth * 0.5;
      const limit = halfWidth * 0.9; // Stay 90% within boundary

      const dx = newPos[i].x - center.x;
      const dz = newPos[i].z - center.z;
      const distSq = dx*dx + dz*dz;
      
      if (distSq > limit * limit) {
          const dist = Math.sqrt(distSq);
          const ratio = limit / dist;
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

  // Helper: Check validity of a shortcut candidate
  const isShortcutValid = (idxStart: number, idxEndRaw: number, pStart: THREE.Vector3, pEnd: THREE.Vector3): boolean => {
      const distIdx = idxEndRaw - idxStart;
      if (distIdx <= 1) return true; 

      const samples = distIdx; 

      for(let k=1; k<samples; k++) {
          const t = k / samples;
          const candPos = new THREE.Vector3().lerpVectors(pStart, pEnd, t);

          // Corresponding spot on centerline (Linear Approx)
          const centerT = idxStart + distIdx * t;
          const idxLow = Math.floor(centerT) % len;
          const idxHigh = (idxLow + 1) % len;
          const subT = centerT - Math.floor(centerT);
          
          const pLow = centerPoints[idxLow];
          const pHigh = centerPoints[idxHigh];
          const centerPos = new THREE.Vector3().lerpVectors(pLow, pHigh, subT);
          
          // Interpolate Width
          const wLow = pLow.y > 0 ? pLow.y : 3.0;
          const wHigh = pHigh.y > 0 ? pHigh.y : 3.0;
          const currentWidth = wLow + (wHigh - wLow) * subT;
          const limit = (currentWidth * 0.5) * 0.9;

          if (candPos.distanceToSquared(centerPos) > limit * limit) {
              return false; // Collision with track edge
          }
      }
      return true;
  };

  // Phase 1: Stochastic Rewiring
  for (let k = 0; k < ITERATIONS; k++) {
      const idxA = Math.floor(Math.random() * len);
      const jump = Math.floor(Math.random() * MAX_LOOKAHEAD) + 2;
      const idxB_Raw = idxA + jump;
      const idxB = idxB_Raw % len;

      const pA = path[idxA];
      const pB = path[idxB];

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
  const SMOOTH_ITERATIONS = 60;
  const SMOOTH_FACTOR = 0.3;

  for (let k = 0; k < SMOOTH_ITERATIONS; k++) {
      const nextPath = path.map(p => p.clone());
      for (let i = 0; i < len; i++) {
          const prev = path[(i - 1 + len) % len];
          const curr = path[i];
          const next = path[(i + 1) % len];

          nextPath[i].x += ((prev.x + next.x) / 2 - curr.x) * SMOOTH_FACTOR;
          nextPath[i].z += ((prev.z + next.z) / 2 - curr.z) * SMOOTH_FACTOR;

          const center = centerPoints[i];
          const width = center.y > 0 ? center.y : 3.0;
          const limit = (width * 0.5) * 0.9;
          
          const dx = nextPath[i].x - center.x;
          const dz = nextPath[i].z - center.z;
          const distSq = dx*dx + dz*dz;

          if (distSq > limit * limit) {
              const dist = Math.sqrt(distSq);
              const ratio = limit / dist;
              nextPath[i].x = center.x + dx * ratio;
              nextPath[i].z = center.z + dz * ratio;
          }
      }
      path = nextPath;
  }

  return path;
};

// --- Optimization 3: QP / Biharmonic Smoothing (Minimum Curvature) ---
export const optimizeQP = (centerPoints: THREE.Vector3[], initialGuess?: THREE.Vector3[]): THREE.Vector3[] => {
  if (centerPoints.length < 3) return centerPoints;

  let path = initialGuess 
    ? initialGuess.map(p => p.clone()) 
    : centerPoints.map(p => p.clone());

  if (path.length !== centerPoints.length) {
      path = centerPoints.map(p => p.clone());
  }

  const len = path.length;

  // Algorithm: Iterative Biharmonic Smoothing
  const ITERATIONS = 200; 
  const ALPHA = 0.1; // Learning rate

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

          nextPath[i].x += (targetX - path[i].x) * ALPHA;
          nextPath[i].z += (targetZ - path[i].z) * ALPHA;

          // Enforce Constraints
          const center = centerPoints[i];
          const width = center.y > 0 ? center.y : 3.0;
          const limit = (width * 0.5) * 0.9;

          const dx = nextPath[i].x - center.x;
          const dz = nextPath[i].z - center.z;
          const distSq = dx*dx + dz*dz;

          if (distSq > limit * limit) {
              const dist = Math.sqrt(distSq);
              const ratio = limit / dist;
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
          const width = center.y > 0 ? center.y : 3.0;
          const limit = (width * 0.5) * 0.9;

          const dx = nextPath[i].x - center.x;
          const dz = nextPath[i].z - center.z;
          const distSq = dx*dx + dz*dz;

          if (distSq > limit * limit) {
              const dist = Math.sqrt(distSq);
              const ratio = limit / dist;
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
    const rrtPath = optimizeRRTStar(centerPoints);

    // 2. Optimization: Polish the rough shortcuts with Minimum Curvature (QP)
    return optimizeQP(centerPoints, rrtPath);
};

// --- Optimization 6: Local Planner (Basic 5-Cone Horizon) ---
export const optimizeLocalPlanner = (centerPoints: THREE.Vector3[]): THREE.Vector3[] => {
    if (centerPoints.length < 6) return centerPoints;

    const path: THREE.Vector3[] = [];
    // Start at the first point
    path.push(centerPoints[0].clone());

    // Simulate the car driving through the track step-by-step
    for (let i = 0; i < centerPoints.length - 1; i++) {
        const lookahead = 5;
        const windowPoints: THREE.Vector3[] = [];
        
        // Current committed position (start of this planning cycle)
        windowPoints.push(path[i].clone());

        // Look ahead 5 points from the Centerline (Ground Truth)
        // In a real car, these would be detected by LiDAR/Camera relative to car position
        for (let k = 1; k <= lookahead; k++) {
            const idx = (i + k) % centerPoints.length;
            windowPoints.push(centerPoints[idx].clone());
        }

        // Local Optimization: "Basic Algorithm"
        // Simple Elastic Band / Laplacian smoothing on this small window.
        // This simulates a driver smoothing out the immediate turn without seeing what comes after.
        const iterations = 15;
        for (let iter = 0; iter < iterations; iter++) {
            // Don't move start point (0) as it's where the car IS.
            // Move intermediate points to smooth the path.
            for (let j = 1; j < windowPoints.length - 1; j++) {
                 const prev = windowPoints[j-1];
                 const curr = windowPoints[j];
                 const next = windowPoints[j+1];

                 // Move towards average of neighbors (Shortest Path / Smoothing)
                 const tx = (prev.x + next.x) / 2;
                 const tz = (prev.z + next.z) / 2;
                 
                 curr.x += (tx - curr.x) * 0.5;
                 curr.z += (tz - curr.z) * 0.5;

                 // Constraints: Stay within track width of the original centerline
                 // We map window index j back to the global centerline index to check width
                 const originalIdx = (i + j) % centerPoints.length;
                 const center = centerPoints[originalIdx];
                 const width = center.y > 0 ? center.y : 3.0;
                 const limit = (width * 0.5) * 0.85; // 85% Safety margin

                 const dx = curr.x - center.x;
                 const dz = curr.z - center.z;
                 const distSq = dx*dx + dz*dz;
                 if(distSq > limit*limit){
                     const dist = Math.sqrt(distSq);
                     const ratio = limit/dist;
                     curr.x = center.x + dx*ratio;
                     curr.z = center.z + dz*ratio;
                 }
            }
        }

        // Receding Horizon: We only commit the next ONE step of this optimized plan.
        // Then we move there, see new cones, and replan.
        path.push(windowPoints[1].clone());
    }
    
    // Ensure closed loop visually by connecting last to first if close
    const first = path[0];
    const last = path[path.length-1];
    if (first.distanceTo(last) < 5) {
        path[path.length-1].copy(first);
    }

    return path;
};

// --- 1. Pairing Logic (Improved with Spatial Filtering) ---
export const calculateCenterline = (cones: ConeData[]): THREE.Vector3[] => {
  const blues = cones.filter(c => c.type === ConeType.BLUE);
  const yellows = cones.filter(c => c.type === ConeType.YELLOW);
  const startNode = cones.find(c => c.type === ConeType.CAR_START);
  
  const startPos = startNode ? { x: startNode.x, y: startNode.y } : { x: 0, y: 0 };

  if (!yellows.length || !blues.length) return [];

  // 1. Generate Candidate Pairs (Yellow -> Nearest Blue)
  // Also record the width of the track at this pairing
  const candidates: { x: number, y: number, width: number, pairingDist: number }[] = [];

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

    // Constraint: Only accept pairs within valid track width limit (big limit for pairing)
    if (nearestBlue && minDist < PHYSICS.TRACK_WIDTH_LIMIT) {
        candidates.push({ 
            x: (yPt.x + nearestBlue.x) / 2, 
            y: (yPt.y + nearestBlue.y) / 2,
            width: minDist, // Store the actual track width here
            pairingDist: minDist
        });
    }
  });

  if (candidates.length === 0) return [];

  // 2. Filter Overlaps / Superpositions
  candidates.sort((a, b) => a.pairingDist - b.pairingDist);

  const midpoints: {x: number, y: number, width: number}[] = [];
  const MIN_SPACING = 2.5; 

  candidates.forEach(cand => {
      const isTooClose = midpoints.some(m => {
          const dx = m.x - cand.x;
          const dy = m.y - cand.y;
          return (dx*dx + dy*dy) < (MIN_SPACING * MIN_SPACING);
      });

      if (!isTooClose) {
          midpoints.push({ x: cand.x, y: cand.y, width: cand.width });
      }
  });

  if (midpoints.length === 0) return [];

  // 3. Sort Points (Greedy Nearest Neighbor)
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
  // Store WIDTH in the Y component of Vector3 (X, Width, Z) -> (x, width, y_coord)
  // Note: ThreeJS uses Y as up, but we use X/Z plane. We repurpose Y for width storage temporarily.
  sortedPoints.push(new THREE.Vector3(midpoints[currentIdx].x, midpoints[currentIdx].width, midpoints[currentIdx].y));
  visited.add(currentIdx);

  while (sortedPoints.length < midpoints.length) {
      const currentPos = midpoints[currentIdx];
      let nearestIdx = -1;
      let minScore = Infinity;

      let heading: THREE.Vector3 | null = null;
      if (sortedPoints.length > 1) {
          // Be careful, Y contains width in sortedPoints, Z contains 'y' coord
          const p1 = sortedPoints[sortedPoints.length - 2];
          const p2 = sortedPoints[sortedPoints.length - 1];
          heading = new THREE.Vector3(p2.x - p1.x, 0, p2.z - p1.z).normalize();
      }

      for (let i = 0; i < midpoints.length; i++) {
          if (!visited.has(i)) {
              const dx = midpoints[i].x - currentPos.x;
              const dy = midpoints[i].y - currentPos.y;
              const dSq = dx*dx + dy*dy;
              const d = Math.sqrt(dSq);
              
              let penalty = 1.0;
              if (heading) {
                  const toCandidate = new THREE.Vector3(dx, 0, dy).normalize();
                  const alignment = heading.dot(toCandidate);
                  penalty = 3.0 - 2.0 * alignment; 
              }

              const score = d * penalty;
              
              if (score < minScore) { 
                  minScore = score; 
                  nearestIdx = i; 
              }
          }
      }

      const rawDist = nearestIdx !== -1 
          ? Math.sqrt(Math.pow(midpoints[nearestIdx].x - currentPos.x, 2) + Math.pow(midpoints[nearestIdx].y - currentPos.y, 2))
          : Infinity;

      if (nearestIdx === -1 || rawDist > PHYSICS.TRACK_WIDTH_LIMIT) break;

      // Store Width in Y component
      sortedPoints.push(new THREE.Vector3(midpoints[nearestIdx].x, midpoints[nearestIdx].width, midpoints[nearestIdx].y));
      visited.add(nearestIdx);
      currentIdx = nearestIdx;
  }

  return sortedPoints;
};

// --- 2. Path Generation & Physics Engine ---
export const generateDetailedPath = (controlPoints: THREE.Vector3[]): PathPoint[] => {
  if (controlPoints.length < 3) return [];

  // controlPoints stores Width in Y, and Z coord in Z.
  // We need to unpack this for CatmullRom, but CatmullRom interpolates all components (x,y,z).
  // So if we pass the vector as is, the Y component (width) will be smoothly interpolated too!
  // This is perfect. We just need to remember that p.y is width, p.z is the 2D Y-coordinate.

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
    const p = points[i]; // p.x = x, p.y = width, p.z = y_coord
    
    // Need REAL 2D distance (x, z) not including width change
    if (i > 0) {
        const prev = points[i-1];
        const dx = p.x - prev.x;
        const dy = p.z - prev.z;
        cumulativeDist += Math.sqrt(dx*dx + dy*dy);
    }

    const prevIdx = (i - 1 + points.length) % points.length;
    const nextIdx = (i + 1) % points.length;

    const pPrev = points[prevIdx];
    const pNext = points[nextIdx];
    
    // Tangent vectors (2D plane X, Z)
    const v1 = new THREE.Vector3(p.x - pPrev.x, 0, p.z - pPrev.z).normalize();
    const v2 = new THREE.Vector3(pNext.x - p.x, 0, pNext.z - p.z).normalize();
    
    const angle = v1.angleTo(v2);
    const segLen = Math.hypot(p.x - pPrev.x, p.z - pPrev.z) + Math.hypot(pNext.x - p.x, pNext.z - p.z);
    
    // Local curvature
    const k = angle / (segLen * 0.5 + 0.001);

    const radius = k > 0.001 ? 1 / k : 10000;
    const maxLatVel = Math.sqrt(maxGripAcc * radius);
    const limitVel = Math.min(maxLatVel, PHYSICS.MAX_VELOCITY);

    const yaw = Math.atan2(v2.z, v2.x);
    const pitch = 0; // Simplified pitch

    pathData.push({
      x: p.x,
      y: p.z, // Map back to our standard: y is the 2D depth
      z: 0,   // Elevation 0 for now
      trackWidth: p.y, // Extracted interpolated width
      dist: cumulativeDist,
      curvature: k,
      maxVelocity: limitVel,
      velocity: limitVel,
      acceleration: 0,
      yaw: -yaw,
      pitch: pitch,
      color: '#ffffff'
    });
  }

  // --- Flying Lap Solver (Same as before) ---
  const ITERATIONS = 4; 
  for(let iter = 0; iter < ITERATIONS; iter++) {
    if (iter > 0) {
      const startVel = pathData[0].velocity;
      const endVel = pathData[pathData.length - 1].velocity;
      pathData[pathData.length - 1].velocity = Math.min(endVel, startVel);
    }

    for (let i = pathData.length - 2; i >= 0; i--) {
      const dist = pathData[i+1].dist - pathData[i].dist;
      const vNext = pathData[i+1].velocity;
      const k = pathData[i].curvature;
      const latAccel = vNext * vNext * k;
      const gripSq = maxGripAcc * maxGripAcc;
      const latSq = latAccel * latAccel;
      const availableDecel = Math.sqrt(Math.max(0, gripSq - latSq));
      const brakingLimit = Math.min(availableDecel, PHYSICS.MAX_BRAKING);
      const vLimit = Math.sqrt(vNext * vNext + 2 * brakingLimit * dist);
      pathData[i].velocity = Math.min(pathData[i].velocity, vLimit);
    }

    const endVel = pathData[pathData.length - 1].velocity;
    pathData[0].velocity = endVel;

    for (let i = 1; i < pathData.length; i++) {
      const dist = pathData[i].dist - pathData[i-1].dist;
      const vPrev = pathData[i-1].velocity;
      const k = pathData[i].curvature;
      const latAccel = vPrev * vPrev * k;
      const gripSq = maxGripAcc * maxGripAcc;
      const latSq = latAccel * latAccel;
      const availableAccel = Math.sqrt(Math.max(0, gripSq - latSq));
      const engineLimit = Math.min(availableAccel, PHYSICS.MAX_ACCEL);
      const vLimit = Math.sqrt(vPrev * vPrev + 2 * engineLimit * dist);
      pathData[i].velocity = Math.min(pathData[i].velocity, vLimit);
    }
    pathData[pathData.length-1].velocity = pathData[0].velocity;
  }

  // --- Pass 3: Acceleration & Heatmap ---
  for (let i = 0; i < pathData.length - 1; i++) {
    const p = pathData[i];
    const pNext = pathData[i+1];
    const dist = pNext.dist - p.dist;
    
    let accel = (pNext.velocity * pNext.velocity - p.velocity * p.velocity) / (2 * dist);
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
  
  const lastControlPoint = pathData[pathData.length - 1];
  lastControlPoint.acceleration = pathData[0].acceleration;
  lastControlPoint.color = pathData[0].color;

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