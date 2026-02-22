import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Target, Search, Server, Route, Shuffle, ArrowRight, Radar } from 'lucide-react';
import { mockApi } from '../api';
import { SectionCard } from '../components/Common';
import { TrafficSimulationResult } from '../types';

const protocolOptions = ['tcp', 'udp', 'dns', 'icmp', 'stun', 'dtls'];

const pathColor = (outbound: string) => {
  const value = outbound.toLowerCase();
  if (value.includes('proxy')) return 'from-blue-500 to-cyan-500';
  if (value.includes('direct')) return 'from-emerald-500 to-lime-500';
  if (value.includes('block') || value.includes('reject')) return 'from-rose-500 to-orange-500';
  return 'from-slate-500 to-slate-400';
};

const FlowCard: React.FC<{
  title: string;
  subtitle: string;
  badge?: string;
  tone?: 'default' | 'dns' | 'route' | 'outbound' | 'target';
}> = ({ title, subtitle, badge, tone = 'default' }) => {
  const toneClasses: Record<string, string> = {
    default: 'border-slate-200 bg-white',
    dns: 'border-cyan-200 bg-cyan-50/40',
    route: 'border-violet-200 bg-violet-50/40',
    outbound: 'border-emerald-200 bg-emerald-50/40',
    target: 'border-blue-200 bg-blue-50/40',
  };
  return (
    <div className={`rounded-xl border p-3 ${toneClasses[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
        {badge ? <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{badge}</span> : null}
      </div>
      <p className="mt-1 text-sm font-semibold text-slate-900 break-all">{subtitle || '-'}</p>
    </div>
  );
};

const FlowGraph: React.FC<{ result: TrafficSimulationResult }> = ({ result }) => {
  const matchedRule = result.route.matchedRules[0];
  const finalOutbound = result.route.finalOutbound || 'direct';
  const outboundGradient = pathColor(finalOutbound);
  const destination = result.normalized.domain || result.normalized.ip || result.input.target;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Radar size={16} className="text-blue-600" />
          End-to-End Access Flow
        </h3>
        <span className="text-[11px] text-slate-500">First match wins, then fallback to final outbound</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] gap-2 items-center">
        <FlowCard
          title="Client Input"
          subtitle={`${result.input.target}${result.input.port ? `:${result.input.port}` : ''}`}
          badge={result.input.protocol.toUpperCase()}
          tone="target"
        />
        <ArrowRight size={16} className="text-slate-400 mx-auto" />
        <FlowCard
          title="DNS Rule"
          subtitle={result.dns.matchedRule || 'dns.final fallback'}
          badge={result.dns.selectedServer}
          tone="dns"
        />
        <ArrowRight size={16} className="text-slate-400 mx-auto" />
        <FlowCard
          title="Routing Rule"
          subtitle={matchedRule ? `#${matchedRule.index} ${matchedRule.summary}` : 'no explicit rule matched'}
          badge={matchedRule?.outbound || matchedRule?.action || 'route.final'}
          tone="route"
        />
        <ArrowRight size={16} className="text-slate-400 mx-auto" />
        <FlowCard
          title="Outbound Path"
          subtitle={finalOutbound}
          badge={result.route.usedFinalFallback ? 'fallback' : 'matched'}
          tone="outbound"
        />
        <ArrowRight size={16} className="text-slate-400 mx-auto" />
        <FlowCard
          title="Remote Site"
          subtitle={destination}
          badge={result.normalized.ip ? `ip: ${result.normalized.ip}` : 'domain'}
          tone="target"
        />
      </div>

      <div className={`mt-4 h-2 rounded-full bg-gradient-to-r ${outboundGradient}`} />
    </div>
  );
};

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
              <div className="space-y-4">
                <FlowGraph result={result} />

                <div className="relative rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="absolute left-[22px] top-12 bottom-6 w-px bg-slate-200"></div>
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
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
};
