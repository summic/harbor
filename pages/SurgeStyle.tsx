import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Server, Network, Shuffle, FileJson, Globe } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, LoadingOverlay } from '../components/Common';

const fmt = (value: number) => value.toLocaleString();

export const SurgeStylePage: React.FC = () => {
  const { data: proxies = [], isLoading: loadingProxies } = useQuery({
    queryKey: ['surge-proxies'],
    queryFn: mockApi.getProxies,
  });
  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['surge-groups'],
    queryFn: mockApi.getProxyGroups,
  });
  const { data: rules = [], isLoading: loadingRules } = useQuery({
    queryKey: ['surge-rules'],
    queryFn: mockApi.getRouting,
  });
  const { data: dnsServers = [], isLoading: loadingDns } = useQuery({
    queryKey: ['surge-dns'],
    queryFn: mockApi.getDns,
  });
  const { data: hosts = [], isLoading: loadingHosts } = useQuery({
    queryKey: ['surge-hosts'],
    queryFn: mockApi.getHosts,
  });
  const { data: profile } = useQuery({
    queryKey: ['surge-profile'],
    queryFn: mockApi.getUnifiedProfile,
  });

  const loading = loadingProxies || loadingGroups || loadingRules || loadingDns || loadingHosts;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Surge Style</h1>
          <p className="text-slate-500">Configuration organized by General / Proxy / Group / Rule / DNS / Profile.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] uppercase text-slate-500 font-semibold">General</p>
          <p className="text-xl font-bold text-slate-900 mt-1">ON</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] uppercase text-slate-500 font-semibold">Proxy</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{fmt(proxies.length)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] uppercase text-slate-500 font-semibold">Groups</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{fmt(groups.length)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] uppercase text-slate-500 font-semibold">Rules</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{fmt(rules.length)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] uppercase text-slate-500 font-semibold">DNS</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{fmt(dnsServers.length)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] uppercase text-slate-500 font-semibold">Hosts</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{fmt(hosts.length)}</p>
        </div>
      </div>

      <div className="relative">
        {loading ? <LoadingOverlay /> : null}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <SectionCard title="General" description="Global runtime toggles and service basics." actions={<Activity size={16} className="text-slate-400" />}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Mode</span><span className="font-semibold">Rule</span></div>
              <div className="flex justify-between"><span className="text-slate-500">System Proxy</span><span className="font-semibold">Enabled</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Log Level</span><span className="font-semibold">warn</span></div>
            </div>
          </SectionCard>

          <SectionCard title="Proxy" description="Outbound nodes." actions={<Server size={16} className="text-slate-400" />}>
            <div className="space-y-2 max-h-56 overflow-auto pr-1">
              {proxies.slice(0, 8).map((node) => (
                <div key={node.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm flex items-center justify-between">
                  <span className="font-medium text-slate-800">{node.name}</span>
                  <span className="text-xs text-slate-500">{node.protocol} {node.address}:{node.port}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Proxy Group" description="Selector / URLTest groups." actions={<Network size={16} className="text-slate-400" />}>
            <div className="space-y-2 max-h-56 overflow-auto pr-1">
              {groups.slice(0, 8).map((group) => (
                <div key={group.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{group.name}</span>
                    <span className="text-xs text-slate-500 uppercase">{group.type}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Members: {group.outbounds.join(', ') || '-'}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Rule" description="First-match routing rules (top to bottom)." actions={<Shuffle size={16} className="text-slate-400" />}>
            <div className="space-y-2 max-h-56 overflow-auto pr-1">
              {rules.slice(0, 12).map((rule) => (
                <div key={rule.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm flex items-center justify-between">
                  <span className="text-slate-700 truncate">{rule.matchType}: {rule.matchExpr}</span>
                  <span className="text-xs text-blue-700 font-semibold uppercase">{rule.outbound}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="DNS" description="DNS servers and host mapping." actions={<Globe size={16} className="text-slate-400" />}>
            <div className="space-y-2 text-sm">
              <p className="text-slate-600">Servers: <span className="font-semibold">{dnsServers.length}</span></p>
              <p className="text-slate-600">Hosts: <span className="font-semibold">{hosts.length}</span></p>
              <div className="max-h-40 overflow-auto space-y-2 pr-1">
                {dnsServers.slice(0, 6).map((dns) => (
                  <div key={dns.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                    <span className="font-semibold text-slate-800">{dns.name}</span>
                    <span className="text-slate-500"> · {dns.type} · {dns.address}</span>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Profile" description="Generated unified profile JSON." actions={<FileJson size={16} className="text-slate-400" />}>
            <div className="space-y-2 text-sm">
              <p className="text-slate-600">Last updated: <span className="font-semibold">{profile?.lastUpdated || '-'}</span></p>
              <p className="text-slate-600">Size: <span className="font-semibold">{profile?.size || '-'}</span></p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 line-clamp-4">
                {profile?.publicUrl || 'No profile URL'}
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

