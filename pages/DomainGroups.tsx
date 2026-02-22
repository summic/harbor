import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit2, Plus, Save, Search, Shield, Trash2, X } from 'lucide-react';
import { mockApi } from '../api';
import { LoadingOverlay, SectionCard } from '../components/Common';
import { ActionType, DomainGroup } from '../types';

const DomainGroupModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initial?: DomainGroup | null;
  dnsServerOptions: string[];
  onSave: (payload: { name: string; action: ActionType; previousName?: string; dnsServer?: string }) => void;
}> = ({ isOpen, onClose, initial, dnsServerOptions, onSave }) => {
  const isEdit = Boolean(initial);
  const [name, setName] = React.useState('');
  const [action, setAction] = React.useState<ActionType>('PROXY');
  const [dnsServer, setDnsServer] = React.useState('');

  React.useEffect(() => {
    if (!isOpen) return;
    setName(initial?.name ?? '');
    setAction(initial?.action ?? 'PROXY');
    setDnsServer(initial?.dnsServer ?? '');
  }, [isOpen, initial]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-900">{isEdit ? 'Edit Policy Group' : 'Add Policy Group'}</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Group Name</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
              placeholder="kn-system"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Default Action</label>
            <select
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
              value={action}
              onChange={(e) => setAction(e.target.value as ActionType)}
            >
              <option value="PROXY">PROXY</option>
              <option value="DIRECT">DIRECT</option>
              <option value="BLOCK">BLOCK</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Default DNS Server (Optional)</label>
            <select
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
              value={dnsServer}
              onChange={(e) => setDnsServer(e.target.value)}
            >
              <option value="">(none)</option>
              {dnsServerOptions.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-slate-600 font-semibold text-sm hover:bg-slate-100 rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => onSave({ name, action, previousName: initial?.name, dnsServer })}
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

export const DomainGroupsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: groups, isLoading } = useQuery({ queryKey: ['domainGroups'], queryFn: mockApi.getDomainGroups });
  const { data: dnsServers = [] } = useQuery({ queryKey: ['dns'], queryFn: mockApi.getDns });
  const [search, setSearch] = React.useState('');
  const [editing, setEditing] = React.useState<DomainGroup | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<DomainGroup | null>(null);

  const filteredGroups = React.useMemo(() => {
    const term = search.toLowerCase();
    return (groups ?? [])
      .filter((group) => group.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [groups, search]);

  const saveMutation = useMutation({
    mutationFn: mockApi.saveDomainGroup,
    onSuccess: (next) => {
      queryClient.setQueryData(['domainGroups'], next);
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      queryClient.invalidateQueries({ queryKey: ['routing'] });
      queryClient.invalidateQueries({ queryKey: ['unifiedProfile'] });
      setIsModalOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: mockApi.deleteDomainGroup,
    onSuccess: (next) => {
      queryClient.setQueryData(['domainGroups'], next);
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      queryClient.invalidateQueries({ queryKey: ['routing'] });
      queryClient.invalidateQueries({ queryKey: ['unifiedProfile'] });
      setDeleteTarget(null);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Policy</h1>
          <p className="text-slate-500">Manage policy groups, then click a group row to manage rules.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditing(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
          >
            <Plus size={16} className="mr-2" />
            Add Policy Group
          </button>
        </div>
      </div>

      <SectionCard
        title="Groups"
        actions={
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={14} />
            <input
              type="text"
              placeholder="Search groups..."
              className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white w-full sm:w-72 outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        }
      >
        <div className="relative overflow-x-auto -mx-6">
          {isLoading && <LoadingOverlay />}
          <table className="w-full text-sm text-left border-collapse min-w-[760px]">
            <thead className="bg-slate-50/50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-3 border-y border-slate-100">Group</th>
                <th className="px-6 py-3 border-y border-slate-100 text-center">Action</th>
                <th className="px-6 py-3 border-y border-slate-100">DNS</th>
                <th className="px-6 py-3 border-y border-slate-100 text-right">Domains</th>
                <th className="px-6 py-3 border-y border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredGroups.map((group) => (
                <tr
                  key={group.id}
                  className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                  onClick={() => navigate(`/policy/${encodeURIComponent(group.name)}/rules`)}
                >
                  <td className="px-6 py-4 font-medium text-slate-800 flex items-center gap-2">
                    <Shield size={14} className="text-slate-400" />
                    {group.name}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                      group.action === 'PROXY' ? 'bg-blue-100 text-blue-700' : group.action === 'DIRECT' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {group.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{group.dnsServer || '-'}</td>
                  <td className="px-6 py-4 text-right text-slate-600 tabular-nums">{group.ruleCount}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditing(group);
                          setIsModalOpen(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget(group);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-14 text-center text-slate-400">
                    No domain groups.
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
            <h3 className="text-lg font-bold text-center text-slate-900 mb-2">Delete Policy Group?</h3>
            <p className="text-sm text-slate-500 text-center mb-6">
              Group <code className="bg-slate-100 px-1 py-0.5 rounded">{deleteTarget.name}</code> and its routing mapping will be removed.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold text-sm hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.name)}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg font-semibold text-sm hover:bg-rose-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <DomainGroupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initial={editing}
        dnsServerOptions={dnsServers.map((item) => item.name)}
        onSave={(payload) => saveMutation.mutate(payload)}
      />
    </div>
  );
};
