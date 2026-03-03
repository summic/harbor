import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit3, X } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard } from '../components/Common';
import { RoutingRule } from '../types';

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

const matchTypeLabelMap: Record<RoutingRule['matchType'], string> = {
  rule_set: 'Rule Set',
  domain: 'Domain',
  ip: 'IP/CIDR',
  geosite: 'GeoSite',
  geoip: 'GeoIP',
  protocol: 'Protocol',
  port: 'Port',
  process: 'Process',
  action: 'Action',
  ip_private: 'IP Private',
};

const matchExprPlaceholder: Record<RoutingRule['matchType'], string> = {
  rule_set: 'e.g. tv or site-direct',
  domain: 'e.g. geosite-cn or example.com',
  ip: 'e.g. 10.0.0.0/8, 192.168.1.1, 2001:db8::/32',
  geosite: 'e.g. geosite-cn',
  geoip: 'e.g. cn',
  protocol: 'e.g. dns, udp, tcp',
  port: 'e.g. 443, 80',
  process: 'e.g. Safari, com.example.app',
  action: 'e.g. sniff, hijack-dns',
  ip_private: 'Not required for ip_private',
};

const isValidIpLike = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;

  const isV4 = (ip: string): boolean => {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    return parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) return false;
      const num = Number(part);
      return Number.isInteger(num) && num >= 0 && num <= 255;
    });
  };

  const isV6 = (ip: string): boolean => /^[0-9a-fA-F:]+$/.test(ip) && ip.includes(':');

  const [ipText, bitsText] = trimmed.split('/');
  if (!isV4(ipText) && !isV6(ipText)) return false;

  if (bitsText !== undefined) {
    if (!/^\d+$/.test(bitsText)) return false;
    const bits = Number(bitsText);
    const maxBits = isV4(ipText) ? 32 : 128;
    return bits >= 0 && bits <= maxBits;
  }

  return true;
};

const validateIpExpr = (expr: string): string | null => {
  const values = expr
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length === 0) {
    return 'IP/CIDR value is required.';
  }
  for (const value of values) {
    if (!isValidIpLike(value)) {
      return `Invalid IP/CIDR value: ${value}.`;
    }
  }
  return null;
};

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
    if (matchType === 'ip') {
      const message = validateIpExpr(nextExpr);
      if (message) {
        setError(message);
        return;
      }
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
                  {matchTypeLabelMap[item]}
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
                  ? matchExprPlaceholder[matchType]
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
  const { data: rules } = useQuery({ queryKey: ['routing'], queryFn: mockApi.getRouting });
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

  const policyNodes = React.useMemo(
    () =>
      orderedRules.map((rule) => ({
        id: `policy:${rule.id}`,
        rule,
      })),
    [orderedRules],
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

  const policySubtitle = (rule: RoutingRule) => {
    if (rule.matchType === 'rule_set') return 'Manual Selection Group';
    if (rule.matchType === 'domain') return 'Domain Match Group';
    if (rule.matchType === 'ip') return 'IP Match Group';
    if (rule.matchType === 'geosite') return 'GeoSite Group';
    return `Policy · ${matchTypeLabelMap[rule.matchType] ?? rule.matchType}`;
  };

  const policyTitle = (rule: RoutingRule) => {
    const first = rule.matchExpr
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)[0];
    return first || '(empty policy)';
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

      <div className="grid grid-cols-1 gap-6">
        <SectionCard title="Routing Policies" description="Editable policy cards in execution order.">
          <div className="rounded-2xl bg-slate-100 p-4">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700/80">
              Policy Group
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {policyNodes.map((policy) => {
                const rule = policy.rule;
                return (
                  <div key={policy.id} className="group rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-400">{policySubtitle(rule)}</p>
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
                    <div className="mt-1 text-2xl leading-none">🛡️</div>
                    <h4 className="mt-2 text-xl font-bold text-slate-800 break-all">{policyTitle(rule)}</h4>
                    <div className="mt-6 text-sm font-semibold text-slate-400 uppercase">
                      {rule.outbound}
                    </div>
                  </div>
                );
              })}
              <button
                onClick={handleAdd}
                className="flex min-h-[188px] items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white/55 text-slate-400 hover:border-sky-300 hover:text-sky-600"
              >
                <Plus size={28} />
              </button>
            </div>
            {policyNodes.length === 0 ? <p className="mt-4 text-xs text-slate-400">No routing policies.</p> : null}
          </div>
        </SectionCard>
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
