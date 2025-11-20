import React, { useState } from 'react';
import { Flag, Zap, Trophy, Route, ArrowRight, Activity, BookOpen, PlayCircle, Map, ChevronDown, Star, Grid } from 'lucide-react';

interface LandingPageProps {
  onSelectTrack: (trackKey: string) => void;
  onShowAlgorithms: () => void;
  onShowSimulations: () => void;
  availableTracks: string[];
}

// --- Track Configuration & Styles ---
const TRACK_STYLES: Record<string, any> = {
    'small_track': {
        title: "Small Track",
        subtitle: "Skidpad Benchmark",
        description: "Official FSG skidpad configuration. The ultimate baseline for testing lateral grip limits and steady-state cornering.",
        icon: <Flag size={24} />,
        color: "from-blue-600",
        accent: "group-hover:text-blue-400",
        border: "group-hover:border-blue-500/50",
        stats: "Official"
    },
    'peanut': {
        title: "Peanut Track",
        subtitle: "Transient Response",
        description: "Figure-eight topology designed for continuous load transfer analysis. Perfect for tuning suspension damping and RRT* convergence.",
        icon: <Zap size={24} />,
        color: "from-yellow-500",
        accent: "group-hover:text-yellow-400",
        border: "group-hover:border-yellow-500/50",
        stats: "Loop Test"
    },
    'hairpins': {
        title: "Hairpins",
        subtitle: "Increasing Difficulty",
        description: "A progressive sequence of tightening radii. Stresses the solver's ability to handle acute steering angles and rapid braking zones.",
        icon: <Route size={24} />,
        color: "from-red-600",
        accent: "group-hover:text-red-400",
        border: "group-hover:border-red-500/50",
        stats: "Technical"
    }
};

// Helper to identify the 3 featured tracks
const getFeaturedType = (key: string): 'small_track' | 'peanut' | 'hairpins' | null => {
    const n = key.toLowerCase().replace(/[\s_]/g, '');
    if (n.includes('smalltrack')) return 'small_track';
    if (n.includes('peanut')) return 'peanut';
    if (n.includes('hairpin')) return 'hairpins';
    return null;
};

const FeaturedCard: React.FC<{
  trackKey: string;
  config: any;
  onClick: () => void;
}> = ({ trackKey, config, onClick }) => (
  <div 
    onClick={onClick}
    className={`group relative bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl p-6 cursor-pointer hover:-translate-y-1 transition-all duration-500 hover:shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col justify-between min-h-[280px] ${config.border}`}
  >
    {/* Ambient Glow */}
    <div className={`absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 bg-gradient-to-br ${config.color} to-transparent`} />
    
    {/* Header */}
    <div className="relative z-10">
      <div className="flex justify-between items-start mb-6">
        <div className={`w-12 h-12 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-200 group-hover:scale-110 transition-transform duration-500 shadow-lg`}>
          {config.icon}
        </div>
        <div className="px-2 py-1 rounded text-[10px] font-mono uppercase tracking-widest bg-slate-950/50 text-slate-500 border border-slate-800 backdrop-blur-sm">
            {config.stats}
        </div>
      </div>
      
      <div className="mb-3">
        <h3 className={`text-2xl font-bold text-white mb-1 transition-colors ${config.accent}`}>
            {config.title}
        </h3>
        <p className={`text-[10px] font-mono uppercase tracking-widest font-bold text-transparent bg-clip-text bg-gradient-to-r ${config.color} to-slate-400 opacity-80`}>
            {config.subtitle}
        </p>
      </div>

      <p className="text-sm text-slate-400 leading-relaxed border-l-2 border-slate-800 pl-3 group-hover:border-slate-600 transition-colors">
        {config.description}
      </p>
    </div>

    {/* Footer Action */}
    <div className="relative z-10 mt-8 pt-6 border-t border-slate-800/50 flex items-center justify-between group/btn">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 group-hover:text-white transition-colors">
        Load Configuration
      </span>
      <div className={`p-1.5 rounded-full bg-slate-800 text-slate-400 group-hover:text-white group-hover:bg-gradient-to-r ${config.color} transition-all`}>
          <ArrowRight size={14} className="group-hover/btn:translate-x-0.5 transition-transform" />
      </div>
    </div>
  </div>
);

