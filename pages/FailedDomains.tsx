import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { mockApi } from '../api';
import { LoadingOverlay, SectionCard } from '../components/Common';

const windowOptions = [
  { value: '1h', label: 'Last 1h' },
  { value: '24h', label: 'Last 24h' },
  { value: '7d', label: 'Last 7d' },
];

const outboundOptions = [
  { value: '', label: 'All' },
  { value: 'proxy', label: 'Proxy' },
  { value: 'direct', label: 'Direct' },
  { value: 'block', label: 'Block' },
  { value: 'dns', label: 'DNS' },
  { value: 'unknown', label: 'Unknown' },
];

export const FailedDomainsPage: React.FC = () => {
  const [window, setWindow] = React.useState('24h');
  const [userId, setUserId] = React.useState('');
  const [outboundType, setOutboundType] = React.useState('');

  const { data: users = [] } = useQuery({
    queryKey: ['failed-domains-users'],
    queryFn: mockApi.getUsers,
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['failed-domains', window, userId, outboundType],
    queryFn: () =>
      mockApi.getFailedDomains({
        window,
        userId: userId || undefined,
        outboundType: outboundType || undefined,
        limit: 200,
      }),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Failed Domains</h1>
        <p className="text-slate-500">Failed request domains for policy tuning and troubleshooting.</p>
      </div>

      <SectionCard title="Filters" actions={<AlertTriangle size={16} className="text-slate-400" />}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="text-sm text-slate-600">
            Time Window
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              value={window}
              onChange={(e) => setWindow(e.target.value)}
            >
              {windowOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            User
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">All users</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName || user.email || user.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Outbound Type
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              value={outboundType}
              onChange={(e) => setOutboundType(e.target.value)}
            >
              {outboundOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Results" description={`Found ${rows.length} domains`}>
        <div className="relative overflow-x-auto -mx-6">
          {isLoading ? <LoadingOverlay /> : null}
          <table className="w-full text-sm text-left border-collapse min-w-[980px]">
            <thead className="bg-slate-50/50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-3 border-y border-slate-100">Domain</th>
                <th className="px-6 py-3 border-y border-slate-100 text-right">Failures</th>
                <th className="px-6 py-3 border-y border-slate-100 text-right">Requests</th>
                <th className="px-6 py-3 border-y border-slate-100 text-right">Success Rate</th>
                <th className="px-6 py-3 border-y border-slate-100">Outbound</th>
                <th className="px-6 py-3 border-y border-slate-100">Last Error</th>
                <th className="px-6 py-3 border-y border-slate-100">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr key={`${row.domain}-${index}`} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3 font-medium text-slate-800">{row.domain}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-rose-600 font-semibold">{row.failures.toLocaleString()}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-slate-600">{row.requests.toLocaleString()}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-slate-600">{row.successRate.toFixed(1)}%</td>
                  <td className="px-6 py-3 text-slate-600 uppercase text-xs">{row.outboundType}</td>
                  <td className="px-6 py-3 text-slate-500 text-xs break-all">{row.lastError || '-'}</td>
                  <td className="px-6 py-3 text-slate-500 text-xs">{row.lastSeen}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    No failed domains in current filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};
