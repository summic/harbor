export type FailureReasonCode =
  | 'DNS_TIMEOUT'
  | 'DNS_REFUSED'
  | 'TLS_HANDSHAKE'
  | 'CONNECT_TIMEOUT'
  | 'CONNECTION_RESET'
  | 'BLOCKED_POLICY'
  | 'AUTH_FAILED'
  | 'UPSTREAM_5XX'
  | 'UPSTREAM_4XX'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

export interface StandardizedFailureReason {
  code: FailureReasonCode;
  label: string;
  description: string;
  raw: string;
}

export const failureReasonCatalog: Record<FailureReasonCode, { label: string; description: string }> = {
  DNS_TIMEOUT: {
    label: 'DNS Timeout',
    description: 'Resolver did not respond within the expected time window.',
  },
  DNS_REFUSED: {
    label: 'DNS Refused',
    description: 'Resolver rejected the request or denied the query.',
  },
  TLS_HANDSHAKE: {
    label: 'TLS Handshake Failed',
    description: 'TLS negotiation failed before the session was established.',
  },
  CONNECT_TIMEOUT: {
    label: 'Connect Timeout',
    description: 'Upstream connect attempt exceeded the timeout threshold.',
  },
  CONNECTION_RESET: {
    label: 'Connection Reset',
    description: 'The upstream closed or reset the connection unexpectedly.',
  },
  BLOCKED_POLICY: {
    label: 'Blocked by Policy',
    description: 'Request was blocked by policy, ACL, or routing rules.',
  },
  AUTH_FAILED: {
    label: 'Authentication Failed',
    description: 'Credential or token verification failed at the upstream.',
  },
  UPSTREAM_5XX: {
    label: 'Upstream 5xx',
    description: 'Upstream service returned a server-side error.',
  },
  UPSTREAM_4XX: {
    label: 'Upstream 4xx',
    description: 'Upstream service rejected the request with a client error.',
  },
  RATE_LIMITED: {
    label: 'Rate Limited',
    description: 'Upstream rejected the request due to rate limiting.',
  },
  UNKNOWN: {
    label: 'Unknown',
    description: 'Unclassified failure reason reported by the backend.',
  },
};

const failureReasonAliases: Record<string, FailureReasonCode> = {
  DNS_TIMEOUT: 'DNS_TIMEOUT',
  DNS_QUERY_TIMEOUT: 'DNS_TIMEOUT',
  RESOLVE_TIMEOUT: 'DNS_TIMEOUT',
  DNS_REFUSED: 'DNS_REFUSED',
  DNS_FORBIDDEN: 'DNS_REFUSED',
  TLS_HANDSHAKE: 'TLS_HANDSHAKE',
  TLS_HANDSHAKE_FAILED: 'TLS_HANDSHAKE',
  CONNECT_TIMEOUT: 'CONNECT_TIMEOUT',
  CONNECTION_TIMEOUT: 'CONNECT_TIMEOUT',
  CONNECTION_RESET: 'CONNECTION_RESET',
  RESET_BY_PEER: 'CONNECTION_RESET',
  POLICY_BLOCKED: 'BLOCKED_POLICY',
  BLOCKED_POLICY: 'BLOCKED_POLICY',
  AUTH_FAILED: 'AUTH_FAILED',
  AUTH_FAILURE: 'AUTH_FAILED',
  UPSTREAM_5XX: 'UPSTREAM_5XX',
  UPSTREAM_4XX: 'UPSTREAM_4XX',
  RATE_LIMITED: 'RATE_LIMITED',
  TOO_MANY_REQUESTS: 'RATE_LIMITED',
};

const normalizeKey = (value: string) => value.trim().toUpperCase().replace(/[\s-]+/g, '_');

export const standardizeFailureReason = (raw: string): StandardizedFailureReason => {
  const normalized = normalizeKey(raw || '');
  const code = failureReasonAliases[normalized] ?? (failureReasonCatalog[normalized as FailureReasonCode] ? (normalized as FailureReasonCode) : 'UNKNOWN');
  const { label, description } = failureReasonCatalog[code];
  return { code, label, description, raw };
};

const unwrapData = (payload: unknown) => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: unknown }).data;
  }
  return payload;
};

const toArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const toNumber = (value: unknown, fallback: number | undefined = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};
const toOptionalNumber = (value: unknown) => toNumber(value, undefined);
const toString = (value: unknown, fallback?: string) => (typeof value === 'string' ? value : fallback ?? '');

export interface QualityStabilityPoint {
  timestamp: string;
  total: number;
  successRate: number;
  errorRate?: number;
  p95LatencyMs?: number;
}

export interface QualityTopDomain {
  domain: string;
  count: number;
  category?: string;
}

export interface QualityFailureReason {
  code: string;
  count: number;
  ratio?: number;
}

export interface QualityObservability {
  window: string;
  updatedAt: string;
  stability: {
    points: QualityStabilityPoint[];
    totalRequests?: number;
    avgSuccessRate?: number;
  };
  topDomains: QualityTopDomain[];
  failureReasons: QualityFailureReason[];
}

export const normalizeObservabilityResponse = (payload: unknown): QualityObservability => {
  const raw = unwrapData(payload) as Record<string, unknown> | null | undefined;
  const window = toString(raw?.window, '24h');
  const updatedAt = toString(raw?.updatedAt ?? raw?.updated_at, '');
  const stabilityRaw = (raw?.stability ?? raw?.stability_view ?? {}) as Record<string, unknown>;
  const pointsRaw = toArray<Record<string, unknown>>(stabilityRaw.points ?? stabilityRaw.series ?? stabilityRaw.samples);
  const points = pointsRaw
    .map(point => ({
      timestamp: toString(point.timestamp ?? point.ts ?? point.time),
      total: toNumber(point.total ?? point.count ?? point.requests),
      successRate: toNumber(point.successRate ?? point.success_rate ?? point.ok_rate ?? point.success),
      errorRate: toOptionalNumber(point.errorRate ?? point.error_rate),
      p95LatencyMs: toOptionalNumber(point.p95LatencyMs ?? point.p95_latency_ms),
    }))
    .filter(point => point.timestamp);

  const topDomainsRaw = toArray<Record<string, unknown>>(raw?.topDomains ?? raw?.top_domains ?? raw?.key_domains);
  const topDomains = topDomainsRaw
    .map(entry => ({
      domain: toString(entry.domain ?? entry.host ?? entry.name),
      count: toNumber(entry.count ?? entry.hits ?? entry.requests),
      category: toString(entry.category ?? entry.type, undefined),
    }))
    .filter(entry => entry.domain);

  const failureRaw = toArray<Record<string, unknown>>(raw?.failureReasons ?? raw?.failure_reasons ?? raw?.failures);
  const failureReasons = failureRaw
    .map(entry => ({
      code: toString(entry.code ?? entry.reason ?? entry.type),
      count: toNumber(entry.count ?? entry.total),
      ratio: toOptionalNumber(entry.ratio ?? entry.share),
    }))
    .filter(entry => entry.code);

  return {
    window,
    updatedAt,
    stability: {
      points,
      totalRequests: toOptionalNumber(stabilityRaw.totalRequests ?? stabilityRaw.total_requests),
      avgSuccessRate: toOptionalNumber(stabilityRaw.avgSuccessRate ?? stabilityRaw.avg_success_rate),
    },
    topDomains,
    failureReasons,
  };
};
