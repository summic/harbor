
import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Database, Hash, Trash2, Edit3, Link2 } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, StatusBadge, LoadingOverlay } from '../components/Common';
import { DnsUpstream, HostsEntry } from '../types';

const DnsModal: React.FC<{
  open: boolean;
  initial?: DnsUpstream | null;
  onClose: () => void;
  onSubmit: (payload: {
    id?: string;
    name: string;
    type: DnsUpstream['type'];
    address: string;
    detour?: string;
    strategy?: DnsUpstream['strategy'];
  }) => void;
}> = ({ open, initial, onClose, onSubmit }) => {
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState<DnsUpstream['type']>('dot');
  const [address, setAddress] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    setName(initial?.name || '');
    setType(initial?.type || 'dot');
    setAddress(initial?.address || '');
  }, [open, initial]);

  if (!open) return null;
  const hideAddress = type === 'local' || type === 'hosts';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 space-y-4">
        <h3 className="text-lg font-bold text-slate-900">{initial ? 'Edit DNS Server' : 'Add DNS Server'}</h3>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Tag / Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as DnsUpstream['type'])} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
            <option value="dot">dot</option>
            <option value="doh">doh</option>
            <option value="udp">udp</option>
            <option value="local">local</option>
            <option value="hosts">hosts</option>
          </select>
        </div>
        {!hideAddress ? (
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Address</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          </div>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600">Cancel</button>
          <button
            onClick={() => onSubmit({
              id: initial?.id,
              name: name.trim(),
              type,
              address: hideAddress ? '' : address.trim(),
              detour: initial?.detour,
              strategy: initial?.strategy,
            })}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

const HostModal: React.FC<{
  open: boolean;
  initial?: HostsEntry | null;
  onClose: () => void;
  onSubmit: (payload: { hostname: string; ip: string; group?: string }) => void;
}> = ({ open, initial, onClose, onSubmit }) => {
  const [hostname, setHostname] = React.useState('');
  const [ip, setIp] = React.useState('');
  const [group, setGroup] = React.useState('dns_hosts');

  React.useEffect(() => {
    if (!open) return;
    setHostname(initial?.hostname || '');
    setIp(initial?.ip || '');
    setGroup(initial?.group || 'dns_hosts');
  }, [open, initial]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 space-y-4">
        <h3 className="text-lg font-bold text-slate-900">{initial ? 'Edit Host Mapping' : 'Add Host Mapping'}</h3>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Hostname</label>
          <input value={hostname} onChange={(e) => setHostname(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">IP</label>
          <input value={ip} onChange={(e) => setIp(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Group</label>
          <input value={group} onChange={(e) => setGroup(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600">Cancel</button>
          <button
            onClick={() => onSubmit({ hostname: hostname.trim(), ip: ip.trim(), group: group.trim() || 'dns_hosts' })}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export const DnsHostsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: dns, isLoading: loadingDns } = useQuery({ queryKey: ['dns'], queryFn: mockApi.getDns });
  const { data: hosts, isLoading: loadingHosts } = useQuery({ queryKey: ['hosts'], queryFn: mockApi.getHosts });
  const [batchText, setBatchText] = React.useState('');
  const [dnsModalOpen, setDnsModalOpen] = React.useState(false);
  const [editingDns, setEditingDns] = React.useState<DnsUpstream | null>(null);
  const [hostModalOpen, setHostModalOpen] = React.useState(false);
  const [editingHost, setEditingHost] = React.useState<HostsEntry | null>(null);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['dns'] });
    queryClient.invalidateQueries({ queryKey: ['hosts'] });
    queryClient.invalidateQueries({ queryKey: ['unifiedProfile'] });
  };

  const saveDnsMutation = useMutation({
    mutationFn: mockApi.saveDnsServer,
    onSuccess: () => refreshAll(),
  });
  const deleteDnsMutation = useMutation({
    mutationFn: mockApi.deleteDnsServer,
    onSuccess: () => refreshAll(),
  });
  const saveHostMutation = useMutation({
    mutationFn: mockApi.saveHostEntry,
    onSuccess: () => refreshAll(),
  });
  const deleteHostMutation = useMutation({
    mutationFn: mockApi.deleteHostEntry,
    onSuccess: () => refreshAll(),
  });
  const batchHostMutation = useMutation({
    mutationFn: mockApi.batchImportHosts,
    onSuccess: () => {
      setBatchText('');
      refreshAll();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">DNS & Hosts</h1>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditingHost(null);
              setHostModalOpen(true);
            }}
            className="inline-flex items-center px-4 py-2 bg-white text-slate-700 text-sm font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition-all"
          >
            <Plus size={16} className="mr-2" />
            Add Host
          </button>
          <button
            onClick={() => {
              setEditingDns(null);
              setDnsModalOpen(true);
            }}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-all"
          >
            <Plus size={16} className="mr-2" />
            Add DNS
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="DNS Servers" description="Configured upstream resolvers.">
          <div className="relative overflow-hidden -mx-6 -my-6">
            {loadingDns && <LoadingOverlay />}
            <div className="divide-y divide-slate-100">
              {dns?.map(server => (
                <div key={server.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between group">
                  <div className="flex items-center min-w-0">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mr-4 shrink-0">
                      <Database size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold truncate">{server.name}</h4>
                        <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{server.type}</span>
                      </div>
                      <p className="text-xs text-slate-500 font-mono truncate">{server.address}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge active={server.enabled} />
                    <button
                      onClick={() => {
                        setEditingDns(server);
                        setDnsModalOpen(true);
                      }}
                      className="p-2 text-slate-400 hover:text-slate-900 opacity-0 group-hover:opacity-100"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (!window.confirm(`Delete DNS server ${server.name}?`)) return;
                        deleteDnsMutation.mutate(server.id);
                      }}
                      className="p-2 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Local Hosts" description="Static IP mapping for specific hostnames.">
           <div className="relative overflow-hidden -mx-6 -my-6">
            {loadingHosts && <LoadingOverlay />}
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-medium">
                <tr>
                  <th className="px-6 py-3">Hostname</th>
                  <th className="px-6 py-3">Mapping</th>
                  <th className="px-6 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hosts?.map(host => (
                  <tr key={host.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <Hash size={14} className="mr-2 text-slate-300" />
                        <span className="font-medium">{host.hostname}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                         <Link2 size={12} className="mr-2 text-slate-400" />
                         <span className="font-mono text-xs text-blue-600">{host.ip}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <StatusBadge active={host.enabled} activeLabel="Live" />
                        <button
                          onClick={() => {
                            setEditingHost(host);
                            setHostModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-900 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={() => {
                            if (!window.confirm(`Delete host ${host.hostname}?`)) return;
                            deleteHostMutation.mutate(host.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Batch Import Hosts" description="Paste bulk hostname/IP pairs below. Format: 1.2.3.4 example.com">
        <textarea 
          placeholder="192.168.1.1 nas.local&#10;127.0.0.1 dev.local"
          value={batchText}
          onChange={(e) => setBatchText(e.target.value)}
          className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
        ></textarea>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => batchHostMutation.mutate(batchText)}
            disabled={!batchText.trim() || batchHostMutation.isPending}
            className="px-6 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            Process Batch
          </button>
        </div>
      </SectionCard>
      <DnsModal
        open={dnsModalOpen}
        initial={editingDns}
        onClose={() => setDnsModalOpen(false)}
        onSubmit={(payload) => {
          if (!payload.name) return;
          saveDnsMutation.mutate(payload);
          setDnsModalOpen(false);
          setEditingDns(null);
        }}
      />
      <HostModal
        open={hostModalOpen}
        initial={editingHost}
        onClose={() => setHostModalOpen(false)}
        onSubmit={(payload) => {
          if (!payload.hostname || !payload.ip) return;
          saveHostMutation.mutate(payload);
          setHostModalOpen(false);
          setEditingHost(null);
        }}
      />
    </div>
  );
};
