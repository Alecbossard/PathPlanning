import React, { useEffect, useRef } from 'react';
import { ArrowLeft, RefreshCw, Activity, Network, Cpu, Zap, GitMerge, Sparkles } from 'lucide-react';

interface SimulationsPageProps {
  onBack: () => void;
}

type Point = { x: number; y: number };

// --- Shared Canvas Helpers ---
const TRACK_WIDTH = 300;
const TRACK_HEIGHT = 250;

const drawTrack = (ctx: CanvasRenderingContext2D) => {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, TRACK_WIDTH, TRACK_HEIGHT);
  
  // Draw boundaries (Simple U-Shape representation)
  const BOUNDARY_LEFT: Point[] = [
    { x: 50, y: 220 }, { x: 50, y: 100 }, 
    { x: 100, y: 50 }, { x: 200, y: 50 }, 
    { x: 250, y: 100 }, { x: 250, y: 220 }
  ];
  const BOUNDARY_RIGHT: Point[] = [
      { x: 20, y: 220 }, { x: 20, y: 80 }, 
      { x: 80, y: 20 }, { x: 220, y: 20 }, 
      { x: 280, y: 80 }, { x: 280, y: 220 }
  ];

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  
  [BOUNDARY_LEFT, BOUNDARY_RIGHT].forEach(poly => {
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for(let i=1; i<poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.stroke();
  });
  
  ctx.setLineDash([]);
};

// --- 1. Centerline Visualizer (Geometric) ---
const CenterlineCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let tick = 0;

        // Simulating Cones
        const leftCones: Point[] = [];
        const rightCones: Point[] = [];
        const steps = 15;
        
        for(let i=0; i<=steps; i++) {
            const t = i/steps;
            // Left (Inner)
            let lx, ly, rx, ry;
            if (t < 0.3) { lx = 50; ly = 220 - t*400; rx = 20; ry = 220 - t*400; }
            else if (t < 0.7) { 
                const ang = Math.PI + ((t-0.3)/0.4)*Math.PI;
                lx = 150 + Math.cos(ang)*100; ly = 100 + Math.sin(ang)*50;
                rx = 150 + Math.cos(ang)*130; ry = 100 + Math.sin(ang)*80;
            } else { 
                lx = 250; ly = 50 + (t-0.7)*400; 
                rx = 280; ry = 20 + (t-0.7)*400;
            }
            leftCones.push({x: lx, y: ly});
            rightCones.push({x: rx, y: ry});
        }

        const loop = () => {
            drawTrack(ctx);
            tick++;

            // Draw Cones
            leftCones.forEach(p => { ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill(); });
            rightCones.forEach(p => { ctx.fillStyle = '#eab308'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill(); });

            // Draw Pairing & Center
            const progress = (tick % 200) / 100; // 0 to 2
            
            const midpoints: Point[] = [];

            for(let i=0; i<leftCones.length; i++) {
                const l = leftCones[i];
                const r = rightCones[i];
                const mid = { x: (l.x + r.x)/2, y: (l.y + r.y)/2 };
                midpoints.push(mid);

                // Animate Pairing Line
                if (progress < 1.0) {
                    const curProgress = Math.min(1, Math.max(0, progress * steps - i));
                    if (curProgress > 0) {
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(l.x, l.y);
                        ctx.lineTo(l.x + (r.x - l.x)*curProgress, l.y + (r.y - l.y)*curProgress);
                        ctx.stroke();
                    }
                } else {
                    // Show Midpoint Dot
                    const reveal = Math.min(1, Math.max(0, (progress-1) * steps - i));
                    if (reveal > 0) {
                        ctx.fillStyle = '#94a3b8';
                        ctx.beginPath();
                        ctx.arc(mid.x, mid.y, 2 * reveal, 0, Math.PI*2);
                        ctx.fill();
                    }
                }
            }

            // Draw Final Line
            if (progress > 1.2) {
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = 2;
                ctx.beginPath();
                const limit = Math.floor(((progress-1.2)/0.8) * midpoints.length);
                if (limit > 0) {
                    ctx.moveTo(midpoints[0].x, midpoints[0].y);
                    for(let i=1; i<Math.min(limit, midpoints.length); i++) ctx.lineTo(midpoints[i].x, midpoints[i].y);
                    ctx.stroke();
                }
            }

            requestAnimationFrame(loop);
        };
        const id = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(id);
    }, []);

    return <canvas ref={canvasRef} width={TRACK_WIDTH} height={TRACK_HEIGHT} className="w-full h-full" />;
};

