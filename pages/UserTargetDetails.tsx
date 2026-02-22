import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, LoadingOverlay } from '../components/Common';

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

  const maxRequestCount = detail.recent.reduce((max, row) => Math.max(max, row.requestCount), 0);
  const outboundColor = (type: string) => {
    const value = type.toLowerCase();
    if (value.includes('proxy')) return 'bg-blue-500';
    if (value.includes('direct')) return 'bg-emerald-500';
    if (value.includes('block') || value.includes('reject')) return 'bg-rose-500';
    if (value.includes('dns')) return 'bg-violet-500';
    return 'bg-slate-500';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link to={`/users/${encodeURIComponent(id || '')}`} className="inline-flex items-center text-sm text-slate-500 hover:text-blue-600 mb-3 transition-colors">
          <ArrowLeft size={16} className="mr-1" /> Back to User
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 break-all">{detail.target}</h1>
        <p className="text-sm text-slate-500 mt-1">Request aggregation by target</p>
      </div>

      <SectionCard title="All Fields">
        <pre className="bg-slate-950 text-slate-100 rounded-lg p-4 text-xs leading-5 overflow-auto max-h-[480px]">
          {JSON.stringify(detail, null, 2)}
        </pre>
      </SectionCard>

      <SectionCard title="Recent Records">
        <div className="space-y-3">
          {detail.recent.map((row, idx) => {
            const widthPercent = maxRequestCount > 0 ? Math.max(2, (row.requestCount / maxRequestCount) * 100) : 0;
            return (
              <div key={`${row.occurredAt}-${idx}`} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-slate-500">{row.occurredAt}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">{row.outboundType}</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded bg-slate-100">
                  <div className={`h-full ${outboundColor(row.outboundType)}`} style={{ width: `${widthPercent}%` }} />
                </div>
                <div className="mt-1 text-right text-xs tabular-nums text-slate-600">{row.requestCount.toLocaleString()}</div>
              </div>
            );
          })}
          {detail.recent.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-400">No records</div>
          )}
        </div>
      </SectionCard>
    </div>
  );
};
