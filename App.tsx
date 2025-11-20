import React, { useState, useEffect, useMemo } from 'react';
import Scene3D from './components/Scene3D';
import UIOverlay from './components/UIOverlay';
import LandingPage from './components/LandingPage';
import AlgorithmsPage from './components/AlgorithmsPage';
import SimulationsPage from './components/SimulationsPage';
import { ConeData, ConeType, EditorState, PathPoint, TrackMetadata, CameraMode, OptimizerMode } from './types';
import { calculateCenterline, generateDetailedPath, generateId, getTrackMetadata, parseTrackData, optimizeRacingLine, optimizeRRTStar, optimizeQP, optimizeHybrid, optimizeRRTQP } from './services/mathUtils';
import { TRACK_CSVS } from './constants';
import * as THREE from 'three';

const App: React.FC = () => {
  // --- State ---
  const [view, setView] = useState<'LANDING' | 'APP' | 'ALGORITHMS' | 'SIMULATIONS'>('LANDING');
  const [currentTrackKey, setCurrentTrackKey] = useState<string>('small_track');
  const [cones, setCones] = useState<ConeData[]>([]);
  
  const [roadPathData, setRoadPathData] = useState<PathPoint[]>([]);
  const [racingPathData, setRacingPathData] = useState<PathPoint[]>([]);
  
  // Ghost state
  const [showGhost, setShowGhost] = useState(false);
  const [ghostPathData, setGhostPathData] = useState<PathPoint[]>([]);

  // Race Mode State
  const [raceMode, setRaceMode] = useState(false);
  const [racePaths, setRacePaths] = useState<{ laplacian: PathPoint[], qp: PathPoint[], rrt: PathPoint[] }>({ laplacian: [], qp: [], rrt: [] });

  const [isPlaying, setIsPlaying] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>(CameraMode.ORBIT);
  const [isNight, setIsNight] = useState(false);
  
  // Physics State
  const [enableSuspension, setEnableSuspension] = useState(false);
  
  // New: Tri-state optimizer
  const [optimizerMode, setOptimizerMode] = useState<OptimizerMode>(OptimizerMode.NONE);

  const [editorState, setEditorState] = useState<EditorState>({
    selectedConeId: null,
    isDragging: false,
    mode: 'VIEW'
  });

  // --- Initialization ---
  useEffect(() => {
    if (view === 'APP') {
      loadTrack(currentTrackKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrackKey, view]);

  // --- Logic ---
  const loadTrack = (key: string) => {
    const csv = TRACK_CSVS[key as keyof typeof TRACK_CSVS];
    if (csv) {
      const loadedCones = parseTrackData(csv);
      setCones(loadedCones);
      setIsPlaying(false);
      setCameraMode(CameraMode.HELICOPTER); 
      setOptimizerMode(OptimizerMode.NONE);
      // Default ghost to false on new track load
      setShowGhost(false);
    }
  };

  // Recompute paths
  useEffect(() => {
    if (cones.length === 0) {
      setRoadPathData([]);
      setRacingPathData([]);
      setGhostPathData([]);
      setRacePaths({ laplacian: [], qp: [], rrt: [] });
      return;
    }

    // 1. Calculate Standard Centerline (Geometric Center)
    const centerControlPoints = calculateCenterline(cones);
    
    // Generate Road Geometry Path (Fixed)
    const centerLinePath = generateDetailedPath(centerControlPoints);
    setRoadPathData(centerLinePath);

    // If dragging, skip heavy math to maintain fps
    if (editorState.isDragging) {
        setRacingPathData(centerLinePath);
        return;
    }

    // --- Race Mode Calculation (All 3 paths) ---
    if (raceMode) {
        const lapPoints = optimizeRacingLine(centerControlPoints);
        const lapPath = generateDetailedPath(lapPoints);

        const qpPoints = optimizeQP(centerControlPoints);
        const qpPath = generateDetailedPath(qpPoints);

        // RRT* can be jittery if re-run, but for visual demo it's okay. 
        // Using standard RRTStar here for distinctiveness from QP.
        const rrtPoints = optimizeRRTStar(centerControlPoints);
        const rrtPath = generateDetailedPath(rrtPoints);
        
        setRacePaths({
            laplacian: lapPath,
            qp: qpPath,
            rrt: rrtPath
        });
    }

    // 2. Calculate Ghost Path (Always RRT_QP as it is the "Fastest")
    let rrtQpPath: PathPoint[] = [];
    const shouldCalcFastest = showGhost || optimizerMode === OptimizerMode.RRT_QP;
    
    if (shouldCalcFastest) {
        const rrtQpControlPoints = optimizeRRTQP(centerControlPoints);
        rrtQpPath = generateDetailedPath(rrtQpControlPoints);
        if (showGhost) {
            setGhostPathData(rrtQpPath);
        }
    }

    // 3. Calculate Racing Line (Trajectory) based on Optimizer Mode
    if (optimizerMode === OptimizerMode.LAPLACIAN) {
        const optimizedControlPoints = optimizeRacingLine(centerControlPoints);
        const optimizedPath = generateDetailedPath(optimizedControlPoints);
        setRacingPathData(optimizedPath);
    } else if (optimizerMode === OptimizerMode.RRT) {
        const rrtControlPoints = optimizeRRTStar(centerControlPoints);
        const rrtPath = generateDetailedPath(rrtControlPoints);
        setRacingPathData(rrtPath);
    } else if (optimizerMode === OptimizerMode.QP) {
        const qpControlPoints = optimizeQP(centerControlPoints);
        const qpPath = generateDetailedPath(qpControlPoints);
        setRacingPathData(qpPath);
    } else if (optimizerMode === OptimizerMode.HYBRID) {
        const hybridControlPoints = optimizeHybrid(centerControlPoints);
        const hybridPath = generateDetailedPath(hybridControlPoints);
        setRacingPathData(hybridPath);
    } else if (optimizerMode === OptimizerMode.RRT_QP) {
        setRacingPathData(rrtQpPath); // Already calculated above
    } else {
        // Standard
        setRacingPathData(centerLinePath);
    }
  }, [cones, optimizerMode, showGhost, raceMode, editorState.isDragging]);

  const trackMetadata: TrackMetadata = useMemo(() => {
    return getTrackMetadata(racingPathData);
  }, [racingPathData]);

  // --- Handlers ---
  const handleTrackSelect = (key: string) => {
    setCurrentTrackKey(key);
    setView('APP');
  };

  const handleHome = () => {
    setIsPlaying(false);
    setView('LANDING');
  };

  const handleConeMove = (id: string, x: number, z: number) => {
    setCones(prev => prev.map(c => 
      c.id === id ? { ...c, x, y: z } : c
    ));
  };

  const handleAddCone = (x: number, z: number, typeOverride?: ConeType) => {
    let type = ConeType.BLUE;
    if (typeOverride) {
      type = typeOverride;
    } else if (editorState.mode === 'ADD_BLUE') {
      type = ConeType.BLUE;
    } else if (editorState.mode === 'ADD_YELLOW') {
      type = ConeType.YELLOW;
    }
    setCones(prev => [...prev, {
      id: generateId(),
      x,
      y: z,
      z: 0, 
      type
    }]);
  };

  const handleConeSelect = (id: string | null) => {
    setEditorState(prev => ({ ...prev, selectedConeId: null }));
  };

  const handleSetMode = (mode: EditorState['mode']) => {
    setEditorState(prev => ({ ...prev, mode }));
  };

  const handleExport = () => {
    const headers = ['x', 'y', 'z', 'yaw', 'velocity', 'curvature', 'acceleration', 'dist'];
    const rows = racingPathData.map(p => 
      [
        p.x.toFixed(4), 
        p.y.toFixed(4), 
        p.z.toFixed(4),
        p.yaw.toFixed(4),
        p.velocity.toFixed(4), 
        p.curvature.toFixed(4), 
        p.acceleration.toFixed(4),
        p.dist.toFixed(4)
      ].join(',')
    );
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(',') + "\n" 
      + rows.join('\n');
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${currentTrackKey}_trajectory.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        const loadedCones = parseTrackData(text);
        setCones(loadedCones);
        setIsPlaying(false);
        setOptimizerMode(OptimizerMode.NONE);
        setCurrentTrackKey('custom');
      }
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view !== 'APP') return;

      if (e.code === 'Space') {
        setIsPlaying(prev => !prev);
      }
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (editorState.selectedConeId) {
          setCones(prev => prev.filter(c => c.id !== editorState.selectedConeId));
          setEditorState(prev => ({ ...prev, selectedConeId: null }));
        }
      }
      if (e.code === 'Escape') {
        handleHome();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editorState.selectedConeId, view]);

  // If ghost is enabled, only show it if it's DIFFERENT from current optimizer
  // (Otherwise they perfectly overlap and it looks buggy).
  const visibleGhostPath = (showGhost && optimizerMode !== OptimizerMode.RRT_QP) ? ghostPathData : undefined;

  return (
    <div className="w-full h-screen relative overflow-hidden select-none">
      {view === 'LANDING' ? (
        <LandingPage 
            onSelectTrack={handleTrackSelect} 
            onShowAlgorithms={() => setView('ALGORITHMS')}
            onShowSimulations={() => setView('SIMULATIONS')}
        />
      ) : view === 'ALGORITHMS' ? (
        <AlgorithmsPage onBack={handleHome} />
      ) : view === 'SIMULATIONS' ? (
        <SimulationsPage onBack={handleHome} />
      ) : (
        <>
          <Scene3D 
            cones={cones} 
            roadPath={roadPathData}
            racingPath={racingPathData}
            ghostPath={visibleGhostPath}
            editorState={editorState}
            isPlaying={isPlaying}
            cameraMode={cameraMode}
            isNight={isNight}
            currentTrack={currentTrackKey}
            enableSuspension={enableSuspension}
            raceMode={raceMode}
            racePaths={racePaths}
            onConeMove={handleConeMove}
            onConeSelect={handleConeSelect}
            onAddCone={(x, z) => handleAddCone(x, z)}
          />
          
          <UIOverlay 
            metadata={trackMetadata}
            pathData={racingPathData}
            editorState={editorState}
            isPlaying={isPlaying}
            currentTrack={currentTrackKey}
            cameraMode={cameraMode}
            isNight={isNight}
            optimizerMode={optimizerMode}
            showGhost={showGhost}
            enableSuspension={enableSuspension}
            raceMode={raceMode}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            onReset={() => loadTrack(currentTrackKey)}
            onExport={handleExport}
            onImport={handleImport}
            onSetMode={handleSetMode}
            onChangeTrack={setCurrentTrackKey}
            onHome={handleHome}
            onSetCamera={setCameraMode}
            onToggleNight={() => setIsNight(!isNight)}
            onSetOptimizerMode={setOptimizerMode}
            onToggleGhost={() => setShowGhost(!showGhost)}
            onToggleSuspension={() => setEnableSuspension(!enableSuspension)}
            onToggleRaceMode={() => setRaceMode(!raceMode)}
          />
        </>
      )}
    </div>
  );
};

export default App;