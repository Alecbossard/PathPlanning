import React from 'react';
import { Flag, Zap, Trophy, Route, ArrowRight, Activity, Cpu, BookOpen, PlayCircle } from 'lucide-react';

interface LandingPageProps {
  onSelectTrack: (trackKey: string) => void;
  onShowAlgorithms: () => void;
  onShowSimulations: () => void;
}

const TrackCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  onClick: () => void;
  stats: string;
}> = ({ title, description, icon, color, onClick, stats }) => (
  <div 
    onClick={onClick}
    className="group relative bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 cursor-pointer hover:-translate-y-1 transition-all duration-300 hover:shadow-2xl hover:border-slate-600 overflow-hidden flex flex-col justify-between h-full"
  >
    {/* Ambient Glow on Hover */}
    <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 bg-gradient-to-br ${color} to-transparent`} />
    
    <div className="relative z-10">
      <div className="flex justify-between items-start mb-6">
        <div className={`w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-white group-hover:scale-110 transition-transform duration-300`}>
          {icon}
        </div>
        <div className="px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
            {stats}
        </div>
      </div>
      
      <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-200 transition-colors">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed mb-6">{description}</p>
    </div>

    <div className="relative z-10 mt-auto pt-6 border-t border-slate-800 flex items-center text-xs font-bold uppercase tracking-wider text-slate-500 group-hover:text-white transition-colors">
      Initialize Sim <ArrowRight size={14} className="ml-2 group-hover:translate-x-1 transition-transform" />
    </div>
  </div>
);

const LandingPage: React.FC<LandingPageProps> = ({ onSelectTrack, onShowAlgorithms, onShowSimulations }) => {
  return (
    <div className="h-full bg-slate-950 relative overflow-y-auto text-slate-200 selection:bg-blue-500/30">
      
      {/* Ambient Background Mesh (Fixed) */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none opacity-50 mix-blend-screen" />
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-purple-600/10 blur-[100px] rounded-full pointer-events-none opacity-30" />

      {/* Grid Pattern (Fixed) */}
      <div 
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
            backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-24 flex flex-col min-h-screen">
        
        {/* Hero Section */}
        <div className="mb-24 text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-8">
                <Activity size={14} /> 
                <span>System v3.4 Online</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-white mb-6 leading-tight">
                Path Planning <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Studio</span>
            </h1>
            
            <p className="text-lg text-slate-400 leading-relaxed mb-10">
                High-fidelity autonomous racing simulation environment. 
                Optimize trajectories using RRT* and Quadratic Programming with real-time telemetry analysis.
            </p>

            <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                <button 
                    onClick={onSelectTrack.bind(null, 'shanghai')}
                    className="px-8 py-3 rounded-full bg-white text-slate-900 font-bold text-sm hover:bg-blue-50 transition-colors shadow-lg shadow-blue-900/20 flex items-center gap-2"
                >
                    Launch Simulator
                    <ArrowRight size={16} />
                </button>

                <div className="flex gap-2">
                    <button 
                        onClick={onShowAlgorithms}
                        className="px-5 py-3 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-2"
                    >
                        <BookOpen size={16} />
                        Documentation
                    </button>
                    <button 
                        onClick={onShowSimulations}
                        className="px-5 py-3 rounded-full bg-slate-800 border border-slate-700 text-emerald-400 border-emerald-900/50 text-sm font-medium hover:bg-slate-700 hover:text-emerald-300 transition-colors flex items-center gap-2"
                    >
                        <PlayCircle size={16} />
                        Live Demos
                    </button>
                </div>
            </div>
        </div>

        {/* Track Selection Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-20">
          <TrackCard 
            title="Small Track"
            description="Classic FSG skidpad configuration. Ideal for testing lateral grip limits and rapid transient response calibration."
            icon={<Flag size={24} />}
            color="from-blue-600"
            stats="FSG Official"
            onClick={() => onSelectTrack('small_track')}
          />
          
          <TrackCard 
            title="Peanut Track"
            description="Figure-eight topology designed for continuous load transfer analysis and sustained cornering G-force validation."
            icon={<Zap size={24} />}
            color="from-yellow-500"
            stats="Loop Test"
            onClick={() => onSelectTrack('peanut')}
          />

          <TrackCard 
            title="Circuit 3"
            description="Technical proving ground with variable radius corners. The benchmark for path optimization algorithms."
            icon={<Route size={24} />}
            color="from-purple-600"
            stats="Technical"
            onClick={() => onSelectTrack('circuit_3')}
          />

          <TrackCard 
            title="Shanghai Circuit"
            description="Grand Prix layout featuring the iconic snail curve and a 1.2km straight for high-speed aerodynamic testing."
            icon={<Trophy size={24} />}
            color="from-emerald-600"
            stats="Grand Prix"
            onClick={() => onSelectTrack('shanghai')}
          />
        </div>

        {/* Footer */}
        <div className="mt-auto border-t border-slate-800 pt-8 flex flex-col md:flex-row justify-between items-center text-slate-500 text-xs font-mono">
          <div className="flex items-center gap-4 mb-4 md:mb-0">
             <span className="font-bold text-slate-300">PPS</span>
             <span>© 2025 Path Planning Studio</span>
          </div>
          <div className="flex gap-6">
            <button onClick={onShowAlgorithms} className="hover:text-white transition-colors">Documentation</button>
            <a href="#" className="hover:text-white transition-colors">GitHub</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LandingPage;