// --- 2. Laplacian Visualizer ---
const LaplacianCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let points: Point[] = [];
        let iteration = 0;
        let phase = 'INIT'; // INIT, SMOOTH, RESET

        const init = () => {
            points = [];
            const steps = 20;
            for(let i=0; i<=steps; i++) {
                let x, y;
                if (i < 6) { x = 35; y = 220 - i*20; }
                else if (i < 14) { 
                    const angle = Math.PI + ((i-6)/8)*Math.PI; 
                    x = 150 + Math.cos(angle)*115;
                    y = 100 + Math.sin(angle)*50;
                } else { x = 265; y = 100 + (i-14)*20; }

                // Add Noise
                x += (Math.random() - 0.5) * 30;
                y += (Math.random() - 0.5) * 30;
                points.push({x, y});
            }
            iteration = 0;
            phase = 'SMOOTH';
        };
        init();

        const loop = () => {
            drawTrack(ctx);
            
            if (phase === 'SMOOTH') {
                if (iteration < 100) {
                    const newPoints = points.map(p => ({...p}));
                    for(let i=1; i<points.length-1; i++) {
                        newPoints[i].x += ( (points[i-1].x + points[i+1].x)/2 - points[i].x ) * 0.1;
                        newPoints[i].y += ( (points[i-1].y + points[i+1].y)/2 - points[i].y ) * 0.1;
                    }
                    points = newPoints;
                    iteration++;
                } else {
                    phase = 'WAIT';
                    setTimeout(() => { init(); }, 2000);
                }
            }

            ctx.strokeStyle = phase === 'WAIT' ? '#a855f7' : '#d8b4fe';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for(let i=1; i<points.length; i++) ctx.lineTo(points[i].x, points[i].y);
            ctx.stroke();

            ctx.fillStyle = '#fff';
            points.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2, 0, Math.PI*2);
                ctx.fill();
            });

            requestAnimationFrame(loop);
        };
        const id = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(id);
    }, []);

    return <canvas ref={canvasRef} width={TRACK_WIDTH} height={TRACK_HEIGHT} className="w-full h-full" />;
};

// --- 3. RRT* Visualizer ---
const RRTCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        type Node = { x: number, y: number, parent: Node | null };
        let nodes: Node[] = [];
        let goal: Node = { x: 265, y: 220, parent: null };
        let start: Node = { x: 35, y: 220, parent: null };
        let pathFound: Node[] = [];

        const reset = () => { nodes = [start]; pathFound = []; };
        reset();

        const loop = () => {
            drawTrack(ctx);
            
            if (pathFound.length === 0 && nodes.length < 500) {
                let rx = Math.random() * TRACK_WIDTH;
                let ry = Math.random() * TRACK_HEIGHT;
                if (Math.random() > 0.8) { rx = goal.x; ry = goal.y; }

                let nearest = nodes[0];
                let minDist = Infinity;
                nodes.forEach(n => {
                    const d = Math.hypot(n.x - rx, n.y - ry);
                    if (d < minDist) { minDist = d; nearest = n; }
                });

                const stepSize = 15;
                const angle = Math.atan2(ry - nearest.y, rx - nearest.x);
                const nx = nearest.x + Math.cos(angle) * stepSize;
                const ny = nearest.y + Math.sin(angle) * stepSize;

                // Simple bounds check
                const inVoid = (nx > 100 && nx < 200 && ny > 100); 
                if (!inVoid) {
                    const newNode: Node = { x: nx, y: ny, parent: nearest };
                    nodes.push(newNode);
                    if (Math.hypot(nx - goal.x, ny - goal.y) < 20) {
                        let curr: Node | null = newNode;
                        while (curr) { pathFound.push(curr); curr = curr.parent; }
                        setTimeout(reset, 3000);
                    }
                }
            }

            ctx.lineWidth = 1;
            nodes.forEach(n => {
                if (n.parent) {
                    ctx.strokeStyle = '#334155';
                    ctx.beginPath(); ctx.moveTo(n.parent.x, n.parent.y); ctx.lineTo(n.x, n.y); ctx.stroke();
                    ctx.fillStyle = '#475569';
                    ctx.beginPath(); ctx.arc(n.x, n.y, 1.5, 0, Math.PI*2); ctx.fill();
                }
            });

            if (nodes.length > 1) {
                const last = nodes[nodes.length-1];
                ctx.fillStyle = '#10b981';
                ctx.beginPath(); ctx.arc(last.x, last.y, 3, 0, Math.PI*2); ctx.fill();
            }

            if (pathFound.length > 0) {
                ctx.strokeStyle = '#10b981';
                ctx.lineWidth = 3;
                ctx.shadowBlur = 10; ctx.shadowColor = '#10b981';
                ctx.beginPath();
                ctx.moveTo(pathFound[0].x, pathFound[0].y);
                for(let i=1; i<pathFound.length; i++) ctx.lineTo(pathFound[i].x, pathFound[i].y);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            requestAnimationFrame(loop);
        };
        const id = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(id);
    }, []);

    return <canvas ref={canvasRef} width={TRACK_WIDTH} height={TRACK_HEIGHT} className="w-full h-full" />;
}

