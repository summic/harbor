
import React from 'react';
import { useQuery } from '@tanstack/react-query';
// Added Shuffle to imports
import { Plus, MoveUp, MoveDown, Trash2, Edit3, Network, Target, Shuffle } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, StatusBadge, LoadingOverlay } from '../components/Common';

export const RoutingPage: React.FC = () => {
  const { data: rules, isLoading } = useQuery({ queryKey: ['routing'], queryFn: mockApi.getRouting });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Routing Policies</h1>
          <p className="text-slate-500">Define how traffic flows through different outbounds.</p>
        </div>
        <button className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:scale-95 transition-all">
          <Plus size={16} className="mr-2" />
          Add Policy
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <SectionCard title="Rules Order">
            <div className="relative overflow-hidden -mx-6 -my-6">
              {isLoading && <LoadingOverlay />}
              <div className="space-y-0.5 p-2">
                {rules?.sort((a,b) => a.priority - b.priority).map((rule, idx) => (
                  <div key={rule.id} className="flex items-center p-3 bg-white border border-slate-100 rounded-lg hover:border-blue-200 hover:shadow-sm transition-all group">
                    <div className="flex flex-col items-center mr-4 text-slate-300">
                      <button className="hover:text-blue-500 p-0.5"><MoveUp size={14} /></button>
                      <span className="text-[10px] font-bold tabular-nums my-0.5">{idx + 1}</span>
                      <button className="hover:text-blue-500 p-0.5"><MoveDown size={14} /></button>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold tracking-tighter uppercase px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                          {rule.matchType}
                        </span>
                        <h4 className="text-sm font-semibold truncate">{rule.matchExpr}</h4>
                      </div>
                      <div className="flex items-center text-xs text-slate-500">
                        <Network size={12} className="mr-1" />
                        <span>Outbound:</span>
                        <span className="ml-1.5 font-semibold text-blue-600 uppercase tracking-wide">{rule.outbound}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <StatusBadge active={rule.enabled} />
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-2 text-slate-400 hover:text-blue-600"><Edit3 size={16} /></button>
                        <button className="p-2 text-slate-400 hover:text-rose-600"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Traffic Simulator" description="Verify routing decisions for a specific target.">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Target URL / IP</label>
                <input 
                  type="text" 
                  placeholder="e.g. 8.8.8.8 or google.com"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <button className="w-full py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors">
                Run Simulation
              </button>

              <div className="relative mt-4">
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200"></div>
                <div className="space-y-6 relative">
                  <div className="flex items-start">
                    <div className="z-10 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center border-2 border-white shadow-sm">
                      <Target size={12} className="text-blue-600" />
                    </div>
                    <div className="ml-4 pt-0.5">
                      <p className="text-xs font-bold uppercase text-slate-400">Input</p>
                      <p className="text-sm font-medium">google.com</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="z-10 w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center border-2 border-white shadow-sm">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    </div>
                    <div className="ml-4 pt-0.5">
                      <p className="text-xs font-bold uppercase text-slate-400">Match</p>
                      <p className="text-sm font-medium">geosite: google (Rule #2)</p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="z-10 w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center border-2 border-white shadow-sm">
                      <Shuffle size={12} className="text-amber-600" />
                    </div>
                    <div className="ml-4 pt-0.5">
                      <p className="text-xs font-bold uppercase text-slate-400">Outbound</p>
                      <p className="text-sm font-bold text-blue-700 uppercase">ProxyGroup</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};
