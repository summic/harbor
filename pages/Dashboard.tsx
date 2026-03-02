import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Zap, GitCommit, Activity, Globe, AlertTriangle, XCircle } from 'lucide-react';
import { SectionCard, LoadingOverlay } from '../components/Common';
import { mockApi, qualityApi } from '../api';
import { standardizeFailureReason } from '../utils/quality';

const ChartContainer: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  legend?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, children, legend, className = '' }) => (
  <div className={`bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col h-64 ${className}`}>
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle ? <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p> : null}
      </div>
      {legend ? <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider">{legend}</div> : null}
    </div>
    <div className="flex-1 w-full min-h-0 relative">{children}</div>
  </div>
);

const DeviceTrendChart: React.FC<{ data: number[] }> = ({ data }) => {
  const max = Math.max(...data, 1);
  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - (val / max) * 100;
      return `${x},${y}`;
    })
    .join(' ');
  const areaPoints = `0,100 ${points} 100,100`;

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
      <line x1="0" y1="25" x2="100" y2="25" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="75" x2="100" y2="75" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <polygon points={areaPoints} fill="url(#deviceGradientReal)" className="opacity-20" />
      <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="deviceGradientReal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
};

const TrafficTrendChart: React.FC<{ upload: number[]; download: number[] }> = ({ upload, download }) => {
  const max = Math.max(...upload, ...download, 1) * 1.1;
  const makePath = (dataset: number[]) =>
    dataset
      .map((val, i) => {
        const x = (i / (dataset.length - 1)) * 100;
        const y = 100 - (val / max) * 100;
        return `${x},${y}`;
      })
      .join(' ');
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
      <line x1="0" y1="25" x2="100" y2="25" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <line x1="0" y1="75" x2="100" y2="75" stroke="#f1f5f9" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <polyline points={makePath(download)} fill="none" stroke="#3b82f6" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={makePath(upload)} fill="none" stroke="#10b981" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const fmtBytes = (bytes: number) => {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 100 || idx === 0 ? 0 : 1)} ${units[idx]}`;
};

type DomainTrafficScope = 'app' | 'dns' | 'all';

const extractHostAndPort = (value: string): { host: string; port?: number } => {
  const trimmed = value.trim();
  const lastColon = trimmed.lastIndexOf(':');
  if (lastColon <= 0) return { host: trimmed.toLowerCase() };
  const host = trimmed.slice(0, lastColon).toLowerCase();
  const portRaw = trimmed.slice(lastColon + 1);
  const port = Number(portRaw);
  if (Number.isFinite(port)) return { host, port };
  return { host: trimmed.toLowerCase() };
};

const isVirtualInternalTarget = (host: string): boolean =>
  host === '172.19.0.2' || host === '172.19.0.1' || host === '198.18.0.1' || host === '198.18.0.2';

export const DashboardPage: React.FC = () => {
  const [domainScope, setDomainScope] = useState<DomainTrafficScope>('app');
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => mockApi.getDashboardSummary(),
    refetchInterval: 30_000,
  });
  const { data: qualityData } = useQuery({
    queryKey: ['dashboard-quality-observability', '24h', 10],
    queryFn: () => qualityApi.getObservability({ window: '24h', topN: 10, bucket: '1h' }),
    refetchInterval: 30_000,
  });
  const { data: failedDomains = [] } = useQuery({
    queryKey: ['dashboard-failed-domains', '24h', 12],
    queryFn: () => mockApi.getFailedDomains({ window: '24h', limit: 12 }),
    refetchInterval: 30_000,
  });

  const uploadSeries = data?.traffic.uploadSeries ?? Array.from({ length: 24 }, () => 0);
  const downloadSeries = data?.traffic.downloadSeries ?? Array.from({ length: 24 }, () => 0);
  const deviceSeries = data?.devices.series ?? Array.from({ length: 24 }, () => 0);
  const totalUpload = uploadSeries.reduce((sum, value) => sum + value, 0);
  const totalDownload = downloadSeries.reduce((sum, value) => sum + value, 0);
  const filteredDomains = useMemo(() => {
    const list = qualityData?.topDomains ?? [];
    return list.filter((item) => {
      const category = (item.category || '').toLowerCase();
      if (category === 'dns') {
        if (domainScope === 'all') return true;
        return domainScope === 'dns';
      }
      if (category === 'app') {
        if (domainScope === 'all') return true;
        if (domainScope === 'dns') return false;
        const { host } = extractHostAndPort(item.domain);
        return !isVirtualInternalTarget(host);
      }
      const policy = (item.policy || item.category || 'unknown').toLowerCase();
      const { host, port } = extractHostAndPort(item.domain);
      const dnsLike = policy === 'dns' || port === 53 || host.endsWith('.local');
      if (domainScope === 'dns') return dnsLike;
      if (domainScope === 'all') return true;
      return !dnsLike && !isVirtualInternalTarget(host);
    });
  }, [qualityData?.topDomains, domainScope]);

  const allDomainTotal = filteredDomains.reduce((sum, item) => sum + item.count, 0);
  const proxyFailureTotal = (qualityData?.failureReasons ?? []).reduce((sum, item) => sum + item.count, 0);

  const stats = [
    { icon: Users, label: 'Active Users', value: String(data?.stats.activeUsers ?? 0), sub: '24h', color: 'blue' },
    { icon: Zap, label: 'Active Nodes', value: String(data?.stats.activeNodes ?? 0), sub: 'Outbounds', color: 'indigo' },
    { icon: Activity, label: 'System Load', value: `${data?.stats.systemLoadPercent ?? 0}%`, sub: 'Realtime', color: 'emerald' },
    { icon: GitCommit, label: 'Config Ver', value: data?.stats.configVersion ?? 'v0.0.0', sub: 'HEAD', color: 'slate' },
  ] as const;

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-100 text-slate-700',
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto animate-fade-in">
      <div className="relative">
        {isLoading ? <LoadingOverlay /> : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between transition-transform hover:-translate-y-0.5 duration-200">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{stat.label}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">{stat.value}</span>
                  <span className="text-xs font-medium text-slate-400">{stat.sub}</span>
                </div>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorMap[stat.color]}`}>
                <stat.icon size={24} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="lg:col-span-2">
            <ChartContainer
              title="Traffic Overview"
              subtitle={`Proxy traffic only · Upload ${fmtBytes(totalUpload)} · Download ${fmtBytes(totalDownload)} (24h)`}
              legend={
                <>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Download</div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Upload</div>
                </>
              }
            >
              <TrafficTrendChart upload={uploadSeries} download={downloadSeries} />
            </ChartContainer>
          </div>

          <div>
            <ChartContainer
              title="Concurrent Devices"
              subtitle="Distinct connected devices (24h)"
              legend={<div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Devices</div>}
            >
              <DeviceTrendChart data={deviceSeries} />
            </ChartContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="lg:col-span-2">
            <SectionCard
              title="Top Domains (All Requests)"
              description="Sorted by request count. Switch between app traffic and DNS traffic"
              actions={<Globe size={16} className="text-slate-400" />}
            >
              <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-white p-1 text-xs">
                {([
                  { key: 'app', label: 'App Traffic' },
                  { key: 'dns', label: 'DNS' },
                  { key: 'all', label: 'All' },
                ] as Array<{ key: DomainTrafficScope; label: string }>).map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setDomainScope(item.key)}
                    className={`rounded-md px-2.5 py-1 transition-colors ${
                      domainScope === item.key
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 w-16">#</th>
                      <th className="px-4 py-3">Domain</th>
                      <th className="px-4 py-3">Policy</th>
                      <th className="px-4 py-3 text-right">Requests</th>
                      <th className="px-4 py-3 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredDomains.map((item, index) => {
                      const ratio = allDomainTotal > 0 ? (item.count / allDomainTotal) * 100 : 0;
                      const policy = (item.policy || item.category || 'unknown').toLowerCase();
                      return (
                        <tr key={`${item.domain}-${index}`} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-xs font-mono text-slate-400">{index + 1}</td>
                          <td className="px-4 py-3 font-semibold text-slate-700">{item.domain}</td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-500">{policy}</td>
                          <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{item.count.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{ratio.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    {filteredDomains.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">No domain requests yet</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
          <div className="lg:col-span-1">
            <div className="space-y-6">
              <SectionCard
                title="Proxy Failures"
                description="Standardized connection failure reasons"
                actions={<AlertTriangle size={16} className="text-slate-400" />}
              >
                <div className="space-y-3">
                  {(qualityData?.failureReasons ?? []).slice(0, 6).map((item, index) => {
                    const standardized = standardizeFailureReason(item.code);
                    const ratio = proxyFailureTotal > 0 ? (item.count / proxyFailureTotal) * 100 : 0;
                    return (
                      <div key={`${item.code}-${index}`} className="rounded-lg border border-slate-200 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{standardized.label}</p>
                            <p className="text-[10px] uppercase tracking-wider text-slate-400">{standardized.code}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-slate-900 tabular-nums">{item.count.toLocaleString()}</p>
                            <p className="text-xs text-slate-500 tabular-nums">{ratio.toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {(qualityData?.failureReasons ?? []).length === 0 ? (
                    <p className="text-xs text-slate-400">No failure reasons yet</p>
                  ) : null}
                </div>
              </SectionCard>

              <SectionCard
                title="Failed Domains"
                description="Top failed domains in the last 24h"
                actions={<XCircle size={16} className="text-slate-400" />}
              >
                <div className="space-y-2">
                  {failedDomains.slice(0, 8).map((item, index) => (
                    <div key={`${item.domain}-${index}`} className="rounded-lg border border-slate-200 px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{item.domain}</p>
                          <p className="text-[11px] text-slate-500 truncate">{item.lastError || 'unknown error'}</p>
                          <p className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">
                            {(item.outboundType || 'unknown').toLowerCase()} · success {item.successRate.toFixed(1)}%
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-rose-600 tabular-nums">{item.failures.toLocaleString()}</p>
                          <p className="text-[10px] text-slate-400 tabular-nums">/ {item.requests.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {failedDomains.length === 0 ? (
                    <p className="text-xs text-slate-400">No failed domains in last 24h</p>
                  ) : null}
                </div>
              </SectionCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
