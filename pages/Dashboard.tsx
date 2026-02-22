import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Zap, GitCommit, Activity, Globe, AlertTriangle } from 'lucide-react';
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

export const DashboardPage: React.FC = () => {
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

  const uploadSeries = data?.traffic.uploadSeries ?? Array.from({ length: 24 }, () => 0);
  const downloadSeries = data?.traffic.downloadSeries ?? Array.from({ length: 24 }, () => 0);
  const deviceSeries = data?.devices.series ?? Array.from({ length: 24 }, () => 0);
  const totalUpload = uploadSeries.reduce((sum, value) => sum + value, 0);
  const totalDownload = downloadSeries.reduce((sum, value) => sum + value, 0);
  const proxyDomainTotal = (qualityData?.topDomains ?? []).reduce((sum, item) => sum + item.count, 0);
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
              subtitle={`Upload ${fmtBytes(totalUpload)} · Download ${fmtBytes(totalDownload)} (24h)`}
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
              title="Proxy Domains Top"
              description="过去 24 小时命中代理链路的域名（按请求数倒序）"
              actions={<Globe size={16} className="text-slate-400" />}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3 w-16">#</th>
                      <th className="px-4 py-3">Domain</th>
                      <th className="px-4 py-3 text-right">Requests</th>
                      <th className="px-4 py-3 text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(qualityData?.topDomains ?? []).map((item, index) => {
                      const ratio = proxyDomainTotal > 0 ? (item.count / proxyDomainTotal) * 100 : 0;
                      return (
                        <tr key={`${item.domain}-${index}`} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 text-xs font-mono text-slate-400">{index + 1}</td>
                          <td className="px-4 py-3 font-semibold text-slate-700">{item.domain}</td>
                          <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{item.count.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-slate-500 tabular-nums">{ratio.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    {(qualityData?.topDomains ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-xs text-slate-400">No proxied domains yet</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
          <div className="lg:col-span-1">
            <SectionCard
              title="Proxy Failures"
              description="连接失败原因标准化统计"
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
          </div>
        </div>
      </div>
    </div>
  );
};
