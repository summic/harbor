import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, LoadingOverlay } from '../components/Common';

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link to={`/users/${encodeURIComponent(id || '')}`} className="inline-flex items-center text-sm text-slate-500 hover:text-blue-600 mb-3 transition-colors">
          <ArrowLeft size={16} className="mr-1" /> Back to User
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 break-all">{detail.target}</h1>
        <p className="text-sm text-slate-500 mt-1">Request aggregation by target</p>
      </div>

      <SectionCard title="Summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500 mb-1">Requests</p>
            <p className="text-xl font-bold tabular-nums">{detail.requests.toLocaleString()}</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500 mb-1">Success Rate</p>
            <p className="text-xl font-bold tabular-nums">{detail.successRate.toFixed(2)}%</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500 mb-1">Upload</p>
            <p className="text-xl font-bold tabular-nums">{formatBytes(detail.uploadBytes)}</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500 mb-1">Download</p>
            <p className="text-xl font-bold tabular-nums">{formatBytes(detail.downloadBytes)}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Outbound Types">
        <div className="flex flex-wrap gap-2">
          {detail.outboundTypes.map((item) => (
            <span key={item.type} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded">
              {item.type}: {item.count}
            </span>
          ))}
          {detail.outboundTypes.length === 0 && (
            <span className="text-xs text-slate-400">No outbound distribution</span>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Recent Records">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-4 font-semibold">Time</th>
                <th className="py-2 pr-4 font-semibold">Outbound</th>
                <th className="py-2 pr-4 font-semibold">Requests</th>
                <th className="py-2 pr-4 font-semibold">Upload</th>
                <th className="py-2 pr-4 font-semibold">Download</th>
                <th className="py-2 font-semibold">Error</th>
              </tr>
            </thead>
            <tbody>
              {detail.recent.map((row, idx) => (
                <tr key={`${row.occurredAt}-${idx}`} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-600">{row.occurredAt}</td>
                  <td className="py-2 pr-4">{row.outboundType}</td>
                  <td className="py-2 pr-4 tabular-nums">{row.requestCount}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatBytes(row.uploadBytes)}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatBytes(row.downloadBytes)}</td>
                  <td className="py-2 text-slate-500">{row.error || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {detail.recent.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-400">No records</div>
          )}
        </div>
      </SectionCard>
    </div>
  );
};
