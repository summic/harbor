import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, MoveUp, MoveDown, Trash2, Edit3, Network, Target, Shuffle, Search, Server, Route, X } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, StatusBadge, LoadingOverlay } from '../components/Common';
import { RoutingRule } from '../types';

const protocolOptions = ['tcp', 'udp', 'dns', 'icmp', 'stun', 'dtls'];
const matchTypeOptions: RoutingRule['matchType'][] = [
  'rule_set',
  'domain',
  'ip',
  'geosite',
  'geoip',
  'protocol',
  'port',
  'process',
  'action',
  'ip_private',
];

const RoutingPolicyModal: React.FC<{
  isOpen: boolean;
  initial?: RoutingRule | null;
  onClose: () => void;
  onSave: (payload: {
    id?: string;
    matchType: RoutingRule['matchType'];
    matchExpr: string;
    outbound: string;
  }) => void;
  saving?: boolean;
}> = ({ isOpen, initial, onClose, onSave, saving }) => {
  const isEdit = Boolean(initial);
  const [matchType, setMatchType] = React.useState<RoutingRule['matchType']>('rule_set');
  const [matchExpr, setMatchExpr] = React.useState('');
  const [outbound, setOutbound] = React.useState('proxy');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setMatchType(initial?.matchType ?? 'rule_set');
    setMatchExpr(initial?.matchExpr ?? '');
    setOutbound(initial?.outbound ?? 'proxy');
    setError(null);
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const needsExpr = matchType !== 'ip_private';

  const handleSubmit = () => {
    const nextExpr = matchExpr.trim();
    const nextOutbound = outbound.trim();
    if (needsExpr && !nextExpr) {
      setError('Match expression is required for this match type.');
      return;
    }
    if (!nextOutbound) {
      setError('Outbound is required.');
      return;
    }
    onSave({
      id: initial?.id,
      matchType,
      matchExpr: nextExpr,
      outbound: nextOutbound,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Routing Policy' : 'Add Routing Policy'}</h2>
            <p className="text-xs text-slate-500 mt-1">Configure route match and outbound behavior.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Match Type</label>
            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as RoutingRule['matchType'])}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
            >
              {matchTypeOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Match Expression</label>
            <input
              value={matchExpr}
              onChange={(e) => setMatchExpr(e.target.value)}
              disabled={!needsExpr}
              placeholder={
                needsExpr
                  ? 'e.g. geosite-cn or connect-api-prod.kuainiu.chat'
                  : 'Not required for ip_private'
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:bg-slate-50 disabled:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Outbound / Action</label>
            <input
              value={outbound}
              onChange={(e) => setOutbound(e.target.value)}
              placeholder="proxy / direct / block / sniff ..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>

          {error ? (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">
              {error}
            </div>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Policy'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const RoutingPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: rules, isLoading } = useQuery({ queryKey: ['routing'], queryFn: mockApi.getRouting });
  const [target, setTarget] = React.useState('connect-api-prod.kuainiu.chat');
  const [protocol, setProtocol] = React.useState('tcp');
  const [port, setPort] = React.useState<string>('443');
  const [isPolicyModalOpen, setIsPolicyModalOpen] = React.useState(false);
  const [editingPolicy, setEditingPolicy] = React.useState<RoutingRule | null>(null);

  const simulateMutation = useMutation({
    mutationFn: mockApi.simulateTraffic,
  });
  const saveMutation = useMutation({
    mutationFn: mockApi.saveRoutingRule,
    onSuccess: (next) => {
      queryClient.setQueryData(['routing'], next);
      queryClient.invalidateQueries({ queryKey: ['unifiedProfile'] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: mockApi.deleteRoutingRule,
    onSuccess: (next) => {
      queryClient.setQueryData(['routing'], next);
      queryClient.invalidateQueries({ queryKey: ['unifiedProfile'] });
    },
  });
  const moveMutation = useMutation({
    mutationFn: mockApi.moveRoutingRule,
    onSuccess: (next) => {
      queryClient.setQueryData(['routing'], next);
      queryClient.invalidateQueries({ queryKey: ['unifiedProfile'] });
    },
  });

  const orderedRules = React.useMemo(
    () => (rules ? [...rules].sort((a, b) => a.priority - b.priority) : []),
    [rules],
  );

  const handleAdd = () => {
    setEditingPolicy(null);
    setIsPolicyModalOpen(true);
  };

  const handleEdit = (rule: RoutingRule) => {
    setEditingPolicy(rule);
    setIsPolicyModalOpen(true);
  };

  const handleSavePolicy = (payload: {
    id?: string;
    matchType: RoutingRule['matchType'];
    matchExpr: string;
    outbound: string;
  }) => {
    saveMutation.mutate(payload);
    setIsPolicyModalOpen(false);
    setEditingPolicy(null);
  };

  const handleSimulate = () => {
    simulateMutation.mutate({
      target: target.trim(),
      protocol,
      port: port.trim() ? Number(port) : undefined,
    });
  };

  const result = simulateMutation.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Routing Policies</h1>
          <p className="text-slate-500">Define how traffic flows through different outbounds.</p>
        </div>
        <button
          onClick={handleAdd}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:scale-95 transition-all"
        >
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
                {orderedRules.map((rule, idx) => (
                  <div key={rule.id} className="flex items-center p-3 bg-white border border-slate-100 rounded-lg hover:border-blue-200 hover:shadow-sm transition-all group">
                    <div className="flex flex-col items-center mr-4 text-slate-300">
                      <button
                        onClick={() => moveMutation.mutate({ id: rule.id, direction: 'up' })}
                        disabled={idx === 0 || moveMutation.isPending}
                        className="hover:text-blue-500 p-0.5 disabled:opacity-40"
                      >
                        <MoveUp size={14} />
                      </button>
                      <span className="text-[10px] font-bold tabular-nums my-0.5">{idx + 1}</span>
                      <button
                        onClick={() => moveMutation.mutate({ id: rule.id, direction: 'down' })}
                        disabled={idx === orderedRules.length - 1 || moveMutation.isPending}
                        className="hover:text-blue-500 p-0.5 disabled:opacity-40"
                      >
                        <MoveDown size={14} />
                      </button>
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
                        <button
                          onClick={() => handleEdit(rule)}
                          className="p-2 text-slate-400 hover:text-blue-600"
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          onClick={() => {
                            if (!window.confirm(`Delete routing policy ${rule.matchExpr}?`)) return;
                            deleteMutation.mutate(rule.id);
                          }}
                          className="p-2 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Traffic Simulator" description="Run real route simulation against current profile JSON.">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Target Domain / IP / URL</label>
                <input
                  type="text"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="e.g. connect-api-prod.kuainiu.chat"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Protocol</label>
                  <select
                    value={protocol}
                    onChange={(e) => setProtocol(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                  >
                    {protocolOptions.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Port</label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="443"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
              </div>

              <button
                onClick={handleSimulate}
                disabled={!target.trim() || simulateMutation.isPending}
                className="w-full py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {simulateMutation.isPending ? 'Simulating...' : 'Run Simulation'}
              </button>

              {simulateMutation.error ? (
                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">
                  {simulateMutation.error instanceof Error ? simulateMutation.error.message : 'Simulation failed'}
                </div>
              ) : null}

              {result ? (
                <div className="relative mt-4">
                  <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200"></div>
                  <div className="space-y-6 relative">
                    <div className="flex items-start">
                      <div className="z-10 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center border-2 border-white shadow-sm">
                        <Target size={12} className="text-blue-600" />
                      </div>
                      <div className="ml-4 pt-0.5">
                        <p className="text-xs font-bold uppercase text-slate-400">Input</p>
                        <p className="text-sm font-medium">{result.input.target}</p>
                        <p className="text-xs text-slate-500">protocol: {result.input.protocol}{result.input.port ? `:${result.input.port}` : ''}</p>
                      </div>
                    </div>

                    <div className="flex items-start">
                      <div className="z-10 w-6 h-6 rounded-full bg-cyan-100 flex items-center justify-center border-2 border-white shadow-sm">
                        <Search size={12} className="text-cyan-700" />
                      </div>
                      <div className="ml-4 pt-0.5">
                        <p className="text-xs font-bold uppercase text-slate-400">DNS Decision</p>
                        <p className="text-sm font-medium">server: {result.dns.selectedServer}</p>
                        {result.dns.matchedRule ? (
                          <p className="text-xs text-slate-500">matched: {result.dns.matchedRule}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-start">
                      <div className="z-10 w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center border-2 border-white shadow-sm">
                        <Server size={12} className="text-emerald-700" />
                      </div>
                      <div className="ml-4 pt-0.5 w-full">
                        <p className="text-xs font-bold uppercase text-slate-400">Matched Rules</p>
                        {result.route.matchedRules.length === 0 ? (
                          <p className="text-sm text-slate-500">No explicit rule matched.</p>
                        ) : (
                          <div className="space-y-2">
                            {result.route.matchedRules.map((item) => (
                              <div key={`${item.index}-${item.summary}`} className="text-xs border border-slate-200 rounded-md p-2 bg-slate-50">
                                <p className="font-semibold text-slate-700">#{item.index} {item.outbound ? `-> ${item.outbound}` : `action: ${item.action}`}</p>
                                <p className="text-slate-500 break-all">{item.summary}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start">
                      <div className="z-10 w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center border-2 border-white shadow-sm">
                        <Route size={12} className="text-amber-700" />
                      </div>
                      <div className="ml-4 pt-0.5">
                        <p className="text-xs font-bold uppercase text-slate-400">Final Outbound</p>
                        <p className="text-sm font-bold text-blue-700 uppercase">{result.route.finalOutbound}</p>
                        {result.route.usedFinalFallback ? (
                          <p className="text-xs text-slate-500">fallback: route.final</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </div>

      <RoutingPolicyModal
        isOpen={isPolicyModalOpen}
        initial={editingPolicy}
        onClose={() => {
          if (saveMutation.isPending) return;
          setIsPolicyModalOpen(false);
          setEditingPolicy(null);
        }}
        onSave={handleSavePolicy}
        saving={saveMutation.isPending}
      />
    </div>
  );
};