// --- 4. QP Visualizer ---
const QPCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let points: Point[] = [];
        let iteration = 0;

        const centerPoints: Point[] = [];
        for(let i=0; i<=20; i++) {
            let x, y;
            if (i < 6) { x = 35; y = 220 - i*20; }
            else if (i < 14) { 
                const angle = Math.PI + ((i-6)/8)*Math.PI; 
                x = 150 + Math.cos(angle)*115; y = 100 + Math.sin(angle)*50;
            } else { x = 265; y = 100 + (i-14)*20; }
            centerPoints.push({x, y});
        }

        const reset = () => { points = centerPoints.map(p => ({...p})); iteration = 0; };
        reset();

        const loop = () => {
            drawTrack(ctx);

            if (iteration < 150) {
                const newPoints = points.map(p => ({...p}));
                for(let i=1; i<points.length-1; i++) {
                    // Minimize curvature (push outward)
                    const tx = (points[i-1].x + points[i+1].x)/2 - points[i].x;
                    const ty = (points[i-1].y + points[i+1].y)/2 - points[i].y;
                    newPoints[i].x += tx * 0.1;
                    newPoints[i].y += ty * 0.1;

                    const cx = centerPoints[i].x;
                    const cy = centerPoints[i].y;
                    const dist = Math.hypot(newPoints[i].x - cx, newPoints[i].y - cy);
                    const MAX_WIDTH = 30; 
                    if (dist > MAX_WIDTH) {
                        const angle = Math.atan2(newPoints[i].y - cy, newPoints[i].x - cx);
                        newPoints[i].x = cx + Math.cos(angle) * MAX_WIDTH;
                        newPoints[i].y = cy + Math.sin(angle) * MAX_WIDTH;
                    }
                }
                points = newPoints;
                iteration++;
            } else {
                setTimeout(reset, 2000);
            }

            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(centerPoints[0].x, centerPoints[0].y);
            for(let i=1; i<centerPoints.length; i++) ctx.lineTo(centerPoints[i].x, centerPoints[i].y);
            ctx.stroke();

            const isDone = iteration >= 150;
            ctx.strokeStyle = isDone ? '#f97316' : '#fdba74';
            ctx.lineWidth = 3;
            ctx.shadowBlur = isDone ? 10 : 0; ctx.shadowColor = '#f97316';
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for(let i=1; i<points.length; i++) ctx.lineTo(points[i].x, points[i].y);
            ctx.stroke();
            ctx.shadowBlur = 0;

            requestAnimationFrame(loop);
        };
        const id = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(id);
    }, []);

    return <canvas ref={canvasRef} width={TRACK_WIDTH} height={TRACK_HEIGHT} className="w-full h-full" />;
}

