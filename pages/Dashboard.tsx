import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Zap, GitCommit, Activity, History } from 'lucide-react';
import { SectionCard, LoadingOverlay } from '../components/Common';
import { mockApi } from '../api';

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

  const uploadSeries = data?.traffic.uploadSeries ?? Array.from({ length: 24 }, () => 0);
  const downloadSeries = data?.traffic.downloadSeries ?? Array.from({ length: 24 }, () => 0);
  const deviceSeries = data?.devices.series ?? Array.from({ length: 24 }, () => 0);
  const syncSeries = data?.syncRequests.series ?? Array.from({ length: 24 }, () => 0);

  const syncMax = Math.max(...syncSeries, 1);
  const syncTotal = syncSeries.reduce((sum, value) => sum + value, 0);
  const totalUpload = uploadSeries.reduce((sum, value) => sum + value, 0);
  const totalDownload = downloadSeries.reduce((sum, value) => sum + value, 0);

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
          <div className="lg:col-span-1">
            <SectionCard title="Sync Requests" description={`Subscription pull hits · total ${syncTotal}`}>
              <div className="h-48 flex items-end gap-1 px-1 pt-4">
                {syncSeries.map((value, i) => {
                  const heightPercent = (value / syncMax) * 100;
                  const isPeak = value > syncMax * 0.7;
                  return (
                    <div key={i} className="flex-1 flex flex-col justify-end gap-1 group relative h-full">
                      <div className={`w-full rounded-sm transition-all ${isPeak ? 'bg-blue-600' : 'bg-slate-200'}`} style={{ height: `${heightPercent}%` }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-mono">
                <span>-23h</span>
                <span>-12h</span>
                <span>now</span>
              </div>
            </SectionCard>
          </div>

          <div className="lg:col-span-2">
            <SectionCard title="Admin Audit Log" actions={<History size={16} className="text-slate-400" />}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Admin</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3 text-right">Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(data?.auditLogs ?? []).map((log, i) => (
                      <tr key={`${log.event}-${i}`} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-semibold text-slate-700">{log.event}</td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">{log.admin}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{log.time}</td>
                        <td className="px-4 py-3 text-right text-xs text-blue-600 font-medium">{log.target}</td>
                      </tr>
                    ))}
                    {(data?.auditLogs ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-xs text-slate-400">No audit logs yet</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
};

