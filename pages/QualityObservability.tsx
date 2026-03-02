import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, TrendingDown, TrendingUp, Globe, ShieldAlert } from 'lucide-react';
import { SectionCard, EmptyState, LoadingOverlay } from '../components/Common';
import { mockApi, qualityApi } from '../api';
import {
  QualityFailureReason,
  QualityStabilityPoint,
  QualityTopDomain,
  standardizeFailureReason,
} from '../utils/quality';
import { RoutingRule, User } from '../types';

const formatPercent = (value: number, digits = 1) => `${value.toFixed(digits)}%`;
const formatCount = (value: number) => value.toLocaleString();

const extractMatchValues = (expr: string): string[] => {
  const value = expr.includes(':') ? expr.split(':').slice(1).join(':') : expr;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const estimateRuleHits = (rule: RoutingRule, domainCounts: Map<string, number>) => {
  const values = extractMatchValues(rule.matchExpr);
  if (values.length === 0) return 0;
  if (rule.matchType === 'domain') {
    let total = 0;
    for (const [domain, count] of domainCounts.entries()) {
      if (values.some((value) => domain === value || domain.endsWith(`.${value}`) || domain.endsWith(value))) {
        total += count;
      }
    }
    return total;
  }
  if (rule.matchType === 'rule_set' || rule.matchType === 'geosite') {
    return values.reduce((sum, value) => sum + (domainCounts.get(value) ?? 0), 0);
  }
  return 0;
};

const StabilityChart: React.FC<{ points: QualityStabilityPoint[] }> = ({ points }) => {
  if (points.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-slate-400">
        Not enough samples for trend rendering.
      </div>
    );
  }

  const max = 100;
  const min = 0;
  const range = max - min || 1;
  const toPoint = (value: number, index: number) => {
    const x = (index / (points.length - 1)) * 100;
    const normalized = (value - min) / range;
    const y = 100 - normalized * 100;
    return `${x},${y}`;
  };

  const linePoints = points.map((point, idx) => toPoint(point.successRate, idx)).join(' ');
  const areaPoints = `0,100 ${linePoints} 100,100`;

  return (
    <svg viewBox="0 0 100 100" className="w-full h-48" preserveAspectRatio="none">
      <line x1="0" y1="25" x2="100" y2="25" stroke="#e2e8f0" strokeWidth="0.6" />
      <line x1="0" y1="50" x2="100" y2="50" stroke="#e2e8f0" strokeWidth="0.6" />
      <line x1="0" y1="75" x2="100" y2="75" stroke="#e2e8f0" strokeWidth="0.6" />
      <polygon points={areaPoints} fill="url(#stabilityGradient)" opacity="0.25" />
      <polyline
        points={linePoints}
        fill="none"
        stroke="#0f172a"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="stabilityGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
};

const TopDomainsTable: React.FC<{ domains: QualityTopDomain[] }> = ({ domains }) => {
  const total = domains.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {domains.map((item, index) => {
        const ratio = total > 0 ? (item.count / total) * 100 : 0;
        return (
          <div
            key={`${item.domain}-${index}`}
            className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-slate-100 last:border-b-0 items-center"
          >
            <div className="col-span-1 text-xs font-mono text-slate-400">#{index + 1}</div>
            <div className="col-span-6 text-sm font-semibold text-slate-800 truncate">{item.domain}</div>
            <div className="col-span-3 text-xs text-slate-500">{formatCount(item.count)} req</div>
            <div className="col-span-2 text-xs text-slate-500 text-right">{formatPercent(ratio)}</div>
          </div>
        );
      })}
    </div>
  );
};

