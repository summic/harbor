import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit3, Network, X } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, LoadingOverlay } from '../components/Common';
import { DomainRule, ProxyGroup, RoutingRule } from '../types';

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
  const { data: domains = [] } = useQuery({ queryKey: ['domains'], queryFn: mockApi.getDomains });
  const { data: proxyGroups = [] } = useQuery({ queryKey: ['proxyGroups'], queryFn: mockApi.getProxyGroups });
  const [isPolicyModalOpen, setIsPolicyModalOpen] = React.useState(false);
  const [editingPolicy, setEditingPolicy] = React.useState<RoutingRule | null>(null);

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
  const orderedRules = React.useMemo(
    () => (rules ? [...rules].sort((a, b) => a.priority - b.priority) : []),
    [rules],
  );
  const domainGroups = React.useMemo(() => {
    const grouped = new Map<string, DomainRule[]>();
    for (const rule of domains) {
      const key = rule.group || 'default';
      const list = grouped.get(key) ?? [];
      list.push(rule);
      grouped.set(key, list);
    }
    return [...grouped.entries()].map(([name, list]) => ({
      id: `domain:${name}`,
      name,
      count: list.length,
      actions: Array.from(new Set(list.map((item) => item.action))).join(', ').toLowerCase(),
    }));
  }, [domains]);

  const policyNodes = React.useMemo(
    () =>
      orderedRules.map((rule) => ({
        id: `policy:${rule.id}`,
        rule,
      })),
    [orderedRules],
  );

  const proxyNodes = React.useMemo(
    () =>
      (proxyGroups as ProxyGroup[]).map((group) => ({
        id: `proxy:${group.name}`,
        name: group.name,
        type: group.type,
        members: group.outbounds.length,
      })),
    [proxyGroups],
  );

  const DOMAIN_X = 24;
  const POLICY_X = 390;
  const PROXY_X = 760;
  const DOMAIN_Y_START = 40;
  const POLICY_Y_START = 40;
  const PROXY_Y_START = 40;
  const DOMAIN_GAP = 96;
  const POLICY_GAP = 110;
  const PROXY_GAP = 96;

  const domainIndex = React.useMemo(
    () =>
      new Map(
        domainGroups.map((item, index) => [item.id, index] as const),
      ),
    [domainGroups],
  );
  const policyIndex = React.useMemo(
    () =>
      new Map(
        policyNodes.map((item, index) => [item.id, index] as const),
      ),
    [policyNodes],
  );
  const proxyIndex = React.useMemo(
    () =>
      new Map(
        proxyNodes.map((item, index) => [item.id, index] as const),
      ),
    [proxyNodes],
  );

  const parseMatchValues = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const isPolicyMatchDomainGroup = (rule: RoutingRule, groupName: string): boolean => {
    if (rule.matchType !== 'rule_set' && rule.matchType !== 'domain') return false;
    const list = parseMatchValues(rule.matchExpr);
    return list.includes(groupName);
  };

  const lineSegments = React.useMemo(() => {
    const lines: Array<{ id: string; x1: number; y1: number; x2: number; y2: number; color: string }> = [];
    const domainCenter = (id: string) => {
      const index = domainIndex.get(id);
      if (index === undefined) return null;
      return { x: DOMAIN_X + 240, y: DOMAIN_Y_START + index * DOMAIN_GAP + 34 };
    };
    const policyCenter = (id: string) => {
      const index = policyIndex.get(id);
      if (index === undefined) return null;
      return { x: POLICY_X + 280, y: POLICY_Y_START + index * POLICY_GAP + 44 };
    };
    const proxyCenter = (id: string) => {
      const index = proxyIndex.get(id);
      if (index === undefined) return null;
      return { x: PROXY_X, y: PROXY_Y_START + index * PROXY_GAP + 34 };
    };

    for (const domain of domainGroups) {
      for (const policy of policyNodes) {
        if (!isPolicyMatchDomainGroup(policy.rule, domain.name)) continue;
        const from = domainCenter(domain.id);
        const to = policyCenter(policy.id);
        if (!from || !to) continue;
        lines.push({
          id: `${domain.id}->${policy.id}`,
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          color: '#7dd3fc',
        });
      }
    }

    for (const policy of policyNodes) {
      for (const proxy of proxyNodes) {
        if (policy.rule.outbound !== proxy.name) continue;
        const from = policyCenter(policy.id);
        const to = proxyCenter(proxy.id);
        if (!from || !to) continue;
        lines.push({
          id: `${policy.id}->${proxy.id}`,
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          color: '#34d399',
        });
      }
    }
    return lines;
  }, [domainGroups, policyNodes, proxyNodes, domainIndex, policyIndex, proxyIndex]);

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

      <SectionCard title="Routing Graph" description="Visual routing map with inline editable policies.">
        <div
          className="relative h-[760px] overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_12%_18%,rgba(56,189,248,0.14),transparent_32%),radial-gradient(circle_at_88%_82%,rgba(16,185,129,0.10),transparent_30%),linear-gradient(180deg,#f8fafc,#eef2ff)]"
        >
          {isLoading ? <LoadingOverlay /> : null}
          <svg className="absolute inset-0 h-full w-full pointer-events-none">
            {lineSegments.map((line) => (
              <line
                key={line.id}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={line.color}
                strokeWidth={2}
                strokeOpacity={0.65}
              />
            ))}
          </svg>

          <div className="absolute left-6 top-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700/70">
            Domain Groups
          </div>
          <div className="absolute left-[390px] top-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700/70">
            Routing Policies
          </div>
          <div className="absolute left-[760px] top-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700/70">
            Proxy Groups
          </div>

          {domainGroups.map((group) => {
            const index = domainIndex.get(group.id);
            if (index === undefined) return null;
            return (
              <div
                key={group.id}
                className="absolute w-[240px] rounded-2xl border border-sky-200 bg-white/90 p-4 shadow-[0_10px_24px_rgba(14,116,144,0.12)]"
                style={{ left: DOMAIN_X, top: DOMAIN_Y_START + index * DOMAIN_GAP }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">{group.name}</h3>
                  <span className="text-[10px] rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-700">
                    {group.count} rules
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">actions: {group.actions || 'mixed'}</p>
              </div>
            );
          })}

          {policyNodes.map((policy, idx) => {
            const index = policyIndex.get(policy.id);
            if (index === undefined) return null;
            const rule = policy.rule;
            return (
              <div
                key={policy.id}
                className="absolute w-[280px] rounded-2xl border border-indigo-200 bg-white/92 p-4 shadow-[0_12px_28px_rgba(67,56,202,0.14)]"
                style={{ left: POLICY_X, top: POLICY_Y_START + index * POLICY_GAP }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-indigo-700">#{idx + 1} Policy</div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(rule)}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (!window.confirm(`Delete routing policy ${rule.matchExpr}?`)) return;
                        deleteMutation.mutate(rule.id);
                      }}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900 break-all">{rule.matchExpr || '(empty)'}</div>
                <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                  {rule.matchType}
                </div>
                <div className="mt-2 flex items-center text-xs text-slate-500">
                  <Network size={12} className="mr-1" />
                  outbound: <span className="ml-1 font-semibold text-blue-600">{rule.outbound}</span>
                </div>
              </div>
            );
          })}

          {proxyNodes.map((proxy) => {
            const index = proxyIndex.get(proxy.id);
            if (index === undefined) return null;
            return (
              <div
                key={proxy.id}
                className="absolute w-[220px] rounded-2xl border border-emerald-200 bg-white/92 p-4 shadow-[0_12px_28px_rgba(16,185,129,0.14)]"
                style={{ left: PROXY_X, top: PROXY_Y_START + index * PROXY_GAP }}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">{proxy.name}</h3>
                  <span className="text-[10px] rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                    {proxy.type}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">members: {proxy.members}</p>
              </div>
            );
          })}
        </div>
      </SectionCard>

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