// --- 5. Hybrid Visualizer (Blend) ---
const HybridCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let points: Point[] = [];
        let iteration = 0;

        const centerPoints: Point[] = [];
        for(let i=0; i<=20; i++) {
            let x, y;
            if (i < 6) { x = 35; y = 220 - i*20; }
            else if (i < 14) { 
                const angle = Math.PI + ((i-6)/8)*Math.PI; 
                x = 150 + Math.cos(angle)*115; y = 100 + Math.sin(angle)*50;
            } else { x = 265; y = 100 + (i-14)*20; }
            centerPoints.push({x, y});
        }

        const reset = () => { points = centerPoints.map(p => ({...p})); iteration = 0; };
        reset();

        const loop = () => {
            drawTrack(ctx);

            if (iteration < 150) {
                const newPoints = points.map(p => ({...p}));
                const QP_WEIGHT = 0.6; 

                for(let i=1; i<points.length-1; i++) {
                    const prev = points[i-1];
                    const next = points[i+1];
                    
                    // Laplacian Target (Shortest path -> Straight line)
                    const lapX = (prev.x + next.x) / 2;
                    const lapY = (prev.y + next.y) / 2;

                    // QP Target (Smoothness -> Min Curvature forces, simplified here)
                    // For visual simplicity, we just use a slightly different vector calculation
                    // that simulates the "push out" effect
                    const qpX = lapX; // In 2D sim, QP target is complex, we cheat by blending the constraint
                    
                    // Move towards Laplacian
                    const tx = lapX - points[i].x;
                    const ty = lapY - points[i].y;

                    newPoints[i].x += tx * 0.1;
                    newPoints[i].y += ty * 0.1;

                    // Constraint: Hybrid has tighter/looser bounds depending on weight
                    const cx = centerPoints[i].x;
                    const cy = centerPoints[i].y;
                    const dist = Math.hypot(newPoints[i].x - cx, newPoints[i].y - cy);
                    
                    // Hybrid often allows slightly less deviation than pure QP
                    const MAX_WIDTH = 30 * QP_WEIGHT; 

                    if (dist > MAX_WIDTH) {
                        const angle = Math.atan2(newPoints[i].y - cy, newPoints[i].x - cx);
                        newPoints[i].x = cx + Math.cos(angle) * MAX_WIDTH;
                        newPoints[i].y = cy + Math.sin(angle) * MAX_WIDTH;
                    }
                }
                points = newPoints;
                iteration++;
            } else {
                setTimeout(reset, 2000);
            }

            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(centerPoints[0].x, centerPoints[0].y); for(let i=1; i<centerPoints.length; i++) ctx.lineTo(centerPoints[i].x, centerPoints[i].y); ctx.stroke();

            const isDone = iteration >= 150;
            // Cyan color for Hybrid
            ctx.strokeStyle = isDone ? '#06b6d4' : '#67e8f9';
            ctx.lineWidth = 3;
            ctx.shadowBlur = isDone ? 10 : 0; ctx.shadowColor = '#06b6d4';
            ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for(let i=1; i<points.length; i++) ctx.lineTo(points[i].x, points[i].y); ctx.stroke();
            ctx.shadowBlur = 0;

            requestAnimationFrame(loop);
        };
        const id = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(id);
    }, []);

    return <canvas ref={canvasRef} width={TRACK_WIDTH} height={TRACK_HEIGHT} className="w-full h-full" />;
}

