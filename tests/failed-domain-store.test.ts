import { describe, expect, it } from 'vitest';
import { FailedDomainStore } from '../utils/failed-domain-store';

describe('FailedDomainStore', () => {
  it('ingests and aggregates failed domains by domain + outbound type', () => {
    const store = new FailedDomainStore();
    const now = new Date().toISOString();

    store.ingest({
      occurredAt: now,
      domain: 'x.com:443',
      outboundTag: 'direct',
      outboundType: 'direct',
      reasonLabel: 'possible_gfw_or_path_timeout',
    });
    store.ingest({
      occurredAt: now,
      domain: 'x.com',
      outboundTag: 'proxy',
      outboundType: 'proxy',
      reasonLabel: 'possible_site_restriction_or_refused',
    });

    const all = store.list({ limit: 20 });
    expect(all.length).toBe(2);
    expect(all.some((item) => item.domain === 'x.com' && item.outboundType === 'direct')).toBe(true);
    expect(all.some((item) => item.domain === 'x.com' && item.outboundType === 'proxy')).toBe(true);
  });

  it('filters by outboundType and window', () => {
    const store = new FailedDomainStore();
    const recent = new Date().toISOString();
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    store.ingest({
      occurredAt: old,
      domain: 'old.example.com',
      outboundType: 'proxy',
      reasonLabel: 'timeout',
    });
    store.ingest({
      occurredAt: recent,
      domain: 'new.example.com',
      outboundType: 'direct',
      reasonLabel: 'timeout',
    });

    const direct = store.list({ outboundType: 'direct', window: '24h', limit: 20 });
    expect(direct.length).toBe(1);
    expect(direct[0].domain).toBe('new.example.com');
    expect(direct[0].outboundType).toBe('direct');
  });

  it('rejects empty domain', () => {
    const store = new FailedDomainStore();
    expect(() =>
      store.ingest({
        domain: '   ',
      }),
    ).toThrowError('missing_domain');
  });
});
