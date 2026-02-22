import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit2, Globe, Plus, Save, Search, Shield, Trash2, X } from 'lucide-react';
import { mockApi } from '../api';
import { LoadingOverlay, SectionCard, StatusBadge } from '../components/Common';
import { ActionType, DomainRule, RuleType } from '../types';

const DomainRuleModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initial?: DomainRule | null;
  fixedGroup: string;
  onSave: (payload: Partial<DomainRule>) => void;
}> = ({ isOpen, onClose, initial, fixedGroup, onSave }) => {
  const isEdit = Boolean(initial);
  const [formData, setFormData] = React.useState<Partial<DomainRule>>({
    type: 'suffix',
    value: '',
    group: '',
    action: 'PROXY',
    enabled: true,
    note: '',
  });

  React.useEffect(() => {
    if (!isOpen) return;
    setFormData(
      initial ?? {
        type: 'suffix',
        value: '',
        group: fixedGroup,
        action: 'PROXY',
        enabled: true,
        note: '',
      },
    );
  }, [isOpen, initial, fixedGroup]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Domain' : 'Add Domain'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Manage one domain rule and assign its group/action.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Type</label>
              <select
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as RuleType })}
              >
                <option value="suffix">Suffix</option>
                <option value="exact">Exact</option>
                <option value="wildcard">Wildcard</option>
                <option value="regex">Regex</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Domain / Pattern</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono"
                placeholder="google.com"
                value={formData.value}
                onChange={(e) => setFormData({ ...formData, value: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Group</label>
              <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-700">
                {fixedGroup}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Action</label>
              <select
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                value={formData.action}
                onChange={(e) => setFormData({ ...formData, action: e.target.value as ActionType })}
              >
                <option value="PROXY">PROXY</option>
                <option value="DIRECT">DIRECT</option>
                <option value="BLOCK">BLOCK</option>
              </select>
            </div>
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
            />
            <div className="w-11 h-6 bg-slate-200 rounded-full peer-checked:bg-blue-600 relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-full" />
            <span className="ml-3 text-sm font-medium text-slate-700">{formData.enabled ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-slate-600 font-semibold text-sm hover:bg-slate-100 rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => onSave(formData)}
            className="px-5 py-2.5 bg-slate-900 text-white font-semibold text-sm rounded-lg hover:bg-slate-800 transition-colors flex items-center"
          >
            <Save size={16} className="mr-2" />
            {isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const DomainsPage: React.FC = () => {
  const params = useParams<{ groupName: string }>();
  const activeGroup = decodeURIComponent(params.groupName ?? '');
  const queryClient = useQueryClient();
  const { data: rules, isLoading } = useQuery({ queryKey: ['domains'], queryFn: mockApi.getDomains });
  const [search, setSearch] = React.useState('');
  const [editingRule, setEditingRule] = React.useState<DomainRule | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);

  if (!activeGroup) {
    return <Navigate to="/domain-groups" replace />;
  }

  const filteredRules = React.useMemo(() => {
    return (rules ?? [])
      .filter((rule) => {
        const term = search.toLowerCase();
        return rule.group === activeGroup && rule.value.toLowerCase().includes(term);
      })
      .sort((a, b) => b.priority - a.priority);
  }, [rules, search, activeGroup]);

  const saveMutation = useMutation({
    mutationFn: mockApi.saveDomainRule,
    onSuccess: (next) => {
      queryClient.setQueryData(['domains'], next);
      queryClient.invalidateQueries({ queryKey: ['routing'] });
      queryClient.invalidateQueries({ queryKey: ['unifiedProfile'] });
      queryClient.invalidateQueries({ queryKey: ['domainGroups'] });
      setIsModalOpen(false);
      setEditingRule(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: mockApi.deleteDomainRule,
    onSuccess: (next) => {
      queryClient.setQueryData(['domains'], next);
      queryClient.invalidateQueries({ queryKey: ['routing'] });
      queryClient.invalidateQueries({ queryKey: ['unifiedProfile'] });
      queryClient.invalidateQueries({ queryKey: ['domainGroups'] });
      setDeleteTarget(null);
    },
  });

  const openAdd = () => {
    setEditingRule(null);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Domains · {activeGroup}</h1>
          <p className="text-slate-500">Manage domain rules in this group.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/domain-groups" className="inline-flex items-center px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <Shield size={14} className="mr-1.5" />
            Back to Groups
          </Link>
          <button
            onClick={openAdd}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
          >
            <Plus size={16} className="mr-2" />
            Add Domain
          </button>
        </div>
      </div>

      <SectionCard
        title="Domain Rules"
        actions={
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={14} />
            <input
              type="text"
              placeholder="Search by domain..."
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white w-full sm:w-72 outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        }
      >
        <div className="relative overflow-x-auto -mx-6">
          {isLoading && <LoadingOverlay />}
          <table className="w-full text-sm text-left border-collapse min-w-[860px]">
            <thead className="bg-slate-50/50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-3 border-y border-slate-100">Type</th>
                <th className="px-6 py-3 border-y border-slate-100">Domain</th>
                <th className="px-6 py-3 border-y border-slate-100 text-center">Action</th>
                <th className="px-6 py-3 border-y border-slate-100 text-center">Status</th>
                <th className="px-6 py-3 border-y border-slate-100 text-right">Priority</th>
                <th className="px-6 py-3 border-y border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <code className="text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded uppercase">{rule.type}</code>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-800">{rule.value}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                      rule.action === 'PROXY' ? 'bg-blue-100 text-blue-700' : rule.action === 'DIRECT' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {rule.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <StatusBadge active={rule.enabled} />
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-slate-500 font-mono">{rule.priority}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingRule(rule);
                          setIsModalOpen(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(rule.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-14 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Globe size={18} />
                      <p>No domain rules.</p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {deleteTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-center text-slate-900 mb-2">Delete Domain Rule?</h3>
            <p className="text-sm text-slate-500 text-center mb-6">This domain rule will be removed from your config.</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget)}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg font-semibold text-sm hover:bg-rose-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <DomainRuleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initial={editingRule}
        fixedGroup={activeGroup}
        onSave={(payload) => saveMutation.mutate({ ...payload, id: editingRule?.id })}
      />
    </div>
  );
};
