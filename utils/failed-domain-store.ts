export type FailedDomainReportInput = {
  userId?: string | null;
  occurredAt?: string;
  domain: string;
  outboundTag?: string;
  outboundType?: string;
  networkType?: string;
  reasonLabel?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

export type FailedDomainSummary = {
  domain: string;
  failures: number;
  requests: number;
  successRate: number;
  lastError: string | null;
  lastSeen: string;
  outboundType: string;
};

type FailedDomainReport = {
  userId: string | null;
  occurredAt: string;
  domain: string;
  outboundTag: string;
  outboundType: string;
  reasonLabel: string;
  confidence: number | null;
  metadata: Record<string, unknown> | null;
};

const parseWindowMs = (raw?: string): number => {
  const fallback = 24 * 60 * 60 * 1000;
  if (!raw) return fallback;
  const v = raw.trim().toLowerCase();
  const m = v.match(/^(\d+)\s*([smhd])$/);
  if (!m) return fallback;
  const amount = Number(m[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallback;
  const unit = m[2];
  if (unit === 's') return amount * 1000;
  if (unit === 'm') return amount * 60 * 1000;
  if (unit === 'h') return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
};

const normalizeOutbound = (tag?: string, type?: string): { tag: string; type: string } => {
  const normalizedTag = (tag || '').trim().toLowerCase();
  const normalizedType = (type || '').trim().toLowerCase();
  if (normalizedTag) return { tag: normalizedTag, type: normalizedType || normalizedTag };
  if (normalizedType) return { tag: normalizedType, type: normalizedType };
  return { tag: 'unknown', type: 'unknown' };
};

const normalizeDomain = (raw: string): string => {
  const value = raw.trim().toLowerCase();
  if (!value) return '';
  const candidate = value.includes('://') ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.trim().toLowerCase();
    return host || value;
  } catch {
    return value.split('/')[0].split(':')[0].trim().toLowerCase();
  }
};

export class FailedDomainStore {
  private reports: FailedDomainReport[] = [];

  ingest(input: FailedDomainReportInput) {
    const domain = normalizeDomain(input.domain || '');
    if (!domain) {
      throw new Error('missing_domain');
    }
    const outbound = normalizeOutbound(input.outboundTag, input.outboundType);
    this.reports.push({
      userId: input.userId?.trim() || null,
      occurredAt: input.occurredAt?.trim() || new Date().toISOString(),
      domain,
      outboundTag: outbound.tag,
      outboundType: outbound.type,
      reasonLabel: (input.reasonLabel || '').trim() || 'unknown',
      confidence: Number.isFinite(input.confidence) ? Number(input.confidence) : null,
      metadata: input.metadata || null,
    });
  }

  list(input: { window?: string; limit?: number; userId?: string; outboundType?: string }): FailedDomainSummary[] {
    const windowMs = parseWindowMs(input.window);
    const since = Date.now() - windowMs;
    const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(100, Math.trunc(input.limit || 20))) : 20;
    const userId = input.userId?.trim();
    const outboundType = input.outboundType?.trim().toLowerCase();

    const aggregate = new Map<string, { failures: number; lastSeen: string; lastError: string | null; outboundType: string }>();
    for (const item of this.reports) {
      const ts = Date.parse(item.occurredAt);
      if (!Number.isFinite(ts) || ts < since) continue;
      if (userId && item.userId !== userId) continue;
      if (outboundType && item.outboundType !== outboundType && item.outboundTag !== outboundType) continue;
      const key = `${item.domain}|${item.outboundType}`;
      const current = aggregate.get(key) ?? {
        failures: 0,
        lastSeen: item.occurredAt,
        lastError: null,
        outboundType: item.outboundType,
      };
      current.failures += 1;
      if (item.occurredAt > current.lastSeen) current.lastSeen = item.occurredAt;
      if (!current.lastError && item.reasonLabel && item.reasonLabel !== 'unknown') {
        current.lastError = item.reasonLabel;
      }
      aggregate.set(key, current);
    }

    return [...aggregate.entries()]
      .sort((a, b) => b[1].failures - a[1].failures || b[1].lastSeen.localeCompare(a[1].lastSeen))
      .slice(0, limit)
      .map(([key, value]) => {
        const [domain] = key.split('|');
        return {
          domain,
          failures: value.failures,
          requests: value.failures,
          successRate: 0,
          lastError: value.lastError,
          lastSeen: value.lastSeen,
          outboundType: value.outboundType,
        };
      });
  }

  clear() {
    this.reports = [];
  }
}

export const failedDomainStore = new FailedDomainStore();