const LandingPage: React.FC<LandingPageProps> = ({ onSelectTrack, onShowAlgorithms, onShowSimulations, availableTracks }) => {
  
  const featuredTracks = availableTracks.filter(key => getFeaturedType(key) !== null);
  const otherTracks = availableTracks.filter(key => getFeaturedType(key) === null);

  // Sort featured tracks to always appear in order: Small Track -> Peanut -> Hairpins
  featuredTracks.sort((a, b) => {
      const order = { 'small_track': 1, 'peanut': 2, 'hairpins': 3 };
      const typeA = getFeaturedType(a);
      const typeB = getFeaturedType(b);
      return (order[typeA!] || 99) - (order[typeB!] || 99);
  });

  return (
    <div className="h-full bg-slate-950 relative overflow-y-auto text-slate-200 selection:bg-blue-500/30">
      
      {/* Dynamic Background */}
      <div className="fixed top-[-20%] left-[-10%] w-[800px] h-[800px] bg-blue-600/10 blur-[150px] rounded-full pointer-events-none mix-blend-screen animate-pulse-slow" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none opacity-50" />
      
      {/* Technical Grid */}
      <div 
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
            backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 flex flex-col min-h-screen">
        
        {/* Hero Section */}
        <div className="mb-20 text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 text-xs font-medium mb-8 shadow-2xl backdrop-blur-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="tracking-widest uppercase font-mono text-[10px]">System Operational</span>
            </div>
            
            <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-white mb-8 leading-none">
                Path Planning <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-indigo-400 to-purple-500">
                    Studio
                </span>
            </h1>
            
            <p className="text-lg md:text-xl text-slate-400 leading-relaxed mb-10 max-w-2xl mx-auto font-light">
                Advanced autonomous racing simulation. Analyze RRT* convergence, optimize with Quadratic Programming, and visualize telemetry in real-time.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
                <button 
                    onClick={onShowSimulations}
                    className="px-6 py-3 rounded-xl bg-white text-slate-900 font-bold text-sm hover:bg-slate-200 transition-colors shadow-[0_0_30px_-5px_rgba(255,255,255,0.3)] flex items-center gap-2 group"
                >
                    <PlayCircle size={18} />
                    Live Simulations
                </button>
                <button 
                    onClick={onShowAlgorithms}
                    className="px-6 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-bold text-sm hover:bg-slate-800 hover:text-white transition-colors flex items-center gap-2 group"
                >
                    <BookOpen size={18} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                    Algorithm Docs
                </button>
            </div>
        </div>

        {/* Featured Tracks */}
        <div className="mb-16">
            <div className="flex items-center gap-4 mb-8">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-800 to-transparent" />
                <span className="text-xs font-mono uppercase tracking-[0.2em] text-slate-500 font-bold flex items-center gap-2">
                    <Star size={12} className="text-blue-500" /> Featured Circuits
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-800 to-transparent" />
            </div>

            {availableTracks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 border border-dashed border-slate-800 rounded-3xl bg-slate-900/20">
                    <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-slate-500 text-xs font-mono tracking-widest uppercase">Establishing GitHub Uplink...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                    {featuredTracks.map(key => {
                        const type = getFeaturedType(key);
                        if (!type) return null;
                        return (
                            <FeaturedCard 
                                key={key}
                                trackKey={key}
                                config={TRACK_STYLES[type]}
                                onClick={() => onSelectTrack(key)}
                            />
                        );
                    })}
                </div>
            )}
        </div>

        {/* F1 Style Dropdown for Other Tracks */}
        {otherTracks.length > 0 && (
            <div className="max-w-2xl mx-auto w-full mb-24 animate-fade-in-up">
                 <div className="bg-slate-900 border border-slate-800 rounded-2xl p-1.5 flex items-center shadow-2xl">
                    <div className="hidden md:flex items-center justify-center w-14 h-14 bg-slate-950 rounded-xl border border-slate-800 mr-2 text-slate-500">
                        <Grid size={20} />
                    </div>
                    
                    <div className="relative flex-1 group">
                        <label className="absolute -top-2.5 left-4 px-2 bg-slate-900 text-[10px] font-bold text-slate-500 uppercase tracking-wider z-10">
                            Extended Track Database
                        </label>
                        <select 
                            onChange={(e) => onSelectTrack(e.target.value)}
                            className="w-full appearance-none bg-slate-950/50 hover:bg-slate-800 text-white font-mono text-sm py-4 px-6 pr-12 rounded-xl border-0 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer"
                            defaultValue=""
                        >
                            <option value="" disabled>Select Circuit Configuration...</option>
                            {otherTracks.map(t => (
                                <option key={t} value={t} className="bg-slate-900 py-2">
                                    {t.replace(/_/g, ' ').toUpperCase()}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-hover:text-white transition-colors" size={18} />
                    </div>
                 </div>
            </div>
        )}

        {/* Footer */}
        <div className="mt-auto flex flex-col md:flex-row justify-between items-center text-slate-600 text-[10px] font-mono uppercase tracking-wider py-8 border-t border-slate-900">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
             <Activity size={12} className="text-emerald-500" />
             <span>Latency: 12ms</span>
             <span className="mx-2">|</span>
             <span>GPU Acceleration: Active</span>
          </div>
          <div className="flex gap-6">
            <span className="hover:text-slate-400 cursor-pointer transition-colors">Path Planning Studio v3.5</span>
            <span className="hover:text-slate-400 cursor-pointer transition-colors">Guilhem Arthaud</span>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LandingPage;