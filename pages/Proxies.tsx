import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  RefreshCw,
  Zap,
  Server,
  Activity,
  Shuffle,
  Edit3,
  Trash2,
  X,
  Save,
} from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, StatusBadge, LoadingOverlay } from '../components/Common';
import { ProtocolType, ProxyGroup, ProxyNode } from '../types';

type NodeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    name: string;
    protocol: ProtocolType;
    address: string;
    port: number;
  }) => void;
  initial?: ProxyNode | null;
  saving?: boolean;
};

const NodeModal: React.FC<NodeModalProps> = ({ isOpen, onClose, onSave, initial, saving }) => {
  const isEdit = !!initial;
  const [name, setName] = React.useState('');
  const [protocol, setProtocol] = React.useState<ProtocolType>('Shadowsocks');
  const [address, setAddress] = React.useState('');
  const [port, setPort] = React.useState(443);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setName(initial?.name ?? '');
    setProtocol(initial?.protocol ?? 'Shadowsocks');
    setAddress(initial?.address ?? '');
    setPort(initial?.port ?? 443);
    setError(null);
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const submit = () => {
    if (!name.trim() || !address.trim() || !Number.isFinite(port) || port <= 0) {
      setError('Name, address and valid port are required.');
      return;
    }
    onSave({
      id: initial?.id,
      name: name.trim(),
      protocol,
      address: address.trim(),
      port: Number(port),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Proxy Node' : 'New Proxy Node'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Configure outbound endpoint and protocol.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                placeholder="e.g. HK-01"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Protocol</label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as ProtocolType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
              >
                {['Shadowsocks', 'VLESS', 'VMess', 'Trojan', 'Hysteria2', 'TUIC', 'WireGuard'].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Server Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                placeholder="1.2.3.4 or host.example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Port</label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                min={1}
              />
            </div>
          </div>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-slate-600 font-semibold text-sm hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!!saving}
            className="px-5 py-2.5 bg-slate-900 text-white font-semibold text-sm rounded-lg hover:bg-slate-800 transition-colors flex items-center shadow-lg shadow-slate-900/10 disabled:opacity-60"
          >
            <Save size={16} className="mr-2" />
            {saving ? 'Saving...' : isEdit ? 'Save Node' : 'Create Node'}
          </button>
        </div>
      </div>
    </div>
  );
};

type GroupModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    name: string;
    type: ProxyGroup['type'];
    outbounds: string[];
    defaultOutbound?: string;
    url?: string;
    interval?: string;
  }) => void;
  initial?: ProxyGroup | null;
  allNodeNames: string[];
  saving?: boolean;
};

