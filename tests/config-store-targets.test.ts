import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigStore } from '../dev-server/config-store';

const createStore = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-config-targets-'));
  const dbPath = path.join(root, 'config.db');
  const legacyPath = path.join(root, 'legacy-profile.json');
  const store = new ConfigStore({
    dbPath,
    legacyProfilePath: legacyPath,
    seedProfile: {
      log: { disabled: false, level: 'info' },
      inbounds: [],
      outbounds: [{ type: 'direct', tag: 'direct' }],
      dns: { final: 'dns_direct', servers: [], rules: [] },
      route: { final: 'direct', rules: [] },
    },
  });
  return { root, store };
};

describe('ConfigStore target aggregation and details', () => {
  const fixtures = new Set<string>();

  afterEach(() => {
    fixtures.forEach((root) => {
      if (fs.existsSync(root)) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
    fixtures.clear();
  });

  it('aggregates target stats and derives policy by highest request count', () => {
    const { root, store } = createStore();
    fixtures.add(root);
    const userId = 'u-target-agg';
    const base = Date.parse('2026-02-23T10:00:00.000Z');

    store.ingestClientConnectionLog(userId, {
      occurredAt: new Date(base + 1000).toISOString(),
      target: 'api.example.com',
      outboundType: 'proxy',
      requestCount: 20,
      successCount: 20,
      uploadBytes: 2000,
      downloadBytes: 8000,
    });
    store.ingestClientConnectionLog(userId, {
      occurredAt: new Date(base + 2000).toISOString(),
      target: 'api.example.com',
      outboundType: 'direct',
      requestCount: 5,
      successCount: 5,
      uploadBytes: 500,
      downloadBytes: 1000,
    });
    store.ingestClientConnectionLog(userId, {
      occurredAt: new Date(base + 3000).toISOString(),
      target: 'api.example.com',
      outboundType: 'block',
      requestCount: 10,
      blockedCount: 10,
      successCount: 0,
      uploadBytes: 100,
      downloadBytes: 100,
    });
    store.ingestClientConnectionLog(userId, {
      occurredAt: new Date(base + 4000).toISOString(),
      target: 'api.example.com',
      outboundType: 'dns',
      requestCount: 2,
      successCount: 0,
      error: 'dns resolution failed',
      uploadBytes: 20,
      downloadBytes: 40,
    });

    const rows = store.listUserTargetAggregates(userId);
    const agg = rows.find((item) => item.target === 'api.example.com');
    expect(agg).toBeDefined();
    expect(agg?.policy).toBe('proxy');
    expect(agg?.requests).toBe(37);
    expect(agg?.blockedRequests).toBe(10);
    expect(agg?.uploadBytes).toBe(2620);
    expect(agg?.downloadBytes).toBe(9140);
    expect(agg?.successRate).toBeCloseTo(67.57, 2);
  });

  it('falls back to metadata outbound type and normalizes empty target to unknown', () => {
    const { root, store } = createStore();
    fixtures.add(root);
    const userId = 'u-target-metadata';

    store.ingestClientConnectionLog(userId, {
      target: '   ',
      outboundType: '',
      requestCount: 3,
      successCount: 3,
      metadata: { outbound_type: 'Direct' },
    });

    const rows = store.listUserTargetAggregates(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].target).toBe('(unknown)');
    expect(rows[0].policy).toBe('direct');
  });

  it('returns detail records in descending occurredAt order and includes outbound breakdown', () => {
    const { root, store } = createStore();
    fixtures.add(root);
    const userId = 'u-target-detail';
    const t1 = '2026-02-23T10:00:00.000Z';
    const t2 = '2026-02-23T10:01:00.000Z';
    const t3 = '2026-02-23T10:02:00.000Z';

    store.ingestClientConnectionLog(userId, {
      occurredAt: t1,
      target: 'cdn.example.com',
      outboundType: 'proxy',
      requestCount: 3,
      successCount: 3,
      networkType: 'wifi',
      uploadBytes: 300,
      downloadBytes: 900,
    });
    store.ingestClientConnectionLog(userId, {
      occurredAt: t2,
      target: 'cdn.example.com',
      outboundType: 'proxy',
      requestCount: 2,
      successCount: 2,
      networkType: '5G',
      uploadBytes: 200,
      downloadBytes: 500,
    });
    store.ingestClientConnectionLog(userId, {
      occurredAt: t3,
      target: 'cdn.example.com',
      outboundType: 'direct',
      requestCount: 1,
      successCount: 1,
      networkType: 'wifi',
      uploadBytes: 50,
      downloadBytes: 120,
    });

    const detail = store.getUserTargetDetail(userId, 'cdn.example.com');
    expect(detail).toBeDefined();
    expect(detail?.requests).toBe(6);
    expect(detail?.lastSeen).toBe(t3);
    expect(detail?.outboundTypes[0]).toEqual({ type: 'proxy', count: 2 });
    expect(detail?.outboundTypes[1]).toEqual({ type: 'direct', count: 1 });
    expect(detail?.recent[0].occurredAt).toBe(t3);
    expect(detail?.recent[1].occurredAt).toBe(t2);
    expect(detail?.recent[2].occurredAt).toBe(t1);
  });

  it('returns undefined for unknown target details', () => {
    const { root, store } = createStore();
    fixtures.add(root);
    const userId = 'u-target-empty';
    store.ingestClientConnectionLog(userId, {
      target: 'known.example.com',
      outboundType: 'direct',
      requestCount: 1,
      successCount: 1,
    });

    const detail = store.getUserTargetDetail(userId, 'unknown.example.com');
    expect(detail).toBeUndefined();
  });
});
