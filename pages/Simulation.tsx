import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Target, Search, Server, Route, Shuffle } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard } from '../components/Common';

const protocolOptions = ['tcp', 'udp', 'dns', 'icmp', 'stun', 'dtls'];

export const SimulationPage: React.FC = () => {
  const [target, setTarget] = React.useState('connect-api-prod.kuainiu.chat');
  const [protocol, setProtocol] = React.useState('tcp');
  const [port, setPort] = React.useState<string>('443');

  const simulateMutation = useMutation({
    mutationFn: mockApi.simulateTraffic,
  });

  const handleSimulate = () => {
    simulateMutation.mutate({
      target: target.trim(),
      protocol,
      port: port.trim() ? Number(port) : undefined,
    });
  };

  const result = simulateMutation.data;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Traffic Simulation</h1>
        <p className="text-slate-500">Validate DNS and routing decisions before publishing policy changes.</p>
      </div>

      <SectionCard title="Route Simulator" description="Input target and inspect matched DNS/routing chain.">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Target Domain / IP / URL</label>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="e.g. connect-api-prod.kuainiu.chat"
                className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Protocol</label>
                <select
                  value={protocol}
                  onChange={(e) => setProtocol(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                >
                  {protocolOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase">Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="443"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
              </div>
            </div>

            <button
              onClick={handleSimulate}
              disabled={!target.trim() || simulateMutation.isPending}
              className="w-full py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {simulateMutation.isPending ? 'Simulating...' : 'Run Simulation'}
            </button>

            {simulateMutation.error ? (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">
                {simulateMutation.error instanceof Error ? simulateMutation.error.message : 'Simulation failed'}
              </div>
            ) : null}
          </div>

          <div className="lg:col-span-2">
            {!result ? (
              <div className="h-full min-h-52 border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm flex items-center justify-center">
                Run simulation to inspect the full decision timeline.
              </div>
            ) : (
              <div className="relative">
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200"></div>
                <div className="space-y-6 relative">
                  <div className="flex items-start">
                    <div className="z-10 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center border-2 border-white shadow-sm">
                      <Target size={12} className="text-blue-600" />
                    </div>
                    <div className="ml-4 pt-0.5">
                      <p className="text-xs font-bold uppercase text-slate-400">Input</p>
                      <p className="text-sm font-medium">{result.input.target}</p>
                      <p className="text-xs text-slate-500">protocol: {result.input.protocol}{result.input.port ? `:${result.input.port}` : ''}</p>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <div className="z-10 w-6 h-6 rounded-full bg-cyan-100 flex items-center justify-center border-2 border-white shadow-sm">
                      <Search size={12} className="text-cyan-700" />
                    </div>
                    <div className="ml-4 pt-0.5">
                      <p className="text-xs font-bold uppercase text-slate-400">DNS Decision</p>
                      <p className="text-sm font-medium">server: {result.dns.selectedServer}</p>
                      {result.dns.matchedRule ? (
                        <p className="text-xs text-slate-500">matched: {result.dns.matchedRule}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-start">
                    <div className="z-10 w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center border-2 border-white shadow-sm">
                      <Server size={12} className="text-emerald-700" />
                    </div>
                    <div className="ml-4 pt-0.5 w-full">
                      <p className="text-xs font-bold uppercase text-slate-400">Matched Rules</p>
                      {result.route.matchedRules.length === 0 ? (
                        <p className="text-sm text-slate-500">No explicit rule matched.</p>
                      ) : (
                        <div className="space-y-2">
                          {result.route.matchedRules.map((item) => (
                            <div key={`${item.index}-${item.summary}`} className="text-xs border border-slate-200 rounded-md p-2 bg-slate-50">
                              <p className="font-semibold text-slate-700">#{item.index} {item.outbound ? `-> ${item.outbound}` : `action: ${item.action}`}</p>
                              <p className="text-slate-500 break-all">{item.summary}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start">
                    <div className="z-10 w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center border-2 border-white shadow-sm">
                      <Route size={12} className="text-amber-700" />
                    </div>
                    <div className="ml-4 pt-0.5">
                      <p className="text-xs font-bold uppercase text-slate-400">Final Outbound</p>
                      <p className="text-sm font-bold text-blue-700 uppercase">{result.route.finalOutbound}</p>
                      {result.route.usedFinalFallback ? (
                        <p className="text-xs text-slate-500">fallback: route.final</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-start">
                    <div className="z-10 w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center border-2 border-white shadow-sm">
                      <Shuffle size={12} className="text-violet-700" />
                    </div>
                    <div className="ml-4 pt-0.5">
                      <p className="text-xs font-bold uppercase text-slate-400">Normalized</p>
                      <p className="text-xs text-slate-600 break-all">
                        domain: {result.normalized.domain || '-'} | ip: {result.normalized.ip || '-'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
};
