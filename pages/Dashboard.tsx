
import React from 'react';
import { 
  Zap, 
  Activity, 
  Clock, 
  ArrowUpRight, 
  ArrowDownRight, 
  PieChart, 
  Globe2,
  Cpu
} from 'lucide-react';
import { SectionCard } from '../components/Common';

export const DashboardPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
              <Activity size={20} />
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center">
              <ArrowUpRight size={12} className="mr-0.5" /> 12%
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Throughput</p>
          <p className="text-2xl font-bold tabular-nums mt-1">1.2 <span className="text-sm font-normal text-slate-400">MB/s</span></p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
              <Zap size={20} />
            </div>
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full flex items-center">
              - 4ms
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg Latency</p>
          <p className="text-2xl font-bold tabular-nums mt-1">45 <span className="text-sm font-normal text-slate-400">ms</span></p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center">
              <Cpu size={20} />
            </div>
            <span className="text-xs font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full">Normal</span>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">CPU Usage</p>
          <p className="text-2xl font-bold tabular-nums mt-1">2.4 <span className="text-sm font-normal text-slate-400">%</span></p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center">
              <Clock size={20} />
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Uptime</p>
          <p className="text-2xl font-bold tabular-nums mt-1">12 <span className="text-sm font-normal text-slate-400">Days</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Traffic Overview" description="Inbound and outbound data flow over the last 60 minutes.">
            <div className="h-64 flex items-end gap-1 px-2">
              {[...Array(30)].map((_, i) => (
                <div key={i} className="flex-1 flex flex-col gap-0.5">
                  <div 
                    className="w-full bg-blue-400 rounded-t-sm opacity-60 hover:opacity-100 transition-opacity" 
                    style={{ height: `${Math.random() * 60 + 10}%` }}
                  ></div>
                  <div 
                    className="w-full bg-emerald-400 rounded-b-sm opacity-40 hover:opacity-100 transition-opacity" 
                    style={{ height: `${Math.random() * 20 + 5}%` }}
                  ></div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-6 mt-6">
               <div className="flex items-center">
                 <div className="w-2 h-2 rounded-full bg-blue-400 mr-2"></div>
                 <span className="text-xs text-slate-500 font-medium">Download</span>
               </div>
               <div className="flex items-center">
                 <div className="w-2 h-2 rounded-full bg-emerald-400 mr-2"></div>
                 <span className="text-xs text-slate-500 font-medium">Upload</span>
               </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Active Connections">
             <div className="space-y-4">
               {[
                 { target: 'youtube.com', node: 'HK-Azure', type: 'HTTPS', size: '24.5MB' },
                 { target: 'github.com', node: 'US-GCP', type: 'TCP', size: '1.2MB' },
                 { target: 'steam-chat.com', node: 'JP-AWS', type: 'UDP', size: '420KB' },
                 { target: 'google-analytics.com', node: 'BLOCK', type: 'HTTPS', size: '0B' },
               ].map((conn, i) => (
                 <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
                   <div className="min-w-0 flex-1">
                     <p className="font-bold text-slate-900 truncate">{conn.target}</p>
                     <div className="flex items-center text-slate-400 mt-0.5">
                       <span className="uppercase font-mono text-[9px] bg-slate-100 px-1 rounded mr-2">{conn.type}</span>
                       <span className="truncate">via {conn.node}</span>
                     </div>
                   </div>
                   <span className="text-slate-500 font-mono tabular-nums ml-4">{conn.size}</span>
                 </div>
               ))}
               <button className="w-full py-2 text-blue-600 text-xs font-bold hover:bg-blue-50 rounded-lg transition-colors uppercase tracking-widest">
                 View All Connections
               </button>
             </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};
