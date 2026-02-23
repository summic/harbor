import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, LoadingOverlay } from '../components/Common';

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let current = value / 1024;
  let idx = 0;
  while (current >= 1024 && idx < units.length - 1) {
    current /= 1024;
    idx += 1;
  }
  return `${current.toFixed(current >= 100 ? 0 : current >= 10 ? 1 : 2)} ${units[idx]}`;
};

const formatDateTime = (value: string): string => {
  const ts = new Date(value);
  if (Number.isNaN(ts.getTime())) return value || '-';
  return ts.toLocaleString();
};

const DataRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-200 last:border-0">
    <div className="text-slate-700">{label}</div>
    <div className="font-mono text-slate-900 text-right break-all">{value}</div>
  </div>
);

export const UserTargetDetailsPage: React.FC = () => {
  const { id, target } = useParams<{ id: string; target: string }>();
  const decodedTarget = decodeURIComponent(target || '');

  const { data: detail, isLoading } = useQuery({
    queryKey: ['user-target-detail', id, decodedTarget],
    queryFn: () => mockApi.getUserTargetDetail(id || '', decodedTarget),
    enabled: Boolean(id && decodedTarget),
  });

  if (isLoading) return <div className="h-96 relative"><LoadingOverlay /></div>;

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle size={32} className="text-slate-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Target Not Found</h2>
        <p className="text-slate-500 mt-2 mb-6">No records found for this target.</p>
        <Link
          to={`/users/${encodeURIComponent(id || '')}`}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors"
        >
          Back to User
        </Link>
      </div>
    );
  }

  const latest = detail.recent[0];
  const createdAt = detail.recent.length ? detail.recent[detail.recent.length - 1]?.occurredAt : '-';
  const primaryPolicy = detail.outboundTypes[0]?.type || 'unknown';
  const status = detail.successRate >= 90 ? 'Active' : detail.successRate >= 60 ? 'Degraded' : 'Unstable';

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link to={`/users/${encodeURIComponent(id || '')}`} className="inline-flex items-center text-sm text-slate-500 hover:text-blue-600 mb-3 transition-colors">
          <ArrowLeft size={16} className="mr-1" /> Back to User
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 break-all">{detail.target}</h1>
        <p className="text-sm text-slate-500 mt-1">Request aggregation by target</p>
      </div>

      <SectionCard title="Connection">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-2">
          <DataRow label="Status" value={status} />
          <DataRow label="Created At" value={formatDateTime(createdAt || '-')} />
          <DataRow label="Last Seen" value={formatDateTime(detail.lastSeen)} />
          <DataRow label="Upload" value={formatBytes(detail.uploadBytes)} />
          <DataRow label="Download" value={formatBytes(detail.downloadBytes)} />
          <DataRow label="Requests" value={detail.requests.toLocaleString()} />
          <DataRow label="Success Rate" value={`${detail.successRate.toFixed(2)}%`} />
        </div>
      </SectionCard>

      <SectionCard title="Metadata">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-2">
          <DataRow label="Target" value={detail.target} />
          <DataRow label="Policy" value={primaryPolicy} />
          <DataRow label="Outbound Types" value={detail.outboundTypes.map((item) => `${item.type}:${item.count}`).join(' / ') || '-'} />
          <DataRow label="Network" value={latest?.networkType || '-'} />
          <DataRow label="Latest Outbound" value={latest?.outboundType || '-'} />
          <DataRow label="Latest Requests" value={(latest?.requestCount ?? 0).toLocaleString()} />
          <DataRow label="Latest Success" value={(latest?.successCount ?? 0).toLocaleString()} />
          <DataRow label="Latest Blocked" value={(latest?.blockedCount ?? 0).toLocaleString()} />
          <DataRow label="Latest Error" value={latest?.error || '-'} />
        </div>
      </SectionCard>

      <SectionCard title="Recent Records">
        <div className="space-y-3">
          {detail.recent.map((row, idx) => (
            <div key={`${row.occurredAt}-${idx}`} className="rounded-2xl border border-slate-200 bg-white px-5 py-2">
              <DataRow label="Time" value={formatDateTime(row.occurredAt)} />
              <DataRow label="Outbound Type" value={row.outboundType || '-'} />
              <DataRow label="Network Type" value={row.networkType || '-'} />
              <DataRow label="Requests" value={row.requestCount.toLocaleString()} />
              <DataRow label="Success" value={row.successCount.toLocaleString()} />
              <DataRow label="Blocked" value={row.blockedCount.toLocaleString()} />
              <DataRow label="Upload" value={formatBytes(row.uploadBytes)} />
              <DataRow label="Download" value={formatBytes(row.downloadBytes)} />
              <DataRow label="Error" value={row.error || '-'} />
            </div>
          ))}
          {detail.recent.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-400">No records</div>
          )}
        </div>
      </SectionCard>
    </div>
  );
};
