
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
// Added Shuffle to imports
import { Plus, RefreshCw, Zap, Server, Activity, Shuffle, Edit3, Trash2 } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, StatusBadge, LoadingOverlay } from '../components/Common';
import { ProtocolType, ProxyNode } from '../types';

export const ProxiesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: proxies, isLoading } = useQuery({ queryKey: ['proxies'], queryFn: mockApi.getProxies });
  const { data: groups } = useQuery({ queryKey: ['proxyGroups'], queryFn: mockApi.getProxyGroups });
  const refreshLinked = () => {
    queryClient.invalidateQueries({ queryKey: ['proxies'] });
    queryClient.invalidateQueries({ queryKey: ['proxyGroups'] });
    queryClient.invalidateQueries({ queryKey: ['unifiedProfile'] });
  };
  const saveMutation = useMutation({
    mutationFn: mockApi.saveProxyNode,
    onSuccess: () => refreshLinked(),
  });
  const deleteMutation = useMutation({
    mutationFn: mockApi.deleteProxyNode,
    onSuccess: () => refreshLinked(),
  });
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

  const promptProxyPayload = (initial?: ProxyNode): {
    id?: string;
    name: string;
    protocol: ProtocolType;
    address: string;
    port: number;
  } | null => {
    const name = (window.prompt('Node name/tag', initial?.name || '') || '').trim();
    if (!name) return null;
    const protocol = (window.prompt(
      'Protocol: Shadowsocks / VLESS / VMess / Trojan / Hysteria2 / TUIC / WireGuard',
      initial?.protocol || 'Shadowsocks',
    ) || '').trim() as ProtocolType;
    if (!protocol) return null;
    const address = (window.prompt('Server address', initial?.address || '') || '').trim();
    if (!address) return null;
    const portRaw = window.prompt('Server port', String(initial?.port || 443)) || '';
    const port = Number(portRaw);
    if (!Number.isFinite(port) || port <= 0) return null;
    return { id: initial?.id, name, protocol, address, port };
  };

  const handleAdd = () => {
    const payload = promptProxyPayload();
    if (!payload) return;
    saveMutation.mutate(payload);
  };

  const handleEdit = (node: ProxyNode) => {
    const payload = promptProxyPayload(node);
    if (!payload) return;
    saveMutation.mutate(payload);
  };

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
          <button
            onClick={handleAdd}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:scale-95 transition-all"
          >
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
                          <div className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEdit(node)}
                              className="p-1.5 text-slate-400 hover:text-slate-900 rounded"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => {
                                if (!window.confirm(`Delete node ${node.name}?`)) return;
                                deleteMutation.mutate(node.id);
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
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
              {(groups ?? []).map((group) => (
                <div key={group.id} className="p-4 border border-slate-200 rounded-xl hover:border-slate-300 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center">
                      {group.type === 'urltest' ? (
                        <Zap size={16} className="text-blue-600 mr-2" />
                      ) : (
                        <Shuffle size={16} className="text-slate-600 mr-2" />
                      )}
                      <h3 className="text-sm font-semibold text-slate-900">{group.name}</h3>
                    </div>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">
                      {group.type}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mb-2">
                    {group.outbounds.length > 0 ? `Members: ${group.outbounds.join(', ')}` : 'No members'}
                  </div>
                  {group.defaultOutbound ? (
                    <div className="text-xs text-slate-500 mb-2">Default: {group.defaultOutbound}</div>
                  ) : null}
                  {group.url ? (
                    <div className="text-[10px] text-slate-400 font-mono truncate">{group.url}</div>
                  ) : null}
                </div>
              ))}
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
