
import React, { useMemo } from 'react';
import { 
  Users, 
  Zap, 
  GitCommit,
  Activity,
  History
} from 'lucide-react';
import { SectionCard } from '../components/Common';

// --- Types & Mock Data ---

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

      {/* 2. Detailed Charts & Tables */}
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

      {/* 3. Bottom Row: Sync Requests & Logs */}
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