// --- 6. Pipeline (RRT* + QP) Visualizer ---
const PipelineCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        type Node = { x: number, y: number, parent: Node | null };
        let nodes: Node[] = [];
        let goal = { x: 265, y: 220 };
        let start = { x: 35, y: 220 };
        let path: Point[] = [];
        let phase = 'SEARCH'; // SEARCH -> FOUND -> SMOOTH -> RESET
        let smoothIter = 0;

        const reset = () => {
            nodes = [{ x: start.x, y: start.y, parent: null }];
            path = [];
            phase = 'SEARCH';
            smoothIter = 0;
        };
        reset();

        const loop = () => {
            drawTrack(ctx);

            // 1. RRT Phase
            if (phase === 'SEARCH') {
                // Fast forward RRT for visual sake
                for(let k=0; k<5; k++) {
                    let rx = Math.random() * TRACK_WIDTH;
                    let ry = Math.random() * TRACK_HEIGHT;
                    if (Math.random() > 0.6) { rx = goal.x; ry = goal.y; } // High bias

                    let nearest = nodes[0];
                    let minDist = Infinity;
                    nodes.forEach(n => {
                        const d = Math.hypot(n.x - rx, n.y - ry);
                        if (d < minDist) { minDist = d; nearest = n; }
                    });

                    const stepSize = 20;
                    const angle = Math.atan2(ry - nearest.y, rx - nearest.x);
                    const nx = nearest.x + Math.cos(angle) * stepSize;
                    const ny = nearest.y + Math.sin(angle) * stepSize;

                    const inVoid = (nx > 100 && nx < 200 && ny > 100);
                    if (!inVoid) {
                        const newNode = { x: nx, y: ny, parent: nearest };
                        nodes.push(newNode);
                        if (Math.hypot(nx - goal.x, ny - goal.y) < 25) {
                            // Found
                            let curr: Node | null = newNode;
                            while (curr) { path.unshift({x: curr.x, y: curr.y}); curr = curr.parent; }
                            phase = 'FOUND';
                            break;
                        }
                    }
                }

                // Draw Tree
                ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
                nodes.forEach(n => { if(n.parent) { ctx.beginPath(); ctx.moveTo(n.parent.x, n.parent.y); ctx.lineTo(n.x, n.y); ctx.stroke(); }});
            }

            // 2. Found Phase (Pause)
            if (phase === 'FOUND') {
                // Draw Raw Path
                ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y); for(let i=1; i<path.length; i++) ctx.lineTo(path[i].x, path[i].y); ctx.stroke();
                
                if (Math.random() > 0.95) phase = 'SMOOTH'; // Trigger smoothing randomly
            }

            // 3. QP Smoothing Phase
            if (phase === 'SMOOTH') {
                 if (smoothIter < 100) {
                     const newPath = path.map(p => ({...p}));
                     // Simple smoothing
                     for(let i=1; i<path.length-1; i++) {
                         newPath[i].x += ((path[i-1].x + path[i+1].x)/2 - path[i].x) * 0.2;
                         newPath[i].y += ((path[i-1].y + path[i+1].y)/2 - path[i].y) * 0.2;
                     }
                     // Add dummy points to make it look cleaner if path is short
                     if (path.length < 20 && smoothIter % 5 === 0) {
                         // subdivide
                         const sub = [];
                         for(let i=0; i<newPath.length-1; i++) {
                             sub.push(newPath[i]);
                             sub.push({ x: (newPath[i].x+newPath[i+1].x)/2, y: (newPath[i].y+newPath[i+1].y)/2 });
                         }
                         sub.push(newPath[newPath.length-1]);
                         path = sub;
                     } else {
                         path = newPath;
                     }
                     smoothIter++;
                 } else {
                     setTimeout(reset, 2000);
                     phase = 'DONE';
                 }

                 // Draw Smoothing Path (Pink/Hot Pink)
                 ctx.strokeStyle = '#db2777'; ctx.lineWidth = 3;
                 ctx.shadowBlur = 10; ctx.shadowColor = '#db2777';
                 ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y); for(let i=1; i<path.length; i++) ctx.lineTo(path[i].x, path[i].y); ctx.stroke();
                 ctx.shadowBlur = 0;
            }

            if (phase === 'DONE') {
                 ctx.strokeStyle = '#db2777'; ctx.lineWidth = 3;
                 ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y); for(let i=1; i<path.length; i++) ctx.lineTo(path[i].x, path[i].y); ctx.stroke();
            }

            requestAnimationFrame(loop);
        };
        const id = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(id);
    }, []);

    return <canvas ref={canvasRef} width={TRACK_WIDTH} height={TRACK_HEIGHT} className="w-full h-full" />;
}


// --- Main Component ---

