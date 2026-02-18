
import React, { useMemo, useEffect, useRef } from 'react';
import { 
  Users, 
  Globe, 
  Zap, 
  GitCommit,
  ArrowUpRight,
  Activity,
  History,
  Map,
  Server,
  Radio,
  Wifi
} from 'lucide-react';
import { SectionCard } from '../components/Common';

// --- Types & Mock Data ---

interface CityData {
  name: string;
  lat: number;
  lng: number;
  type: 'hub' | 'node';
  reqs: string;
  status: 'online' | 'offline' | 'warning';
}

// Real coordinates for city-level precision
const CITIES: CityData[] = [
  { name: 'Hong Kong', lat: 22.3193, lng: 114.1694, type: 'hub', reqs: '2.4M', status: 'online' },
  { name: 'New York', lat: 40.7128, lng: -74.0060, type: 'node', reqs: '1.8M', status: 'online' },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503, type: 'node', reqs: '850K', status: 'online' },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198, type: 'node', reqs: '620K', status: 'online' },
  { name: 'Frankfurt', lat: 50.1109, lng: 8.6821, type: 'node', reqs: '120K', status: 'online' },
  { name: 'London', lat: 51.5074, lng: -0.1278, type: 'node', reqs: '340K', status: 'online' },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093, type: 'node', reqs: '90K', status: 'online' },
  { name: 'San Francisco', lat: 37.7749, lng: -122.4194, type: 'node', reqs: '450K', status: 'warning' },
];

const TRAFFIC_DATA = [
  45, 32, 25, 20, 35, 80,       // 00-05
  150, 280, 320, 310, 290, 280, // 06-11
  305, 340, 380, 420, 480, 550, // 12-17
  620, 680, 650, 500, 350, 180  // 18-23
];

const MAX_TRAFFIC = Math.max(...TRAFFIC_DATA) * 1.1;

// --- Helper: Mock Data Generator ---
const generateTrendData = (length: number, min: number, max: number) => {
  return Array.from({ length }, () => Math.floor(Math.random() * (max - min + 1)) + min);
};

// --- Helper: Simple SVG Charts ---

