
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
// Added Shuffle to imports
import { Plus, Wifi, RefreshCw, Zap, Server, Activity, ArrowRight, MoreHorizontal, Shuffle } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, Skeleton, StatusBadge, LoadingOverlay } from '../components/Common';

export const ProxiesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: proxies, isLoading } = useQuery({ queryKey: ['proxies'], queryFn: mockApi.getProxies });
  const checkLatencyMutation = useMutation({
    mutationFn: mockApi.checkProxiesLatency,
    onSuccess: (data) => {
      queryClient.setQueryData(['proxies'], data);
    },
  });
  const totalNodes = proxies?.length ?? 0;
  const activeNodes = proxies?.filter((item) => item.enabled).length ?? 0;
  const latencyValues = (proxies ?? []).map((item) => item.latency).filter((v): v is number => typeof v === 'number');
  const avgLatency = latencyValues.length
    ? `${Math.round(latencyValues.reduce((sum, v) => sum + v, 0) / latencyValues.length)}ms`
    : '--';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proxies & Groups</h1>
          <p className="text-slate-500">Manage outbound nodes and logical selection groups.</p>
        </div>
        <div className="flex items-center gap-2">
           <button
            onClick={() => checkLatencyMutation.mutate()}
            disabled={isLoading || checkLatencyMutation.isPending || totalNodes === 0}
            className="inline-flex items-center px-4 py-2 bg-white text-slate-700 text-sm font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
           >
            <RefreshCw size={14} className={`mr-2 ${checkLatencyMutation.isPending ? 'animate-spin' : ''}`} />
            Check Latency
          </button>
          <button className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:scale-95 transition-all">
            <Plus size={16} className="mr-2" />
            Add Node
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Nodes List">
            <div className="relative overflow-hidden -mx-6 -my-6">
              {isLoading && <LoadingOverlay />}
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-medium">
                    <tr>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Protocol</th>
                      <th className="px-6 py-4">Endpoint</th>
                      <th className="px-6 py-4">Latency</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {proxies?.map(node => (
                      <tr key={node.id} className="hover:bg-slate-50/50 group">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <Server size={14} className="mr-3 text-slate-400" />
                            <span className="font-medium">{node.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono uppercase">{node.protocol}</span>
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                          {node.address}:{node.port}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center text-xs tabular-nums">
                            <Activity size={12} className={`mr-1 ${node.latency && node.latency < 80 ? 'text-emerald-500' : 'text-amber-500'}`} />
                            <span className={node.latency && node.latency < 80 ? 'text-emerald-600 font-semibold' : 'text-slate-600'}>
                              {node.latency ? `${node.latency}ms` : '--'}
                            </span>
                            {node.lastChecked ? (
                              <span className="ml-2 text-[10px] text-slate-400">({node.lastChecked})</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge active={node.enabled} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="p-1.5 text-slate-400 hover:text-slate-900 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Auto Select Groups">
            <div className="space-y-4">
              <div className="p-4 border border-blue-100 bg-blue-50/50 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <Zap size={16} className="text-blue-600 mr-2" />
                    <h3 className="text-sm font-semibold text-blue-900">ProxyGroup</h3>
                  </div>
                  <span className="text-[10px] bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded font-bold">URL-TEST</span>
                </div>
                <div className="flex items-center justify-between text-xs mb-4">
                  <span className="text-blue-700/70">Selected: HK-Azure-01</span>
                  <span className="text-blue-700 font-mono font-bold">45ms</span>
                </div>
                <div className="w-full bg-blue-100 h-1 rounded-full overflow-hidden">
                  <div className="bg-blue-600 h-full w-[100%]"></div>
                </div>
              </div>

              <div className="p-4 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <Shuffle size={16} className="text-slate-600 mr-2" />
                    <h3 className="text-sm font-semibold text-slate-900">Fallback</h3>
                  </div>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">Fallback</span>
                </div>
                <div className="text-xs text-slate-500 mb-4">Primary: HK-Azure-01</div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3].map(i => (
                    <div key={i} className={`flex-1 h-1 rounded-full ${i === 1 ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Outbound Stats">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Total Nodes</span>
                <span className="text-sm font-semibold tabular-nums">{totalNodes}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Active Nodes</span>
                <span className="text-sm font-semibold text-emerald-600 tabular-nums">{activeNodes}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Avg Latency</span>
                <span className="text-sm font-semibold tabular-nums">{avgLatency}</span>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};