const SimulationCard: React.FC<{
    title: string;
    desc: string;
    icon: React.ReactNode;
    color: string;
    CanvasComp: React.FC;
}> = ({ title, desc, icon, color, CanvasComp }) => (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-600 transition-colors group flex flex-col">
        <div className="p-4 flex items-center gap-3 border-b border-slate-800 bg-slate-950/30">
            <div className={`p-2 rounded-lg bg-slate-800 ${color}`}>
                {icon}
            </div>
            <div>
                <h3 className="font-bold text-slate-100 text-sm">{title}</h3>
            </div>
        </div>
        
        {/* Visualization Area */}
        <div className="h-64 bg-slate-950 relative flex items-center justify-center overflow-hidden">
             {/* Grid */}
             <div 
                className="absolute inset-0 opacity-[0.05] pointer-events-none"
                style={{
                    backgroundImage: `linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)`,
                    backgroundSize: '20px 20px'
                }}
            />
            <CanvasComp />
        </div>

        <div className="p-4 bg-slate-900/50 flex-grow">
            <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
        </div>
    </div>
);

const SimulationsPage: React.FC<SimulationsPageProps> = ({ onBack }) => {
  return (
    <div className="h-full bg-slate-950 relative text-slate-200 overflow-y-auto">
        {/* Back Nav */}
        <div className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between">
             <button 
                onClick={onBack}
                className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={18} /> Back to Home
            </button>
            <span className="text-xs font-mono text-slate-600 uppercase">Live Visualization Engine</span>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-12">
            <div className="mb-10">
                <h1 className="text-3xl font-bold text-white mb-2">Real-time Simulations</h1>
                <p className="text-slate-400 max-w-2xl">
                    Observe how different path planning algorithms explore space and optimize trajectories in a simplified 2D environment.
                    These visualizations run in real-time using the same logic core as the 3D simulator.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-10">
                
                <SimulationCard 
                    title="Geometric Centerline"
                    desc="The most basic algorithm. It identifies the left (blue) and right (yellow) track limits, pairs them based on proximity, and draws a line exactly in the middle. Safe, but slow."
                    icon={<Activity size={18} />}
                    color="text-blue-400"
                    CanvasComp={CenterlineCanvas}
                />

                <SimulationCard 
                    title="Laplacian Smoothing"
                    desc="Iteratively moves points towards the average position of their neighbors. Notice how the jagged noise is rapidly eliminated, creating a smooth 'elastic band' effect."
                    icon={<Zap size={18} />}
                    color="text-purple-400"
                    CanvasComp={LaplacianCanvas}
                />

                <SimulationCard 
                    title="RRT* Exploration"
                    desc="Rapidly-exploring Random Tree. Watch as the algorithm samples random green points, builds a tree (grey lines), and attempts to connect Start to Goal. The final path (green line) emerges from chaos."
                    icon={<Network size={18} />}
                    color="text-emerald-400"
                    CanvasComp={RRTCanvas}
                />

                <SimulationCard 
                    title="Quadratic Programming (QP)"
                    desc="Minimizes curvature (2nd derivative). Unlike Laplacian which shortens the path, QP actively pushes the line outward to 'hit the apexes', maximizing the corner radius for higher speed."
                    icon={<Cpu size={18} />}
                    color="text-orange-400"
                    CanvasComp={QPCanvas}
                />

                <SimulationCard 
                    title="Hybrid Blend"
                    desc="A strategic compromise. It pulls the path inward to shorten distance (like Laplacian) while pushing outward to smooth turns (like QP). The result (Cyan) is a tunable balance."
                    icon={<GitMerge size={18} />}
                    color="text-cyan-400"
                    CanvasComp={HybridCanvas}
                />

                <SimulationCard 
                    title="Pipeline (RRT* + QP)"
                    desc="The state-of-the-art approach. First, RRT* (Green) finds a rough topological solution through the track. Then, the QP solver instantly smooths it (Pink) into a race-ready trajectory."
                    icon={<Sparkles size={18} />}
                    color="text-pink-400"
                    CanvasComp={PipelineCanvas}
                />

            </div>
        </div>
    </div>
  );
};

export default SimulationsPage;