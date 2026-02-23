import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigStore } from '../dev-server/config-store';

const createStore = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-config-observability-'));
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

const makeProfileWithRouting = () => ({
  log: { disabled: false, level: 'info', timestamp: true },
  inbounds: [{ type: 'tun', tag: 'tun-in', address: ['172.19.0.1/30'], auto_route: true, strict_route: true, stack: 'mixed' }],
  outbounds: [
    { type: 'direct', tag: 'direct' },
    { type: 'block', tag: 'block' },
    { type: 'dns', tag: 'dns-out' },
    { type: 'shadowsocks', tag: 'proxy-hk', server: '1.1.1.1', server_port: 443, method: 'chacha20-ietf-poly1305', password: 'p' },
    { type: 'selector', tag: 'proxy', outbounds: ['proxy-hk'], default: 'proxy-hk' },
  ],
  dns: {
    final: 'dns_proxy',
    servers: [
      { type: 'tls', tag: 'dns_proxy', server: '8.8.8.8', server_port: 853, detour: 'proxy' },
      { type: 'local', tag: 'dns_direct' },
    ],
    rules: [
      { domain: ['example-proxy.com'], server: 'dns_proxy' },
      { domain: ['example-direct.com'], server: 'dns_direct' },
    ],
  },
  route: {
    final: 'direct',
    rules: [
      { protocol: 'dns', action: 'hijack-dns' },
      { domain: ['example-proxy.com'], outbound: 'proxy' },
      { domain: ['example-block.com'], outbound: 'block' },
      { ip_is_private: true, outbound: 'direct' },
    ],
    rule_set: [],
  },
});

describe('ConfigStore observability path', () => {
  const fixtures = new Set<string>();

  afterEach(() => {
    fixtures.forEach((root) => {
      if (fs.existsSync(root)) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
    fixtures.clear();
  });

  it('aggregates failed domains with metadata host fallback for ip targets', () => {
    const { root, store } = createStore();
    fixtures.add(root);
    const userId = 'u-failure';
    const now = new Date().toISOString();

    store.ingestClientConnectionLog(userId, {
      occurredAt: now,
      target: '199.232.148.158:443',
      outboundType: 'proxy',
      requestCount: 3,
      successCount: 0,
      error: 'dial tcp: i/o timeout',
      metadata: { domain: 'video.twimg.com' },
    });
    store.ingestClientConnectionLog(userId, {
      occurredAt: now,
      target: 'ok.example.com',
      outboundType: 'direct',
      requestCount: 2,
      successCount: 2,
    });

    const items = store.listFailedDomains({ userId, limit: 20 });
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].domain).toBe('video.twimg.com');
    expect(items[0].failures).toBe(3);
    expect(items[0].outboundType).toBe('proxy');
  });

  it('computes quality observability totals, top domains and canonical failure reasons', () => {
    const { root, store } = createStore();
    fixtures.add(root);
    const userId = 'u-quality';
    const base = Date.now();

    store.ingestClientConnectionLog(userId, {
      occurredAt: new Date(base - 5 * 60_000).toISOString(),
      target: 'stable.example.com',
      outboundType: 'proxy',
      requestCount: 10,
      successCount: 10,
      latencyMs: 100,
      downloadBytes: 1000,
      uploadBytes: 200,
    });
    store.ingestClientConnectionLog(userId, {
      occurredAt: new Date(base - 4 * 60_000).toISOString(),
      target: 'blocked.example.com',
      outboundType: 'block',
      requestCount: 5,
      blockedCount: 5,
      successCount: 0,
      error: 'blocked by policy',
      latencyMs: 20,
    });
    store.ingestClientConnectionLog(userId, {
      occurredAt: new Date(base - 3 * 60_000).toISOString(),
      target: 'timeout.example.com',
      outboundType: 'direct',
      requestCount: 4,
      successCount: 0,
      error: 'dial tcp: i/o timeout',
      latencyMs: 300,
    });

    const result = store.getQualityObservability({ window: '1h', topN: 5, bucket: '5m' });
    expect(result.stability.totalRequests).toBe(19);
    expect(result.stability.avgSuccessRate).toBeCloseTo(52.63, 2);
    expect(result.topDomains[0].domain).toBe('stable.example.com');
    expect(result.topDomains[0].policy).toBe('proxy');
    const failureCodes = result.failureReasons.map((item) => item.code);
    expect(failureCodes).toContain('BLOCKED_POLICY');
    expect(failureCodes).toContain('CONNECT_TIMEOUT');
  });

  it('dashboard traffic counts only proxy bytes and includes config revision', () => {
    const { root, store } = createStore();
    fixtures.add(root);
    const userId = 'u-dashboard';
    const profile = makeProfileWithRouting();
    store.saveUnifiedProfile(JSON.stringify(profile));
    const now = new Date().toISOString();

    store.ingestClientConnectionLog(userId, {
      occurredAt: now,
      target: 'proxy.example.com',
      outboundType: 'proxy',
      requestCount: 1,
      successCount: 1,
      uploadBytes: 500,
      downloadBytes: 1500,
      device: { id: 'ios-1', name: 'iPhone' },
    });
    store.ingestClientConnectionLog(userId, {
      occurredAt: now,
      target: 'direct.example.com',
      outboundType: 'direct',
      requestCount: 1,
      successCount: 1,
      uploadBytes: 9999,
      downloadBytes: 9999,
      device: { id: 'ios-1', name: 'iPhone' },
    });
    store.ingestApiRequestLog({
      path: '/api/v1/client/subscribe',
      method: 'GET',
      statusCode: 200,
      userId,
      occurredAt: now,
    });

    const summary = store.getDashboardSummary();
    const uploadSum = summary.traffic.uploadSeries.reduce((acc, item) => acc + item, 0);
    const downloadSum = summary.traffic.downloadSeries.reduce((acc, item) => acc + item, 0);
    const syncSum = summary.syncRequests.series.reduce((acc, item) => acc + item, 0);

    expect(uploadSum).toBe(500);
    expect(downloadSum).toBe(1500);
    expect(syncSum).toBeGreaterThanOrEqual(1);
    expect(summary.stats.configVersion).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(summary.stats.activeNodes).toBeGreaterThanOrEqual(1);
  });

  it('simulates dns and route hit with explicit profile rules', () => {
    const { root, store } = createStore();
    fixtures.add(root);
    store.saveUnifiedProfile(JSON.stringify(makeProfileWithRouting()));

    const result = store.simulateTraffic({
      target: 'https://example-proxy.com/path',
      protocol: 'tcp',
      port: 443,
    });

    expect(result.normalized.domain).toBe('example-proxy.com');
    expect(result.dns.selectedServer).toBe('dns_proxy');
    expect(result.route.finalOutbound).toBe('proxy');
    expect(result.route.usedFinalFallback).toBe(false);
    expect(result.route.matchedRules.length).toBeGreaterThan(0);
  });
});
