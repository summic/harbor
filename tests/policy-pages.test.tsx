import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const routeState = vi.hoisted(() => ({
  groupName: 'kn-system',
}));

const queryState = vi.hoisted(() => ({
  domains: [] as any[],
  proxies: [] as any[],
  proxyGroups: [] as any[],
  routing: [] as any[],
  dns: [] as any[],
  hosts: [] as any[],
}));

const queryClientState = vi.hoisted(() => ({
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  Navigate: ({ to }: { to: string }) => <div>Navigate:{to}</div>,
  useParams: () => ({ groupName: routeState.groupName }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[0];
    if (key === 'domains') return { data: queryState.domains, isLoading: false };
    if (key === 'proxies') return { data: queryState.proxies, isLoading: false };
    if (key === 'proxyGroups') return { data: queryState.proxyGroups, isLoading: false };
    if (key === 'routing') return { data: queryState.routing, isLoading: false };
    if (key === 'dns') return { data: queryState.dns, isLoading: false };
    if (key === 'hosts') return { data: queryState.hosts, isLoading: false };
    return { data: undefined, isLoading: false };
  },
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useQueryClient: () => queryClientState,
}));

vi.mock('../api', () => ({
  mockApi: {
    getDomains: vi.fn(),
    saveDomainRule: vi.fn(),
    deleteDomainRule: vi.fn(),
    getProxies: vi.fn(),
    getProxyGroups: vi.fn(),
    saveProxyNode: vi.fn(),
    saveProxyGroup: vi.fn(),
    deleteProxyNode: vi.fn(),
    checkProxiesLatency: vi.fn(),
    getRouting: vi.fn(),
    saveRoutingRule: vi.fn(),
    deleteRoutingRule: vi.fn(),
    moveRoutingRule: vi.fn(),
    getDns: vi.fn(),
    getHosts: vi.fn(),
    saveDnsServer: vi.fn(),
    deleteDnsServer: vi.fn(),
    saveHostEntry: vi.fn(),
    deleteHostEntry: vi.fn(),
    batchImportHosts: vi.fn(),
  },
}));

describe('Policy related pages render', () => {
  beforeEach(() => {
    routeState.groupName = 'kn-system';
    queryState.domains = [
      { id: 'd1', type: 'domain_suffix', value: 'kylith.com', group: 'kn-system', action: 'PROXY', priority: 10, enabled: true },
    ];
    queryState.proxies = [
      { id: 'p1', name: 'GZ-Ucloud', protocol: 'Shadowsocks', address: '1.1.1.1', port: 443, enabled: true, latency: 88, lastChecked: '10:00' },
    ];
    queryState.proxyGroups = [
      { id: 'g1', name: 'AUTO', type: 'urltest', outbounds: ['GZ-Ucloud'], defaultOutbound: 'GZ-Ucloud', url: 'https://www.gstatic.com/generate_204' },
    ];
    queryState.routing = [
      { id: 'route-1', matchType: 'rule_set', matchExpr: 'kn-system', outbound: 'proxy', enabled: true, priority: 1 },
    ];
    queryState.dns = [
      { id: 'dns:dns_proxy', name: 'dns_proxy', type: 'dot', address: '8.8.8.8:853', enabled: true },
    ];
    queryState.hosts = [
      { id: 'host:dns_hosts:chat-staging.beforeve.com', hostname: 'chat-staging.beforeve.com', ip: '192.168.1.123', group: 'dns_hosts', enabled: true },
    ];
  });

  it('renders domains page and list row', async () => {
    const { DomainsPage } = await import('../pages/Domains');
    const html = renderToStaticMarkup(<DomainsPage />);
    expect(html).toContain('Policy Rules');
    expect(html).toContain('Add Rule');
    expect(html).toContain('kylith.com');
  });

  it('renders domains empty state and redirect branch', async () => {
    queryState.domains = [];
    const { DomainsPage } = await import('../pages/Domains');
    const emptyHtml = renderToStaticMarkup(<DomainsPage />);
    expect(emptyHtml).toContain('No domain rules.');

    routeState.groupName = '';
    const redirectHtml = renderToStaticMarkup(<DomainsPage />);
    expect(redirectHtml).toContain('Navigate:/policy');
  });

  it('renders proxies page with nodes and groups', async () => {
    const { ProxiesPage } = await import('../pages/Proxies');
    const html = renderToStaticMarkup(<ProxiesPage />);
    expect(html).toContain('Proxies &amp; Groups');
    expect(html).toContain('Nodes List');
    expect(html).toContain('Auto Select Groups');
    expect(html).toContain('GZ-Ucloud');
    expect(html).toContain('Outbound Stats');
  });

  it('renders routing page cards', async () => {
    const { RoutingPage } = await import('../pages/Routing');
    const html = renderToStaticMarkup(<RoutingPage />);
    expect(html).toContain('Routing Policies');
    expect(html).toContain('Add Policy');
    expect(html).toContain('2xl:grid-cols-4');
    expect(html).toContain('kn-system');
  });

  it('renders dns/hosts page sections', async () => {
    const { DnsHostsPage } = await import('../pages/DnsHosts');
    const html = renderToStaticMarkup(<DnsHostsPage />);
    expect(html).toContain('DNS &amp; Hosts');
    expect(html).toContain('DNS Servers');
    expect(html).toContain('Local Hosts');
    expect(html).toContain('Batch Import Hosts');
    expect(html).toContain('chat-staging.beforeve.com');
  });
});
