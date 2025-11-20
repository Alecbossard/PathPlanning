import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, RefreshCw, Download, Upload,
  MousePointer2, Eye,
  Activity, Map, Home, Video, Moon, Sun, CarFront,
  Orbit, Zap, Aperture, Network, Cpu, GitMerge, Sparkles,
  Ghost, Waves, Flag
} from 'lucide-react';
import { EditorState, TrackMetadata, PathPoint, CameraMode, OptimizerMode } from '../types';
import { PHYSICS } from '../constants';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as THREE from 'three';

interface UIOverlayProps {
  metadata: TrackMetadata;
  pathData: PathPoint[];
  editorState: EditorState;
  isPlaying: boolean;
  currentTrack: string;
  cameraMode: CameraMode;
  isNight: boolean;
  optimizerMode: OptimizerMode;
  showGhost: boolean;
  enableSuspension: boolean;
  raceMode: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onSetMode: (mode: EditorState['mode']) => void;
  onChangeTrack: (trackKey: string) => void;
  onHome: () => void;
  onSetCamera: (mode: CameraMode) => void;
  onToggleNight: () => void;
  onSetOptimizerMode: (mode: OptimizerMode) => void;
  onToggleGhost: () => void;
  onToggleSuspension: () => void;
  onToggleRaceMode: () => void;
}

const GlassPanel = ({ children, className = '' }: { children?: React.ReactNode; className?: string }) => (
  <div className={`bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-xl p-3 md:p-4 text-slate-200 shadow-xl ${className}`}>
    {children}
  </div>
);

// --- Improved G-G Diagram Component ---
const GGDiagram: React.FC<{ path: PathPoint[], isPlaying: boolean }> = ({ path, isPlaying }) => {
  const [trail, setTrail] = useState<{x: number, y: number, opacity: number}[]>([]);
  const distRef = useRef(0);
  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef(0);

  // Constants
  const PX_SCALE = 45; // Pixels per 1G
  const MAX_TRAIL = 60;

  useEffect(() => {
    if (!isPlaying || path.length < 2) {
      setTrail([]);
      distRef.current = 0;
      lastTimeRef.current = 0;
      return;
    }

    const loop = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      const delta = Math.min((time - lastTimeRef.current) / 1000, 0.05); 
      lastTimeRef.current = time;

      const totalLen = path[path.length - 1].dist;
      
      // 1. Find current segment index based on distRef
      let idx = 0;
      // Use simple linear scan (could be optimized, but length < 500 usually)
      while (idx < path.length - 2 && path[idx + 1].dist <= distRef.current) {
        idx++;
      }
      
      const p1 = path[idx];
      const p2 = path[idx + 1] || p1;

      // 2. Interpolate Logic (Smooth movement)
      const segmentLen = p2.dist - p1.dist;
      const alpha = segmentLen > 0 ? (distRef.current - p1.dist) / segmentLen : 0;
      
      const velocity = THREE.MathUtils.lerp(p1.velocity, p2.velocity, alpha);
      const curvature = THREE.MathUtils.lerp(p1.curvature, p2.curvature, alpha);
      const acceleration = THREE.MathUtils.lerp(p1.acceleration, p2.acceleration, alpha);

      // 3. Calculate Signed Direction
      const pNext = path[idx + 2] || path[0]; 
      const ax = p2.x - p1.x;
      const ay = p2.y - p1.y; 
      const bx = pNext.x - p2.x;
      const by = pNext.y - p2.y;
      
      const cross = ax * by - ay * bx;
      const turnSign = Math.sign(cross);

      // 4. Calculate G-Forces
      const latG = (velocity * velocity * curvature * turnSign) / PHYSICS.GRAVITY;
      const longG = acceleration / PHYSICS.GRAVITY;

      // 5. Update Distance
      distRef.current += velocity * delta;
      if (distRef.current >= totalLen) distRef.current -= totalLen;

      // 6. Update Visual Trail
      setTrail(prev => {
        const newPoint = { x: latG, y: longG, opacity: 1.0 };
        // Fade existing
        const nextTrail = prev
            .map(p => ({ ...p, opacity: p.opacity - 0.02 }))
            .filter(p => p.opacity > 0);
        return [...nextTrail, newPoint];
      });

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPlaying, path]);

  // Get the most recent point (current G)
  const current = trail[trail.length - 1] || { x: 0, y: 0 };

  return (
      <div className="flex flex-col items-center justify-center h-full select-none">
        <div className="relative w-36 h-36 bg-slate-950/50 rounded-full border border-slate-700 flex items-center justify-center shadow-inner shadow-black/50">
            {/* Grid Lines */}
            <div className="absolute w-full h-px bg-slate-800" />
            <div className="absolute h-full w-px bg-slate-800" />
            
            {/* Reference Rings */}
            <div className="absolute rounded-full border border-slate-700 opacity-30" style={{ width: PX_SCALE * 2, height: PX_SCALE * 2 }} /> {/* 1G */}
            <div className="absolute rounded-full border border-slate-600 border-dashed opacity-30" style={{ width: PX_SCALE * 3, height: PX_SCALE * 3 }} /> {/* 1.5G */}
            <div className="absolute rounded-full border border-slate-700 opacity-30" style={{ width: PX_SCALE * 4, height: PX_SCALE * 4 }} /> {/* 2G */}

            {/* Labels */}
            <span className="absolute top-1 text-[8px] font-mono text-slate-600">ACCEL</span>
            <span className="absolute bottom-1 text-[8px] font-mono text-slate-600">BRAKE</span>
            <span className="absolute left-1 text-[8px] font-mono text-slate-600">L</span>
            <span className="absolute right-1 text-[8px] font-mono text-slate-600">R</span>

            {/* Trail */}
            {trail.map((pt, i) => (
               <div 
                 key={i}
                 className="absolute w-1 h-1 rounded-full bg-blue-400 blur-[0.5px]"
                 style={{
                   opacity: pt.opacity * 0.5,
                   transform: `translate(${pt.x * PX_SCALE}px, ${-pt.y * PX_SCALE}px)`
                 }}
               />
            ))}

            {/* Current Dot */}
            <div 
                className="absolute w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_8px_rgba(59,130,246,1)] z-10 border border-blue-500"
                style={{
                    transform: `translate(${current.x * PX_SCALE}px, ${-current.y * PX_SCALE}px)`,
                    transition: 'transform 0.05s linear'
                }}
            />
        </div>
        
        {/* Digital Readout */}
        <div className="flex gap-4 mt-2 font-mono text-[10px] text-slate-400">
            <div className="flex gap-1">
                <span className="text-slate-600">LAT</span>
                <span className={Math.abs(current.x) > 1.5 ? 'text-red-400' : 'text-blue-300'}>
                    {current.x.toFixed(2)}G
                </span>
            </div>
            <div className="flex gap-1">
                <span className="text-slate-600">LONG</span>
                <span className={Math.abs(current.y) > 1.5 ? 'text-red-400' : 'text-blue-300'}>
                    {current.y.toFixed(2)}G
                </span>
            </div>
        </div>
      </div>
  );
};