const FailureReasonsTable: React.FC<{ reasons: QualityFailureReason[] }> = ({ reasons }) => {
  const total = reasons.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-3">
      {reasons.map((reason, index) => {
        const standardized = standardizeFailureReason(reason.code);
        const rawRatio = reason.ratio ?? (total > 0 ? reason.count / total : 0);
        const normalizedRatio = rawRatio > 1 ? rawRatio / 100 : rawRatio;
        return (
          <div
            key={`${reason.code}-${index}`}
            className="border border-slate-200 rounded-xl px-4 py-3 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{standardized.label}</p>
                <p className="text-xs text-slate-500">{standardized.description}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-900">{formatCount(reason.count)}</p>
                <p className="text-xs text-slate-500">{formatPercent(normalizedRatio * 100)}</p>
              </div>
            </div>
            <div className="text-[10px] uppercase tracking-wider font-mono text-slate-400">
              Standard Code: {standardized.code}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const QualityObservabilityPage: React.FC = () => {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['quality-observability', '24h', 10],
    queryFn: () => qualityApi.getObservability({ window: '24h', topN: 10, bucket: '1h' }),
  });
  const { data: users = [] } = useQuery({
    queryKey: ['quality-observability-users'],
    queryFn: () => mockApi.getUsers(),
  });
  const { data: routingRules = [] } = useQuery({
    queryKey: ['quality-observability-routing'],
    queryFn: () => mockApi.getRouting(),
  });

  const summary = useMemo(() => {
    const points = data?.stability.points ?? [];
    const totalRequests = data?.stability.totalRequests ?? points.reduce((sum, point) => sum + point.total, 0);
    const avgSuccessRate = data?.stability.avgSuccessRate ?? (points.length ? points.reduce((sum, point) => sum + point.successRate, 0) / points.length : 0);
    const minSuccessRate = points.length ? Math.min(...points.map(point => point.successRate)) : 0;
    const lastSample = points[points.length - 1];
    return {
      totalRequests,
      avgSuccessRate,
      minSuccessRate,
      lastSuccessRate: lastSample?.successRate ?? 0,
      updatedAt: data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : '—',
    };
  }, [data]);

  const dnsLens = useMemo(() => {
    const totals = (users as User[]).reduce(
      (acc, user) => {
        const direct = user.logs.topDirect.reduce((sum, item) => sum + item.count, 0);
        const blocked = user.logs.topBlocked.reduce((sum, item) => sum + item.count, 0);
        const proxy = user.logs.topAllowed.reduce((sum, item) => sum + item.count, 0);
        return {
          direct: acc.direct + direct,
          blocked: acc.blocked + blocked,
          proxy: acc.proxy + proxy,
        };
      },
      { direct: 0, blocked: 0, proxy: 0 },
    );
    const total = Math.max(1, totals.direct + totals.blocked + totals.proxy);
    return {
      ...totals,
      total,
      directPct: (totals.direct / total) * 100,
      proxyPct: (totals.proxy / total) * 100,
      blockedPct: (totals.blocked / total) * 100,
    };
  }, [users]);

  const policyHitMap = useMemo(() => {
    const domainCounts = new Map<string, number>();
    for (const user of users as User[]) {
      for (const row of [...user.logs.topAllowed, ...user.logs.topDirect, ...user.logs.topBlocked]) {
        domainCounts.set(row.domain, (domainCounts.get(row.domain) ?? 0) + row.count);
      }
    }
    const rows = (routingRules as RoutingRule[]).map((rule) => ({
      id: rule.id,
      matchType: rule.matchType,
      matchExpr: rule.matchExpr,
      outbound: rule.outbound,
      hits: estimateRuleHits(rule, domainCounts),
    }));
    const maxHits = rows.reduce((max, row) => Math.max(max, row.hits), 0);
    return {
      rows: rows.sort((a, b) => b.hits - a.hits).slice(0, 12),
      maxHits,
    };
  }, [routingRules, users]);

  if (isLoading) {
    return (
      <div className="relative h-96">
        <LoadingOverlay />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        title="Unable to load quality observability"
        description={(error as Error).message || 'Please check the backend service and try again.'}
        icon={<AlertTriangle size={24} />}
      />
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <ShieldAlert size={16} className="text-blue-600" /> Sail quality monitoring system · 24h observability
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Quality Observability</h1>
        <p className="text-sm text-slate-500 max-w-2xl">
          Real-time stability, key domains, and standardized failure reasons from the production backend.
        </p>
      </div>

      <SectionCard
        title="24h Stability Overview"
        description="Success rate trend for the last 24 hours (1h bucket)."
        actions={<span className="text-xs text-slate-500">Updated: {summary.updatedAt}</span>}
      >
        {data?.stability.points.length ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              <StabilityChart points={data.stability.points} />
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900 text-white">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-300">
                  <Activity size={14} /> Avg Success
                </div>
                <div className="text-2xl font-bold mt-2">{formatPercent(summary.avgSuccessRate)}</div>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-emerald-700">
                  <TrendingUp size={14} /> Latest Hour
                </div>
                <div className="text-2xl font-bold text-emerald-700 mt-2">{formatPercent(summary.lastSuccessRate)}</div>
              </div>
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-700">
                  <TrendingDown size={14} /> Min Success
                </div>
                <div className="text-2xl font-bold text-amber-700 mt-2">{formatPercent(summary.minSuccessRate)}</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs uppercase tracking-wider text-slate-500">Total Requests</div>
                <div className="text-xl font-bold text-slate-900 mt-2">{formatCount(summary.totalRequests)}</div>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No stability samples"
            description="Backend did not return stability data for the last 24 hours."
          />
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Top Domains"
          description="Top domains by request volume during the last 24 hours."
          actions={<Globe size={16} className="text-slate-400" />}
        >
          {data?.topDomains.length ? (
            <TopDomainsTable domains={data.topDomains} />
          ) : (
            <EmptyState
              title="No key domains"
              description="Backend did not return TopN domain data yet."
            />
          )}
        </SectionCard>

        <SectionCard
          title="Normalized Failure Reasons"
          description="Failure reasons normalized to a standard taxonomy."
          actions={<AlertTriangle size={16} className="text-slate-400" />}
        >
          {data?.failureReasons.length ? (
            <FailureReasonsTable reasons={data.failureReasons} />
          ) : (
            <EmptyState
              title="No failure reasons"
              description="Backend did not return failure breakdown data yet."
            />
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="DNS Lens"
          description="Estimated DNS path distribution from uploaded request logs."
        >
          <div className="space-y-4">
            <div className="h-4 rounded-full bg-slate-100 overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: `${dnsLens.directPct}%` }} />
              <div className="h-full bg-blue-500" style={{ width: `${dnsLens.proxyPct}%` }} />
              <div className="h-full bg-rose-500" style={{ width: `${dnsLens.blockedPct}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                <div className="text-emerald-700 font-semibold uppercase">Direct</div>
                <div className="text-slate-900 font-bold mt-1">{formatCount(dnsLens.direct)}</div>
                <div className="text-emerald-700">{formatPercent(dnsLens.directPct)}</div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                <div className="text-blue-700 font-semibold uppercase">Proxy</div>
                <div className="text-slate-900 font-bold mt-1">{formatCount(dnsLens.proxy)}</div>
                <div className="text-blue-700">{formatPercent(dnsLens.proxyPct)}</div>
              </div>
              <div className="rounded-lg border border-rose-100 bg-rose-50 p-3">
                <div className="text-rose-700 font-semibold uppercase">Blocked</div>
                <div className="text-slate-900 font-bold mt-1">{formatCount(dnsLens.blocked)}</div>
                <div className="text-rose-700">{formatPercent(dnsLens.blockedPct)}</div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Policy Hit Map"
          description="Top routing policies by estimated hit count."
        >
          <div className="space-y-2">
            {policyHitMap.rows.map((row) => {
              const intensity = policyHitMap.maxHits > 0 ? row.hits / policyHitMap.maxHits : 0;
              const alpha = 0.1 + intensity * 0.35;
              return (
                <div
                  key={row.id}
                  className="rounded-lg border border-slate-200 px-3 py-2"
                  style={{ backgroundColor: `rgba(37, 99, 235, ${alpha})` }}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-800 truncate">{row.matchType}: {row.matchExpr || '-'}</span>
                    <span className="font-mono text-slate-700">{formatCount(row.hits)}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-600 uppercase">outbound: {row.outbound}</div>
                </div>
              );
            })}
            {policyHitMap.rows.length === 0 ? (
              <EmptyState
                title="No routing policies"
                description="Routing rules are required to build policy hit map."
              />
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
