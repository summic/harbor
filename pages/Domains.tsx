
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, Filter, Download, Upload, MoreVertical, Trash2, Edit2, AlertTriangle } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard, Skeleton, StatusBadge, LoadingOverlay } from '../components/Common';
import { DomainRule } from '../types';

export const DomainsPage: React.FC = () => {
  const { data: rules, isLoading } = useQuery({ queryKey: ['domains'], queryFn: mockApi.getDomains });
  const [search, setSearch] = useState('');

  const filteredRules = rules?.filter(r => r.value.includes(search) || r.group.includes(search));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-balance">Domain Rules</h1>
          <p className="text-slate-500 text-pretty">Manage fine-grained routing for specific domains and patterns.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 active:transform active:scale-95 transition-all">
            <Plus size={16} className="mr-2" />
            Add Rule
          </button>
        </div>
      </div>

      <SectionCard 
        title="Rule Management" 
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="Search rules..." 
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all w-full sm:w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg border border-slate-200" aria-label="Filters">
              <Filter size={16} />
            </button>
            <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-lg border border-slate-200" aria-label="Export">
              <Download size={16} />
            </button>
          </div>
        }
      >
        <div className="relative overflow-x-auto -mx-6">
          {isLoading && <LoadingOverlay />}
          <table className="w-full text-sm text-left border-collapse min-w-[800px]">
            <thead className="bg-slate-50/50 text-slate-500 font-medium">
              <tr>
                <th className="px-6 py-3 border-y border-slate-100">Type</th>
                <th className="px-6 py-3 border-y border-slate-100">Value</th>
                <th className="px-6 py-3 border-y border-slate-100">Group</th>
                <th className="px-6 py-3 border-y border-slate-100 text-center">Action</th>
                <th className="px-6 py-3 border-y border-slate-100 text-right">Priority</th>
                <th className="px-6 py-3 border-y border-slate-100">Status</th>
                <th className="px-6 py-3 border-y border-slate-100 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRules?.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <code className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded uppercase">{rule.type}</code>
                  </td>
                  <td className="px-6 py-4 font-medium truncate max-w-[200px]">{rule.value}</td>
                  <td className="px-6 py-4 text-slate-500">{rule.group}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`
                      px-2 py-1 rounded text-[10px] font-bold
                      ${rule.action === 'PROXY' ? 'bg-blue-100 text-blue-700' : 
                        rule.action === 'DIRECT' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}
                    `}>
                      {rule.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-slate-500">{rule.priority}</td>
                  <td className="px-6 py-4">
                    <StatusBadge active={rule.enabled} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" aria-label="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded" aria-label="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SectionCard title="Conflict Detection" description="Overlapping or contradictory domain rules detected.">
          <div className="flex items-start p-4 bg-amber-50 rounded-lg border border-amber-100 text-amber-800 text-sm">
            <AlertTriangle className="mr-3 shrink-0" size={18} />
            <div>
              <p className="font-semibold">2 Conflicts found</p>
              <ul className="mt-2 space-y-1 list-disc list-inside opacity-90">
                <li><code>google.com</code> matches both suffix and exact.</li>
                <li>Regex <code>.*</code> might override more specific rules.</li>
              </ul>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Hit Tester" description="Verify which rule will be applied for a specific domain.">
          <div className="space-y-4">
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="e.g. static.google.com" 
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20"
              />
              <button className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800">Test</button>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2 font-mono">
                <span>CHAIN PREVIEW</span>
                <span>MATCHED</span>
              </div>
              <div className="flex items-center text-sm font-medium">
                <span className="text-slate-500">Domain</span>
                <span className="mx-2 text-slate-300">→</span>
                <span className="text-blue-600 font-semibold">Rule: suffix (*.google.com)</span>
                <span className="mx-2 text-slate-300">→</span>
                <span className="text-emerald-600 font-bold uppercase">PROXY</span>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