const GroupModal: React.FC<GroupModalProps> = ({ isOpen, onClose, onSave, initial, allNodeNames, saving }) => {
  const isEdit = !!initial;
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState<ProxyGroup['type']>('manual');
  const [membersText, setMembersText] = React.useState('');
  const [defaultOutbound, setDefaultOutbound] = React.useState('');
  const [url, setUrl] = React.useState('https://www.gstatic.com/generate_204');
  const [interval, setInterval] = React.useState('3m');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setName(initial?.name ?? '');
    setType(initial?.type ?? 'manual');
    setMembersText((initial?.outbounds ?? []).join('\n'));
    setDefaultOutbound(initial?.defaultOutbound ?? '');
    setUrl(initial?.url ?? 'https://www.gstatic.com/generate_204');
    setInterval(initial?.interval ?? '3m');
    setError(null);
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const submit = () => {
    const members = membersText
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!name.trim()) {
      setError('Group name is required.');
      return;
    }
    if (members.length === 0) {
      setError('At least one member outbound is required.');
      return;
    }
    onSave({
      id: initial?.id,
      name: name.trim(),
      type,
      outbounds: members,
      defaultOutbound: type === 'manual' ? defaultOutbound.trim() || members[0] : undefined,
      url: type === 'manual' ? undefined : url.trim(),
      interval: type === 'manual' ? undefined : interval.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Proxy Group' : 'New Proxy Group'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Configure selector/urltest/fallback behavior.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Group Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                placeholder="e.g. AUTO"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ProxyGroup['type'])}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
              >
                <option value="manual">Selector (manual)</option>
                <option value="urltest">URLTest</option>
                <option value="fallback">Fallback</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Members (one per line)</label>
            <textarea
              value={membersText}
              onChange={(e) => setMembersText(e.target.value)}
              className="w-full h-28 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none resize-y"
              placeholder={allNodeNames.join('\n')}
            />
          </div>

          {type === 'manual' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Default Outbound</label>
              <input
                type="text"
                value={defaultOutbound}
                onChange={(e) => setDefaultOutbound(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                placeholder="Default member name"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Probe URL</label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Interval</label>
                <input
                  type="text"
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
                  placeholder="e.g. 3m"
                />
              </div>
            </div>
          )}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-slate-600 font-semibold text-sm hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!!saving}
            className="px-5 py-2.5 bg-slate-900 text-white font-semibold text-sm rounded-lg hover:bg-slate-800 transition-colors flex items-center shadow-lg shadow-slate-900/10 disabled:opacity-60"
          >
            <Save size={16} className="mr-2" />
            {saving ? 'Saving...' : isEdit ? 'Save Group' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ProxiesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: proxies, isLoading } = useQuery({ queryKey: ['proxies'], queryFn: mockApi.getProxies });
  const { data: groups } = useQuery({ queryKey: ['proxyGroups'], queryFn: mockApi.getProxyGroups });
  const [nodeModalOpen, setNodeModalOpen] = React.useState(false);
  const [groupModalOpen, setGroupModalOpen] = React.useState(false);
  const [editingNode, setEditingNode] = React.useState<ProxyNode | null>(null);
  const [editingGroup, setEditingGroup] = React.useState<ProxyGroup | null>(null);

  const refreshLinked = () => {
    queryClient.invalidateQueries({ queryKey: ['proxies'] });
    queryClient.invalidateQueries({ queryKey: ['proxyGroups'] });
    queryClient.invalidateQueries({ queryKey: ['unifiedProfile'] });
  };
  const saveNodeMutation = useMutation({
    mutationFn: mockApi.saveProxyNode,
    onSuccess: () => {
      refreshLinked();
      setNodeModalOpen(false);
      setEditingNode(null);
    },
  });
  const saveGroupMutation = useMutation({
    mutationFn: mockApi.saveProxyGroup,
    onSuccess: () => {
      refreshLinked();
      setGroupModalOpen(false);
      setEditingGroup(null);
    },
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
            onClick={() => {
              setEditingGroup(null);
              setGroupModalOpen(true);
            }}
            className="inline-flex items-center px-4 py-2 bg-white text-slate-700 text-sm font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 active:scale-95 transition-all"
          >
            <Plus size={16} className="mr-2" />
            Add Group
          </button>
          <button
            onClick={() => {
              setEditingNode(null);
              setNodeModalOpen(true);
            }}
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
                    {proxies?.map((node) => (
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
                              onClick={() => {
                                setEditingNode(node);
                                setNodeModalOpen(true);
                              }}
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
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold uppercase">
                        {group.type}
                      </span>
                      <button
                        onClick={() => {
                          setEditingGroup(group);
                          setGroupModalOpen(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-slate-900 rounded"
                      >
                        <Edit3 size={14} />
                      </button>
                    </div>
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

      <NodeModal
        isOpen={nodeModalOpen}
        onClose={() => {
          setNodeModalOpen(false);
          setEditingNode(null);
        }}
        initial={editingNode}
        saving={saveNodeMutation.isPending}
        onSave={(payload) => saveNodeMutation.mutate(payload)}
      />

      <GroupModal
        isOpen={groupModalOpen}
        onClose={() => {
          setGroupModalOpen(false);
          setEditingGroup(null);
        }}
        initial={editingGroup}
        allNodeNames={(proxies ?? []).map((item) => item.name)}
        saving={saveGroupMutation.isPending}
        onSave={(payload) => saveGroupMutation.mutate(payload)}
      />
    </div>
  );
};
