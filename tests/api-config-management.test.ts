import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => {
  return {
    clearSession: vi.fn(),
    loadSession: vi.fn(() => ({
      user: { sub: 'u-admin' },
      accessToken: 'token-1',
      tokenType: 'Bearer',
    })),
    resolveActiveSession: vi.fn(async () => ({
      accessToken: 'token-1',
      tokenType: 'Bearer',
      user: { sub: 'u-admin' },
    })),
  };
});

vi.mock('../auth', () => ({
  clearSession: authMocks.clearSession,
  loadSession: authMocks.loadSession,
  resolveActiveSession: authMocks.resolveActiveSession,
}));

type Json = Record<string, unknown>;

const profilePayload = () => ({
  content: JSON.stringify({
    log: { disabled: false, level: 'info', output: 'app.log', timestamp: true },
    ntp: { enabled: true, server: 'time.apple.com', server_port: 123, interval: '30m', detour: 'direct', domain_resolver: 'dns_direct' },
    inbounds: [{ type: 'tun', tag: 'tun-in', address: ['172.19.0.1/30'], auto_route: true, strict_route: true, stack: 'mixed' }],
    outbounds: [
      { type: 'direct', tag: 'direct' },
      { type: 'block', tag: 'block' },
      { type: 'dns', tag: 'dns-out' },
      { type: 'shadowsocks', tag: 'GZ-Ucloud', server: '106.75.138.153', server_port: 443, method: 'chacha20-ietf-poly1305', password: 'x' },
      { type: 'urltest', tag: 'AUTO', outbounds: ['GZ-Ucloud'], url: 'https://www.gstatic.com/generate_204', interval: '3m' },
      { type: 'selector', tag: 'proxy', outbounds: ['AUTO'], default: 'AUTO' },
    ],
    dns: {
      final: 'dns_proxy',
      strategy: 'prefer_ipv4',
      independent_cache: true,
      servers: [
        { type: 'hosts', tag: 'dns_hosts', predefined: { 'chat-staging.beforeve.com': '192.168.1.123' } },
        { type: 'tls', tag: 'dns_proxy', server: '8.8.8.8', server_port: 853, detour: 'proxy' },
        { type: 'local', tag: 'dns_direct' },
      ],
      rules: [{ rule_set: ['kn-system'], server: 'dns_direct' }],
    },
    route: {
      final: 'proxy',
      auto_detect_interface: false,
      default_domain_resolver: 'dns_direct',
      rule_set: [
        {
          type: 'inline',
          tag: 'kn-system',
          rules: [{ domain_suffix: ['kuainiu.chat'] }],
        },
      ],
      rules: [
        { action: 'sniff' },
        { protocol: 'dns', action: 'hijack-dns' },
        { rule_set: ['kn-system'], outbound: 'proxy' },
        { ip_is_private: true, outbound: 'direct' },
      ],
    },
  }),
  publicUrl: 'http://localhost:5173/api/v1/client/subscribe?token=t1',
  lastUpdated: new Date().toISOString(),
  size: '3.2 KB',
});

const simulateResult = {
  input: { target: 'example.com', protocol: 'tcp', port: 443 },
  normalized: { domain: 'example.com' },
  dns: { selectedServer: 'dns_proxy', matchedRule: 'rule #1' },
  route: { finalOutbound: 'proxy', matchedRules: [], actions: [], usedFinalFallback: false },
};