const ChartContainer: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; legend?: React.ReactNode; className?: string }> = ({ 
  title, subtitle, children, legend, className = ""
}) => (
  <div className={`bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-64 ${className}`}>
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {legend && <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider">{legend}</div>}
    </div>
    <div className="flex-1 w-full min-h-0 relative">
      {children}
    </div>
  </div>
);

// Single Line Chart for Devices
const DeviceTrendChart: React.FC<{ data: number[] }> = ({ data }) => {
  const max = Math.max(...data, 5); 
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - (val / max) * 100;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `0,100 ${points} 100,100`;

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
      <line x1="0" y1="25" x2="100" y2="25" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="75" x2="100" y2="75" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <polygon points={areaPoints} fill="url(#deviceGradient)" className="opacity-20" />
      <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="deviceGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
};

// Dual Line Chart for Traffic
const TrafficTrendChart: React.FC<{ upload: number[]; download: number[] }> = ({ upload, download }) => {
  const max = Math.max(...upload, ...download) * 1.1; 
  const makePath = (dataset: number[]) => dataset.map((val, i) => {
    const x = (i / (dataset.length - 1)) * 100;
    const y = 100 - (val / max) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
      <line x1="0" y1="25" x2="100" y2="25" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="75" x2="100" y2="75" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <polyline points={makePath(download)} fill="none" stroke="#3b82f6" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={makePath(upload)} fill="none" stroke="#10b981" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// --- Realistic 3D Globe Component ---

const RealisticGlobe: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let globeRadius = 0;

    const resize = () => {
      width = container.offsetWidth;
      height = container.offsetHeight;
      canvas.width = width;
      canvas.height = height;
      globeRadius = Math.min(width, height) * 0.42; // Adjust size
    };
    resize();
    window.addEventListener('resize', resize);

    // --- Globe Math & Data ---
    
    // Background dots to simulate sphere volume (Randomly distributed on sphere surface)
    const DOTS_COUNT = 800;
    const dots: {lat: number, lng: number, size: number}[] = [];
    for(let i=0; i<DOTS_COUNT; i++) {
        // Uniform sphere distribution
        const y = 1 - (i / (DOTS_COUNT - 1)) * 2; // y from -1 to 1
        const radiusAtY = Math.sqrt(1 - y * y);
        const theta = 2.39996 * i; // Golden angle increment
        const x = Math.cos(theta) * radiusAtY;
        const z = Math.sin(theta) * radiusAtY;
        
        // Convert back to lat/lng for easier unified rotation logic
        const lat = Math.asin(y) * (180 / Math.PI);
        const lng = Math.atan2(z, x) * (180 / Math.PI);
        
        dots.push({ lat, lng, size: Math.random() > 0.9 ? 1.5 : 0.8 });
    }

    let rotation = 0; // Current rotation longitude
    let animationId: number;

    // Helper: Project Lat/Lng to 3D(x,y,z) then to 2D(x,y)
    // Canvas: x right, y down. 
    // 3D: y up (lat), x/z plane (equator)
    const project = (lat: number, lng: number, rot: number) => {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lng + rot) * (Math.PI / 180);

      const x = globeRadius * Math.sin(phi) * Math.cos(theta);
      const z = globeRadius * Math.sin(phi) * Math.sin(theta); // Depth (positive is front for this math)
      const y = globeRadius * Math.cos(phi);

      return {
        x: width / 2 + x,
        y: height / 2 - y, // Invert Y for canvas
        z: z,
        visible: z > 0 // Simple occlusion culling
      };
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      rotation -= 0.2; // Speed of rotation

      // 1. Draw "Atmosphere" Glow
      const gradient = ctx.createRadialGradient(width/2, height/2, globeRadius * 0.8, width/2, height/2, globeRadius * 1.2);
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.05)');
      gradient.addColorStop(0.8, 'rgba(59, 130, 246, 0.05)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // 2. Draw Globe Background Sphere (Wireframe/Edge)
      ctx.beginPath();
      ctx.arc(width/2, height/2, globeRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)'; // Dark slate outline
      ctx.lineWidth = 1;
      ctx.stroke();

      // 3. Draw Background Dots (The World Mass)
      dots.forEach(dot => {
        const p = project(dot.lat, dot.lng, rotation);
        if (p.visible) {
           ctx.beginPath();
           ctx.fillStyle = '#475569'; // Slate 600
           const alpha = (p.z / globeRadius) * 0.3 + 0.1; // Fade by depth
           ctx.globalAlpha = alpha;
           ctx.arc(p.x, p.y, dot.size, 0, Math.PI * 2);
           ctx.fill();
        }
      });
      ctx.globalAlpha = 1.0;

      // 4. Draw Arcs (Traffic)
      // Assuming Hong Kong (index 0) is the hub
      const hub = CITIES[0];
      const pHub = project(hub.lat, hub.lng, rotation);
      
      if (pHub.visible) {
        CITIES.slice(1).forEach(city => {
          const pCity = project(city.lat, city.lng, rotation);
          if (pCity.visible) {
             ctx.beginPath();
             ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)'; // Blue trace
             ctx.lineWidth = 1;
             ctx.moveTo(pCity.x, pCity.y);
             // Simple quadratic curve to center
             ctx.quadraticCurveTo(width/2, height/2 - globeRadius * 0.5, pHub.x, pHub.y);
             ctx.stroke();
          }
        });
      }

      // 5. Draw Cities (The Data Points)
      CITIES.forEach(city => {
         const p = project(city.lat, city.lng, rotation);
         
         // Only draw if on front side (or slightly visible on edge)
         if (p.z > -20) {
            const isHub = city.type === 'hub';
            const color = city.status === 'warning' ? '#fbbf24' : (isHub ? '#10b981' : '#3b82f6');
            
            // Pulse Effect
            if (p.visible) {
              const pulseSize = (Math.sin(Date.now() / 300) + 1) * 3;
              ctx.beginPath();
              ctx.fillStyle = color;
              ctx.globalAlpha = 0.3;
              ctx.arc(p.x, p.y, isHub ? 8 + pulseSize : 4 + pulseSize, 0, Math.PI * 2);
              ctx.fill();
            }

            // Core Dot
            ctx.beginPath();
            ctx.globalAlpha = p.visible ? 1 : 0.2; // Dim if behind
            ctx.fillStyle = color;
            ctx.arc(p.x, p.y, isHub ? 5 : 3, 0, Math.PI * 2);
            ctx.fill();

            // Label (Only if visible and not crowded)
            if (p.visible && p.z > globeRadius * 0.3) {
               ctx.font = `600 ${isHub ? '12px' : '10px'} Inter, sans-serif`;
               ctx.fillStyle = '#e2e8f0';
               ctx.fillText(city.name, p.x + 8, p.y + 3);
            }
         }
      });
      ctx.globalAlpha = 1.0;

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-[400px] lg:h-[500px] relative overflow-hidden bg-slate-900 rounded-2xl shadow-2xl border border-slate-800">
       <canvas ref={canvasRef} className="absolute inset-0 cursor-move" />
       
       <div className="absolute top-6 left-6 z-10">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Globe size={20} className="text-blue-500"/> Global Connectivity
          </h2>
          <p className="text-slate-400 text-xs mt-1">Real-time node latency and traffic distribution</p>
       </div>

       <div className="absolute bottom-6 right-6 z-10 flex flex-col gap-2 pointer-events-none">
          <div className="flex items-center gap-2 justify-end">
             <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
             <span className="text-xs text-slate-300 font-mono">HUB: ONLINE</span>
          </div>
          <div className="flex items-center gap-2 justify-end">
             <span className="w-2 h-2 rounded-full bg-blue-500"></span>
             <span className="text-xs text-slate-300 font-mono">NODE: ACTIVE</span>
          </div>
       </div>
    </div>
  );
};

export const DashboardPage: React.FC = () => {
  const chartsData = useMemo(() => {
    return {
      devices: generateTrendData(24, 20, 60), 
      upload: generateTrendData(24, 100, 500), 
      download: generateTrendData(24, 800, 2000),
    };
  }, []);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto animate-fade-in">
      
      {/* 1. Header Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Users, label: 'Active Users', value: '142', change: '+3', color: 'blue' },
          { icon: Zap, label: 'Active Nodes', value: '28', sub: 'Global', color: 'indigo' },
          { icon: Activity, label: 'System Load', value: '12%', sub: 'Healthy', color: 'emerald' },
          { icon: GitCommit, label: 'Config Ver', value: 'v1.2.4', sub: 'HEAD', color: 'slate' }
        ].map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between transition-transform hover:-translate-y-0.5 duration-200">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{stat.label}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 tabular-nums">{stat.value}</span>
                {stat.change && <span className="text-xs font-bold text-emerald-600">{stat.change}</span>}
                {stat.sub && <span className="text-xs font-medium text-slate-400">{stat.sub}</span>}
              </div>
            </div>
            <div className={`w-12 h-12 bg-${stat.color}-50 text-${stat.color}-600 rounded-xl flex items-center justify-center`}>
              <stat.icon size={24} />
            </div>
          </div>
        ))}
      </div>

      {/* 2. Main Visual Section: Globe + Regions List */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Large Globe Container (Takes 2/3 width on large screens) */}
        <div className="xl:col-span-2">
           <RealisticGlobe />
        </div>

        {/* Right Side: Region List & Logs */}
        <div className="space-y-6 flex flex-col h-full">
           <SectionCard title="Node Status" actions={<Server size={16} className="text-slate-400"/>}>
              <div className="space-y-1">
                 {CITIES.map((city, i) => (
                   <div key={i} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors group cursor-default">
                      <div className="flex items-center gap-3">
                         <div className={`
                            w-2 h-2 rounded-full ring-2 ring-offset-1 ring-offset-white
                            ${city.status === 'online' ? 'bg-emerald-500 ring-emerald-100' : 'bg-amber-500 ring-amber-100'}
                         `}></div>
                         <div>
                            <p className="text-sm font-bold text-slate-800">{city.name}</p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {city.lat.toFixed(1)}, {city.lng.toFixed(1)}
                            </p>
                         </div>
                      </div>
                      <div className="text-right">
                         <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-slate-700">
                           <Activity size={12} className="text-slate-400" />
                           {city.reqs}
                         </div>
                         <span className="text-[10px] text-slate-400 uppercase tracking-wider">{city.type}</span>
                      </div>
                   </div>
                 ))}
              </div>
           </SectionCard>

           <div className="flex-1 bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-4">
                 <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                   <Radio size={16} className="text-rose-500" /> Live Alerts
                 </h3>
              </div>
              <div className="space-y-3 overflow-y-auto max-h-[200px] custom-scrollbar pr-2">
                 {[
                   { msg: 'High latency detected on US-East node', time: '2m ago', type: 'warn' },
                   { msg: 'New device authorized: MacBook Pro', time: '15m ago', type: 'info' },
                   { msg: 'Traffic spike from region: JP', time: '1h ago', type: 'info' },
                   { msg: 'Automatic backup completed', time: '4h ago', type: 'success' },
                 ].map((log, i) => (
                   <div key={i} className="flex gap-3 text-xs border-l-2 border-slate-100 pl-3 py-1">
                     <span className="text-slate-400 font-mono shrink-0">{log.time}</span>
                     <span className={`font-medium ${log.type === 'warn' ? 'text-amber-600' : 'text-slate-600'}`}>
                       {log.msg}
                     </span>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </div>

      {/* 3. Detailed Charts & Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         {/* Traffic Volume */}
         <div className="lg:col-span-2">
           <ChartContainer 
             title="Traffic Overview" 
             subtitle="Real-time bandwidth usage across all nodes"
             legend={
               <>
                 <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Download</div>
                 <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Upload</div>
               </>
             }
           >
             <TrafficTrendChart upload={chartsData.upload} download={chartsData.download} />
           </ChartContainer>
         </div>

         {/* Device Connections */}
         <div>
            <ChartContainer 
              title="Concurrent Devices" 
              subtitle="Active sessions (24h)"
              legend={<div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Connections</div>}
            >
              <DeviceTrendChart data={chartsData.devices} />
            </ChartContainer>
         </div>
      </div>

      {/* 4. Bottom Row: Sync Requests & Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <SectionCard title="Sync Requests" description="Profile update hits">
            <div className="h-48 flex items-end gap-1 px-1 pt-4">
              {TRAFFIC_DATA.map((value, i) => {
                const heightPercent = (value / MAX_TRAFFIC) * 100;
                const isPeak = value > MAX_TRAFFIC * 0.7;
                return (
                  <div key={i} className="flex-1 flex flex-col justify-end gap-1 group relative h-full">
                    <div 
                      className={`w-full rounded-sm transition-all ${isPeak ? 'bg-blue-600' : 'bg-slate-200'}`}
                      style={{ height: `${heightPercent}%` }}
                    ></div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-mono">
               <span>00:00</span>
               <span>12:00</span>
               <span>23:59</span>
            </div>
          </SectionCard>
        </div>
        
        <div className="lg:col-span-2">
           <SectionCard title="Admin Audit Log" actions={<History size={16} className="text-slate-400"/>}>
             <div className="overflow-x-auto">
               <table className="w-full text-sm text-left">
                 <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                   <tr>
                     <th className="px-4 py-3">Event</th>
                     <th className="px-4 py-3">Admin</th>
                     <th className="px-4 py-3">Time</th>
                     <th className="px-4 py-3 text-right">Target</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                   {[
                     { action: 'Config Published', user: 'admin', time: '10 mins ago', target: 'v1.2.5' },
                     { action: 'User Created', user: 'admin', time: '2 hours ago', target: 'bob_sales' },
                     { action: 'Rule Modified', user: 'admin', time: '5 hours ago', target: 'google.com' },
                   ].map((log, i) => (
                     <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-semibold text-slate-700">{log.action}</td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">{log.user}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{log.time}</td>
                        <td className="px-4 py-3 text-right text-xs text-blue-600 font-medium">{log.target}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
           </SectionCard>
        </div>
      </div>
    </div>
  );
};
