
import React, { useMemo } from 'react';
import { 
  Users, 
  Globe, 
  Zap, 
  GitCommit,
  ArrowUpRight,
  Activity,
  FileJson,
  History
} from 'lucide-react';
import { SectionCard } from '../components/Common';

// Mock data for 24-hour traffic (00:00 to 23:00)
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

const ChartContainer: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; legend?: React.ReactNode }> = ({ 
  title, subtitle, children, legend 
}) => (
  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-64">
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
  const max = Math.max(...data, 5); // Minimum scale of 5
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * 100;
    const y = 100 - (val / max) * 100;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `0,100 ${points} 100,100`;

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
      {/* Grid lines */}
      <line x1="0" y1="25" x2="100" y2="25" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="75" x2="100" y2="75" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      
      {/* Area Fill */}
      <polygon points={areaPoints} fill="url(#deviceGradient)" className="opacity-20" />
      
      {/* Line */}
      <polyline 
        points={points} 
        fill="none" 
        stroke="#6366f1" 
        strokeWidth="2" 
        vectorEffect="non-scaling-stroke" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
      
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
  // Calculate max for shared scale
  const max = Math.max(...upload, ...download) * 1.1; 
  
  const makePath = (dataset: number[]) => dataset.map((val, i) => {
    const x = (i / (dataset.length - 1)) * 100;
    const y = 100 - (val / max) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
       {/* Grid lines */}
      <line x1="0" y1="25" x2="100" y2="25" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="75" x2="100" y2="75" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />

      {/* Download Line (Blue) */}
      <polyline 
        points={makePath(download)} 
        fill="none" 
        stroke="#3b82f6" 
        strokeWidth="2" 
        vectorEffect="non-scaling-stroke" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />

      {/* Upload Line (Emerald) */}
      <polyline 
        points={makePath(upload)} 
        fill="none" 
        stroke="#10b981" 
        strokeWidth="2" 
        vectorEffect="non-scaling-stroke" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
    </svg>
  );
};

export const DashboardPage: React.FC = () => {
  // Generate deterministic mock data for dashboard charts
  const chartsData = useMemo(() => {
    return {
      devices: generateTrendData(24, 20, 60), // Global devices: 20-60 range
      upload: generateTrendData(24, 100, 500), // Global Upload
      download: generateTrendData(24, 800, 2000), // Global Download
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Users Stats */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
              <Users size={20} />
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center">
              <ArrowUpRight size={12} className="mr-0.5" /> +3
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Users</p>
          <p className="text-2xl font-bold tabular-nums mt-1">142</p>
        </div>

        {/* Domain Rules Stats */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
              <Globe size={20} />
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Domain Rules</p>
          <p className="text-2xl font-bold tabular-nums mt-1">3,420</p>
        </div>

        {/* Proxies Stats */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center">
              <Zap size={20} />
            </div>
            <span className="text-xs font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full">
              24 Active
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Proxy Nodes</p>
          <p className="text-2xl font-bold tabular-nums mt-1">28</p>
        </div>

        {/* Config Version Stats */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center">
              <GitCommit size={20} />
            </div>
            <span className="text-[10px] font-mono font-bold text-slate-500">HEAD</span>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Config Version</p>
          <p className="text-2xl font-bold tabular-nums mt-1">v1.2.4</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Subscription Requests" description="Config profile sync requests over the last 24 hours.">
            <div className="h-64 flex items-end gap-1.5 px-2 pt-8">
              {TRAFFIC_DATA.map((value, i) => {
                const heightPercent = (value / MAX_TRAFFIC) * 100;
                // Highlight peaks (top 20% of values)
                const isPeak = value > MAX_TRAFFIC * 0.7;
                
                return (
                  <div key={i} className="flex-1 flex flex-col justify-end gap-1 group relative h-full">
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                      <div className="bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap">
                        {value} reqs
                        <div className="text-slate-400 font-normal">{String(i).padStart(2, '0')}:00</div>
                      </div>
                      <div className="w-2 h-2 bg-slate-900 rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1"></div>
                    </div>

                    {/* Bar */}
                    <div 
                      className={`
                        w-full rounded-t-sm transition-all duration-500 ease-out
                        ${isPeak 
                          ? 'bg-gradient-to-t from-blue-600 to-blue-400 opacity-90 hover:opacity-100' 
                          : 'bg-blue-200 opacity-60 hover:bg-blue-300 hover:opacity-100'}
                      `}
                      style={{ height: `${heightPercent}%` }}
                    ></div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-4 text-[10px] font-medium text-slate-400 px-1">
               <span>00:00</span>
               <span>04:00</span>
               <span>08:00</span>
               <span>12:00</span>
               <span>16:00</span>
               <span>20:00</span>
               <span>23:59</span>
            </div>
          </SectionCard>

          {/* Additional Global Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ChartContainer 
              title="Online Devices" 
              subtitle="Global concurrent connections (24h)"
              legend={<div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Devices</div>}
            >
              <DeviceTrendChart data={chartsData.devices} />
            </ChartContainer>

            <ChartContainer 
              title="Network Traffic" 
              subtitle="Total bandwidth usage (24h)"
              legend={
                <>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Down</div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Up</div>
                </>
              }
            >
              <TrafficTrendChart upload={chartsData.upload} download={chartsData.download} />
            </ChartContainer>
          </div>
        </div>

        <div className="space-y-6">
          <SectionCard title="Recent Audit Log" actions={<History size={16} className="text-slate-400"/>}>
             <div className="space-y-0">
               {[
                 { action: 'Config Published', user: 'admin', time: '10 mins ago', type: 'publish' },
                 { action: 'Added User: bob_sales', user: 'admin', time: '2 hours ago', type: 'user' },
                 { action: 'Updated Domain Rule', user: 'admin', time: '5 hours ago', type: 'rule' },
                 { action: 'Node HK-01 Timeout', user: 'system', time: '1 day ago', type: 'alert' },
                 { action: 'New API Key Generated', user: 'alice_dev', time: '1 day ago', type: 'security' },
               ].map((log, i) => (
                 <div key={i} className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 -mx-2 px-2 rounded-lg transition-colors">
                   <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 
                     ${log.type === 'publish' ? 'bg-emerald-500' : 
                       log.type === 'alert' ? 'bg-rose-500' : 'bg-blue-400'}
                   `}></div>
                   <div className="min-w-0 flex-1">
                     <p className="text-xs font-semibold text-slate-800">{log.action}</p>
                     <p className="text-[10px] text-slate-500 mt-0.5">
                       <span className="font-medium text-slate-600">{log.user}</span> • {log.time}
                     </p>
                   </div>
                 </div>
               ))}
             </div>
             <button className="w-full mt-4 py-2 text-slate-500 text-xs font-medium hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors flex items-center justify-center">
               View Full Log
             </button>
          </SectionCard>
          
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={16} className="text-blue-600" />
              <h3 className="text-xs font-bold text-slate-700 uppercase">System Status</h3>
            </div>
            <div className="space-y-2">
               <div className="flex justify-between items-center text-xs">
                 <span className="text-slate-500">API Latency</span>
                 <span className="font-mono text-emerald-600 font-bold">24ms</span>
               </div>
               <div className="flex justify-between items-center text-xs">
                 <span className="text-slate-500">Database</span>
                 <span className="text-emerald-600 font-bold">Healthy</span>
               </div>
               <div className="flex justify-between items-center text-xs">
                 <span className="text-slate-500">Last Backup</span>
                 <span className="text-slate-600">4h ago</span>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