const createFetchBackend = () => {
  const rulesWrites: Array<{ module?: string; payload?: Json }> = [];
  const handler = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl, 'http://localhost:5173');
    const method = (init?.method || 'GET').toUpperCase();

    if (url.pathname === '/api/v1/client/profile') {
      if (method === 'GET') {
        return new Response(JSON.stringify(profilePayload()), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'PUT') {
        return new Response(JSON.stringify(profilePayload()), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (url.pathname === '/api/v1/rules') {
      if (method === 'GET') {
        return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'POST') {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        rulesWrites.push({ module: body.module, payload: body.payload });
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'DELETE') {
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (url.pathname === '/api/v1/proxies/latency' && method === 'POST') {
      return new Response(JSON.stringify([{ id: 'proxy:GZ-Ucloud', latency: 88, checkedAt: '10:00' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/api/v1/simulate/traffic' && method === 'POST') {
      return new Response(JSON.stringify(simulateResult), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/api/v1/auth/sync-user' && method === 'POST') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return { handler, rulesWrites };
};

describe('api config management flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads config-backed resources and latency/simulation endpoints', async () => {
    const backend = createFetchBackend();
    vi.stubGlobal('fetch', backend.handler);

    const { mockApi } = await import('../api');
    const domains = await mockApi.getDomains();
    const groups = await mockApi.getDomainGroups();
    const proxies = await mockApi.getProxies();
    const proxyGroups = await mockApi.getProxyGroups();
    const routing = await mockApi.getRouting();
    const dns = await mockApi.getDns();
    const hosts = await mockApi.getHosts();
    const settings = await mockApi.getSettings();
    const tags = await mockApi.getOutboundTags();
    const latency = await mockApi.checkProxiesLatency();
    const simulation = await mockApi.simulateTraffic({ target: 'example.com', protocol: 'tcp', port: 443 });

    expect(domains.length).toBeGreaterThan(0);
    expect(groups.some((g) => g.name === 'kn-system')).toBe(true);
    expect(proxies.some((p) => p.name === 'GZ-Ucloud')).toBe(true);
    expect(proxyGroups.some((g) => g.name === 'AUTO')).toBe(true);
    expect(routing.length).toBeGreaterThan(0);
    expect(dns.length).toBeGreaterThan(0);
    expect(hosts.some((h) => h.hostname === 'chat-staging.beforeve.com')).toBe(true);
    expect(settings.routeFinal).toBe('proxy');
    expect(tags).toContain('direct');
    expect(latency.some((n) => typeof n.latency === 'number')).toBe(true);
    expect(simulation.route.finalOutbound).toBe('proxy');
  });

  it('executes save/delete operations and pushes module writes', async () => {
    const backend = createFetchBackend();
    vi.stubGlobal('fetch', backend.handler);
    const { mockApi } = await import('../api');

    await mockApi.syncCurrentUserFromSession();
    await mockApi.saveDomainGroup({ name: 'new-group', action: 'PROXY', dnsServer: 'dns_proxy' });
    await mockApi.saveDomainRule({ type: 'domain_suffix', value: 'google.com', group: 'new-group', action: 'PROXY' });
    await mockApi.deleteDomainRule('domain:new-group:domain_suffix:google.com');
    await mockApi.saveProxyNode({ name: 'HK-1', protocol: 'Shadowsocks', address: '1.1.1.1', port: 443 });
    await mockApi.deleteProxyNode('proxy:HK-1');
    await mockApi.saveProxyGroup({ name: 'G-PROXY', type: 'manual', outbounds: ['GZ-Ucloud'], defaultOutbound: 'GZ-Ucloud' });
    await mockApi.saveRoutingRule({ matchType: 'domain', matchExpr: 'domain_suffix: twitter.com', outbound: 'proxy' });
    await mockApi.moveRoutingRule({ id: 'route-1', direction: 'down' });
    await mockApi.deleteRoutingRule('route-1');
    await mockApi.saveDnsServer({ name: 'dns_new', type: 'dot', address: '1.1.1.1:853', detour: 'proxy' });
    await mockApi.deleteDnsServer('dns:dns_new');
    await mockApi.saveHostEntry({ hostname: 'api.beforeve.com', ip: '192.168.1.2', group: 'dns_hosts' });
    await mockApi.deleteHostEntry('host:dns_hosts:api.beforeve.com');
    await mockApi.batchImportHosts('192.168.1.3 foo.local\n192.168.1.4 bar.local');
    await mockApi.saveSettings({
      logDisabled: false,
      logLevel: 'warn',
      logOutput: 'app.log',
      logTimestamp: true,
      ntpEnabled: true,
      ntpServer: 'time.apple.com',
      ntpServerPort: 123,
      ntpInterval: '30m',
      ntpDetour: 'direct',
      ntpDomainResolver: 'dns_direct',
      tunTag: 'tun-in',
      tunAddress: '172.19.0.1/30',
      tunAutoRoute: true,
      tunStrictRoute: true,
      tunStack: 'mixed',
      routeFinal: 'proxy',
      routeAutoDetectInterface: false,
      routeDefaultDomainResolver: 'dns_direct',
      dnsFinal: 'dns_proxy',
      dnsIndependentCache: true,
      dnsStrategy: 'prefer_ipv4',
    });

    expect(backend.rulesWrites.length).toBeGreaterThan(5);
    expect(backend.rulesWrites.some((w) => w.module === 'route.rules')).toBe(true);
    expect(backend.rulesWrites.some((w) => w.module === 'dns.servers')).toBe(true);
    expect(backend.rulesWrites.some((w) => w.module === 'outbounds')).toBe(true);
  });
});