const UIOverlay: React.FC<UIOverlayProps> = ({
  metadata,
  pathData,
  editorState,
  isPlaying,
  currentTrack,
  cameraMode,
  isNight,
  optimizerMode,
  showGhost,
  enableSuspension,
  raceMode,
  onTogglePlay,
  onReset,
  onExport,
  onImport,
  onSetMode,
  onChangeTrack,
  onHome,
  onSetCamera,
  onToggleNight,
  onSetOptimizerMode,
  onToggleGhost,
  onToggleSuspension,
  onToggleRaceMode
}) => {
  const chartData = pathData.filter((_, i) => i % 3 === 0); 
  const [activeTab, setActiveTab] = useState<'VELOCITY' | 'CURVATURE'>('VELOCITY');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImport(e.target.files[0]);
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2 md:p-4 overflow-hidden">
      <style>
        {`
          .no-scrollbar::-webkit-scrollbar {
            display: none;
          }
          .no-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}
      </style>
      
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start pointer-events-auto gap-2 md:gap-4">
        
        {/* Stats Panel */}
        <GlassPanel className="flex flex-col gap-2 md:gap-3 w-full md:w-auto md:min-w-[280px]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
               <button 
                 onClick={onHome}
                 className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition"
                 title="Back to Home"
               >
                 <Home size={18} />
               </button>
               <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2 tracking-tight">
                 <Activity className="text-blue-500" size={20} />
                 <span className="hidden xs:inline">Studio</span> <span className="text-xs font-normal text-slate-500">v3.4</span>
               </h1>
            </div>
            <div className={`text-[10px] px-2 py-0.5 rounded border font-mono uppercase ${
              optimizerMode !== OptimizerMode.NONE 
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' 
                : 'bg-slate-700 text-slate-400 border-slate-600'
            }`}>
              {optimizerMode}
            </div>
          </div>

          {/* Track Selector */}
          <div className="relative group">
            <select 
              value={currentTrack}
              onChange={(e) => onChangeTrack(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded px-3 py-2 appearance-none cursor-pointer hover:bg-slate-750 transition outline-none focus:border-blue-500 font-medium text-xs md:text-sm"
            >
              <option value="small_track">🏁 Small Track (FSG)</option>
              <option value="peanut">🥜 Peanut Track (Skidpad)</option>
              <option value="circuit_3">🚧 Circuit 3</option>
              <option value="shanghai">🇨🇳 Shanghai Circuit</option>
            </select>
            <Map size={16} className="absolute right-3 top-2 md:top-3 text-slate-400 pointer-events-none group-hover:text-blue-400 transition-colors" />
          </div>

          <div className="grid grid-cols-4 md:grid-cols-2 gap-x-2 md:gap-x-4 gap-y-2 md:gap-y-3 text-sm mt-1">
            <div className="flex flex-col">
               <span className="text-slate-500 text-[8px] md:text-[10px] uppercase font-bold">Length</span>
               <span className="font-mono text-slate-200 text-xs md:text-sm">{metadata.totalLength.toFixed(0)}<span className="hidden md:inline text-slate-500 text-xs ml-1">m</span></span>
            </div>
            <div className="flex flex-col">
               <span className="text-slate-500 text-[8px] md:text-[10px] uppercase font-bold">Lap Time</span>
               <span className="font-mono text-blue-400 text-xs md:text-sm">{metadata.estLapTime.toFixed(2)}<span className="hidden md:inline text-slate-500 text-xs ml-1">s</span></span>
            </div>
            <div className="flex flex-col">
               <span className="text-slate-500 text-[8px] md:text-[10px] uppercase font-bold">Max Lat</span>
               <span className="font-mono text-slate-200 text-xs md:text-sm">{metadata.maxLatG.toFixed(1)}<span className="hidden md:inline text-slate-500 text-xs ml-1">G</span></span>
            </div>
             <div className="flex flex-col">
               <span className="text-slate-500 text-[8px] md:text-[10px] uppercase font-bold">Brake</span>
               <span className="font-mono text-red-400 text-xs md:text-sm">{Math.abs(metadata.minLongG).toFixed(1)}<span className="hidden md:inline text-slate-500 text-xs ml-1">G</span></span>
            </div>
          </div>
        </GlassPanel>

        {/* Editor Tools - Scrollable on Mobile */}
        <GlassPanel className="flex gap-2 items-center overflow-x-auto no-scrollbar max-w-[90vw] md:max-w-none">
          {/* Camera Controls */}
          <div className="flex items-center bg-slate-800/50 rounded-lg p-1 mr-2 border border-slate-700 flex-shrink-0">
             <button
               onClick={() => onSetCamera(CameraMode.ORBIT)}
               className={`p-2 rounded-md transition ${cameraMode === CameraMode.ORBIT ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
               title="Orbit Camera"
             >
               <Orbit size={16} />
             </button>
             <button
               onClick={() => onSetCamera(CameraMode.CHASE)}
               className={`p-2 rounded-md transition ${cameraMode === CameraMode.CHASE ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
               title="Chase Camera"
             >
               <Video size={16} />
             </button>
             <button
               onClick={() => onSetCamera(CameraMode.HELICOPTER)}
               className={`p-2 rounded-md transition ${cameraMode === CameraMode.HELICOPTER ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
               title="TV Helicopter Camera"
             >
               <Aperture size={16} />
             </button>
             <button
               onClick={() => onSetCamera(CameraMode.COCKPIT)}
               className={`p-2 rounded-md transition ${cameraMode === CameraMode.COCKPIT ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
               title="Cockpit Camera"
             >
               <CarFront size={16} />
             </button>
          </div>

          <button
            onClick={onToggleNight}
            className={`p-2.5 rounded-lg transition border flex-shrink-0 ${isNight ? 'bg-indigo-950 text-indigo-300 border-indigo-800' : 'bg-amber-900/20 text-amber-400 border-amber-500/20 hover:bg-amber-900/30'}`}
            title="Day/Night Cycle"
          >
             {isNight ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          {/* Ghost Mode Toggle */}
          <button
            onClick={onToggleGhost}
            className={`p-2.5 rounded-lg transition border ml-1 flex-shrink-0 ${showGhost ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50' : 'hover:bg-slate-700 text-slate-400 border-transparent'}`}
            title="Ghost Car (Compare Fastest Lap)"
          >
             <Ghost size={18} />
          </button>

          {/* Suspension Mode Toggle */}
          <button
            onClick={onToggleSuspension}
            className={`p-2.5 rounded-lg transition border ml-1 flex-shrink-0 ${enableSuspension ? 'bg-pink-500/20 text-pink-300 border-pink-500/50' : 'hover:bg-slate-700 text-slate-400 border-transparent'}`}
            title="Dynamic Suspension & Drift"
          >
             <Waves size={18} />
          </button>

          {/* AI Race Mode Toggle */}
          <button
            onClick={onToggleRaceMode}
            className={`p-2.5 rounded-lg transition border ml-1 flex-shrink-0 ${raceMode ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50' : 'hover:bg-slate-700 text-slate-400 border-transparent'}`}
            title="AI Race Mode (Laplacian vs QP vs RRT)"
          >
              <Flag size={18} />
          </button>

          <div className="w-px h-8 bg-slate-700 mx-1 flex-shrink-0" />
          
          {/* Algorithm Selectors */}
          <div className="flex items-center bg-slate-800/50 rounded-lg p-1 border border-slate-700 flex-shrink-0">
            <button
                onClick={() => onSetOptimizerMode(OptimizerMode.NONE)}
                className={`p-2 rounded-md transition flex items-center gap-1 ${optimizerMode === OptimizerMode.NONE ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                title="Optimizer: Off (Centerline)"
            >
                <span className="text-[10px] font-bold px-1">OFF</span>
            </button>
            <button
                onClick={() => onSetOptimizerMode(OptimizerMode.LAPLACIAN)}
                className={`p-2 rounded-md transition ${optimizerMode === OptimizerMode.LAPLACIAN ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-slate-400 hover:text-purple-400'}`}
                title="Laplacian Smoothing (Fast)"
            >
                <Zap size={16} />
            </button>
            <button
                onClick={() => onSetOptimizerMode(OptimizerMode.RRT)}
                className={`p-2 rounded-md transition ${optimizerMode === OptimizerMode.RRT ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-slate-400 hover:text-emerald-400'}`}
                title="RRT* Stochastic"
            >
                <Network size={16} />
            </button>
            <button
                onClick={() => onSetOptimizerMode(OptimizerMode.QP)}
                className={`p-2 rounded-md transition ${optimizerMode === OptimizerMode.QP ? 'bg-orange-600 text-white shadow-lg shadow-orange-900/20' : 'text-slate-400 hover:text-orange-400'}`}
                title="QP Minimum Curvature (Heilmeier)"
            >
                <Cpu size={16} />
            </button>
            <button
                onClick={() => onSetOptimizerMode(OptimizerMode.HYBRID)}
                className={`p-2 rounded-md transition ${optimizerMode === OptimizerMode.HYBRID ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/20' : 'text-slate-400 hover:text-cyan-400'}`}
                title="Hybrid (QP + Laplacian Blend)"
            >
                <GitMerge size={16} />
            </button>
            <button
                onClick={() => onSetOptimizerMode(OptimizerMode.RRT_QP)}
                className={`p-2 rounded-md transition ${optimizerMode === OptimizerMode.RRT_QP ? 'bg-pink-600 text-white shadow-lg shadow-pink-900/20' : 'text-slate-400 hover:text-pink-400'}`}
                title="RRT* + QP Pipeline (Best)"
            >
                <Sparkles size={16} />
            </button>
          </div>

          <div className="w-px h-8 bg-slate-700 mx-1 flex-shrink-0" />

          {/* Edit Tools */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button 
              onClick={() => onSetMode('VIEW')}
              className={`p-2.5 rounded-lg transition ${editorState.mode === 'VIEW' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-700 text-slate-400'}`}
              title="View Mode"
            >
              <Eye size={18} />
            </button>
            <button 
              onClick={() => onSetMode('EDIT')}
              className={`p-2.5 rounded-lg transition ${editorState.mode === 'EDIT' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'hover:bg-slate-700 text-slate-400'}`}
              title="Edit Cones"
            >
              <MousePointer2 size={18} />
            </button>
          </div>
        </GlassPanel>
      </div>

      {/* Bottom Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pointer-events-auto items-end">
        
        {/* Controls */}
        <GlassPanel className="lg:col-span-3 flex flex-col gap-4 w-full">
          <div className="flex items-center justify-center gap-4">
            <button 
              onClick={onTogglePlay}
              className={`flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full transition transform active:scale-95 ${isPlaying ? 'bg-red-500 hover:bg-red-600 shadow-red-900/50' : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-900/50'} text-white shadow-lg border-2 border-white/10`}
            >
              {isPlaying ? <Pause fill="currentColor" size={20} /> : <Play fill="currentColor" className="ml-1" size={20} />}
            </button>
            
            <div className="flex flex-col gap-2 w-full">
                <button 
                onClick={onReset}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition text-slate-300 border border-slate-600 flex items-center gap-2 text-[10px] md:text-xs font-semibold uppercase tracking-wide justify-center"
                >
                  <RefreshCw size={12} /> Reset Track
                </button>
                <div className="flex gap-2">
                    <button 
                      onClick={onExport}
                      className="flex-1 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition text-slate-300 border border-slate-600 flex items-center gap-2 text-[10px] md:text-xs font-semibold uppercase tracking-wide justify-center"
                    >
                      <Download size={12} /> Save
                    </button>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition text-slate-300 border border-slate-600 flex items-center gap-2 text-[10px] md:text-xs font-semibold uppercase tracking-wide justify-center"
                    >
                      <Upload size={12} /> Load
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".csv"
                      className="hidden"
                    />
                </div>
            </div>
          </div>
          
          <div className="border-t border-slate-700 pt-3 mt-1">
             <div className="flex justify-between text-[8px] md:text-[10px] uppercase text-slate-500 font-bold mb-2 tracking-wider">
                <span>Braking Zone</span>
                <span>Full Throttle</span>
             </div>
             <div className="h-1.5 rounded-full w-full bg-gradient-to-r from-red-500 via-white to-green-500 shadow-inner opacity-80" />
          </div>
        </GlassPanel>

        {/* G-G Diagram (Improved) */}
        <GlassPanel className="lg:col-span-2 h-48 hidden lg:block">
            <GGDiagram path={pathData} isPlaying={isPlaying} />
        </GlassPanel>

        {/* Telemetry Charts */}
        <GlassPanel className="lg:col-span-7 h-48 hidden lg:block relative group">
          
          {/* Chart Toggles */}
          <div className="absolute top-4 right-4 flex bg-slate-800/80 backdrop-blur rounded-lg p-0.5 z-10 border border-slate-700">
            <button 
              onClick={() => setActiveTab('VELOCITY')}
              className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition ${activeTab === 'VELOCITY' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              Velocity
            </button>
            <button 
              onClick={() => setActiveTab('CURVATURE')}
              className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition ${activeTab === 'CURVATURE' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              Curvature
            </button>
          </div>

          <div className="h-full w-full pb-2 pt-6">
            <ResponsiveContainer width="100%" height="100%">
              {activeTab === 'VELOCITY' ? (
                <AreaChart data={chartData}>
                    <defs>
                    <linearGradient id="colorVel" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="dist" stroke="#64748b" fontSize={10} tickFormatter={(val) => Math.round(val) + 'm'} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px', borderRadius: '8px' }}
                        formatter={(value: number) => [value.toFixed(1) + ' m/s', 'Speed']}
                        itemStyle={{ color: '#93c5fd' }}
                    />
                    <Area type="monotone" dataKey="velocity" stroke="#3b82f6" strokeWidth={2} fill="url(#colorVel)" animationDuration={500} />
                </AreaChart>
              ) : (
                 <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="dist" stroke="#64748b" fontSize={10} tickFormatter={(val) => Math.round(val) + 'm'} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px', borderRadius: '8px' }}
                        formatter={(value: number) => [value.toFixed(3), 'Curvature']}
                        itemStyle={{ color: '#fcd34d' }}
                    />
                    <Line type="monotone" dataKey="curvature" stroke="#eab308" strokeWidth={2} dot={false} animationDuration={500} />
                 </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </GlassPanel>

      </div>
    </div>
  );
};

export default UIOverlay;