import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Edit3, X, Save } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, LoadingOverlay } from '../components/Common';
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
  onDelete?: (id: string) => void;
};

const NodeModal: React.FC<NodeModalProps> = ({ isOpen, onClose, onSave, initial, saving, onDelete }) => {
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
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between gap-3">
          {isEdit && onDelete ? (
            <button
              onClick={() => {
                if (!initial?.id) return;
                onDelete(initial.id);
              }}
              className="px-5 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              Delete Node
            </button>
          ) : <span />}
          <div className="flex items-center gap-3 ml-auto">
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
  const [members, setMembers] = React.useState<string[]>([]);
  const [defaultOutbound, setDefaultOutbound] = React.useState('');
  const [url, setUrl] = React.useState('https://www.gstatic.com/generate_204');
  const [interval, setInterval] = React.useState('3m');
  const [error, setError] = React.useState<string | null>(null);
  const memberOptions = React.useMemo(
    () => Array.from(new Set([...(allNodeNames ?? []), ...(initial?.outbounds ?? [])]).values()).sort(),
    [allNodeNames, initial?.outbounds],
  );

  React.useEffect(() => {
    if (!isOpen) return;
    setName(initial?.name ?? '');
    setType(initial?.type ?? 'manual');
    setMembers(initial?.outbounds ?? []);
    setDefaultOutbound(initial?.defaultOutbound ?? '');
    setUrl(initial?.url ?? 'https://www.gstatic.com/generate_204');
    setInterval(initial?.interval ?? '3m');
    setError(null);
  }, [isOpen, initial]);

  React.useEffect(() => {
    if (type !== 'manual') return;
    if (!defaultOutbound) return;
    if (members.includes(defaultOutbound)) return;
    setDefaultOutbound(members[0] ?? '');
  }, [type, members, defaultOutbound]);

  if (!isOpen) return null;

  const toggleMember = (value: string) => {
    setMembers((current) => {
      if (current.includes(value)) {
        return current.filter((item) => item !== value);
      }
      return [...current, value];
    });
  };

  const submit = () => {
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
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">
              Members (linked with Nodes List)
            </label>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 divide-y divide-slate-100">
              {memberOptions.length === 0 ? (
                <p className="px-3 py-3 text-xs text-slate-400">No nodes available yet.</p>
              ) : (
                memberOptions.map((option) => (
                  <label key={option} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-white">
                    <input
                      type="checkbox"
                      checked={members.includes(option)}
                      onChange={() => toggleMember(option)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                    />
                    <span className="font-mono text-xs text-slate-700">{option}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Selected: {members.length}</p>
          </div>

          {type === 'manual' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Default Outbound</label>
              <select
                value={defaultOutbound}
                onChange={(e) => setDefaultOutbound(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none"
              >
                <option value="">Auto use first member</option>
                {members.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
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
  const [groupTypeFilter] = React.useState<'all' | ProxyGroup['type']>('all');

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
  const visibleAutoGroups = React.useMemo(() => {
    const all = groups ?? [];
    return all.filter((group) => {
      const matchType = groupTypeFilter === 'all' || group.type === groupTypeFilter;
      if (!matchType) return false;
      return true;
    });
  }, [groups, groupTypeFilter]);
  const visibleNodes = React.useMemo(() => proxies ?? [], [proxies]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proxies & Groups</h1>
          <p className="text-slate-500">Manage outbound nodes and logical selection groups.</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-6">
          <SectionCard title="Proxy Group">
	            <div className="space-y-3">
	              <div />

                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                {visibleAutoGroups.length === 0 ? (
                  <p className="text-sm text-slate-500">No proxy group</p>
                ) : null}
                  {visibleAutoGroups.map((group) => {
                    return (
                      <div
                        key={group.id}
                        onClick={() => {
                          setEditingGroup(group);
                          setGroupModalOpen(true);
                        }}
                        className="min-h-[92px] pl-3 pt-3.5 pr-2 pb-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/80 hover:border-slate-300 hover:shadow-sm transition-all flex flex-col cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-start min-w-0">
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-slate-900 truncate leading-tight">{group.name}</h3>
                            </div>
                        </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingGroup(group);
                                setGroupModalOpen(true);
                              }}
                              className="p-0.5 text-slate-400 hover:text-slate-900 rounded"
                              aria-label={`Edit group ${group.name}`}
                              type="button"
                            >
                              <Edit3 size={12} />
                            </button>
                          </div>
                        <div className="mt-auto text-xs text-slate-500 leading-tight">
                          {group.defaultOutbound ? <div>Default: {group.defaultOutbound}</div> : null}
                          {group.url ? <div className="font-mono truncate">{group.url}</div> : null}
                        </div>
                      </div>
                    );
                  })}
                <button
                  type="button"
                  onClick={() => {
                    setEditingGroup(null);
                    setGroupModalOpen(true);
                  }}
                  className="min-h-[92px] pl-3 pt-3.5 pr-2 pb-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100/80 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-all"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Nodes List">
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  onClick={() => checkLatencyMutation.mutate()}
                  disabled={isLoading || checkLatencyMutation.isPending || totalNodes === 0}
                  className={`inline-flex items-center px-4 py-2 bg-white text-blue-600 text-sm font-semibold rounded-lg border ${checkLatencyMutation.isPending ? 'border-blue-500/70 bg-blue-50 motion-safe:animate-pulse' : 'border-blue-500'} hover:bg-blue-50 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <RefreshCw size={14} className={`mr-2 ${checkLatencyMutation.isPending ? 'animate-spin' : ''}`} />
                  Check Latency
                </button>
              </div>
              <div className="relative">
                {isLoading && <LoadingOverlay />}
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {visibleNodes.length === 0 ? (
                    <p className="text-sm text-slate-500 px-2 py-10 text-center">No nodes</p>
                  ) : null}
                  {visibleNodes.map((node) => {
                    return (
                      <div
                            key={node.id}
                            onClick={() => {
                              setEditingNode(node);
                              setNodeModalOpen(true);
                            }}
                            className="min-h-[92px] pl-3 pt-3.5 pr-2 pb-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/80 hover:border-slate-300 hover:shadow-sm transition-all flex flex-col cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-start min-w-0">
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-slate-900 truncate leading-tight">{node.name}</h3>
                            </div>
                          </div>
                            <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingNode(node);
                              setNodeModalOpen(true);
                            }}
                              className="p-0.5 text-slate-400 hover:text-slate-900 rounded"
                              aria-label={`Edit node ${node.name}`}
                              type="button"
                            >
                            <Edit3 size={12} />
                          </button>
                        </div>
                        <div className="mt-auto flex items-center justify-between gap-2">
                          <span
                            className={`text-xs leading-none ${
                              node.latencyStatus === 'failed'
                                ? 'text-rose-500'
                                : typeof node.latency === 'number'
                                  ? 'text-emerald-500'
                                  : 'text-slate-500'
                            }`}
                          >
                            {node.latencyStatus === 'failed' ? 'failed' : typeof node.latency === 'number' ? `${node.latency}ms` : '--'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNode(null);
                      setNodeModalOpen(true);
                    }}
                    className="min-h-[92px] pl-3 pt-3.5 pr-2 pb-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100/80 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-all"
                  >
                    <Plus size={20} />
                  </button>
                </div>
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
        onDelete={(id) => {
          if (window.confirm(`Delete node ${editingNode?.name ?? ''}?`)) {
            deleteMutation.mutate(id);
            setNodeModalOpen(false);
            setEditingNode(null);
          }
        }}
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
