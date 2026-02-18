
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Database, Hash, Trash2, Edit3, Link2, ExternalLink } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, StatusBadge, LoadingOverlay } from '../components/Common';

export const DnsHostsPage: React.FC = () => {
  const { data: dns, isLoading: loadingDns } = useQuery({ queryKey: ['dns'], queryFn: mockApi.getDns });
  const { data: hosts, isLoading: loadingHosts } = useQuery({ queryKey: ['hosts'], queryFn: mockApi.getHosts });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">DNS & Hosts</h1>
        <div className="flex gap-2">
          <button className="inline-flex items-center px-4 py-2 bg-white text-slate-700 text-sm font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition-all">
            <Plus size={16} className="mr-2" />
            Add Host
          </button>
          <button className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-all">
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
                    <button className="p-2 text-slate-400 hover:text-slate-900 opacity-0 group-hover:opacity-100"><Edit3 size={14} /></button>
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
                      <StatusBadge active={host.enabled} activeLabel="Live" />
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
          className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all outline-none"
        ></textarea>
        <div className="mt-4 flex justify-end">
          <button className="px-6 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors">
            Process Batch
          </button>
        </div>
      </SectionCard>
    </div>
  );
};
