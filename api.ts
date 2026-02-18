
import { DomainRule, ProxyNode, RoutingRule, DnsUpstream, HostsEntry, ConfigVersion } from './types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mockApi = {
  getDomains: async (): Promise<DomainRule[]> => {
    await sleep(500);
    return [
      { id: '1', type: 'suffix', value: 'google.com', group: 'G-Services', action: 'PROXY', priority: 10, enabled: true, note: 'Primary search' },
      { id: '2', type: 'exact', value: 'baidu.com', group: 'CN', action: 'DIRECT', priority: 5, enabled: true },
      { id: '3', type: 'regex', value: '.*\\.ads\\.com', group: 'Adblock', action: 'BLOCK', priority: 100, enabled: true },
    ];
  },

  getProxies: async (): Promise<ProxyNode[]> => {
    await sleep(600);
    return [
      { id: 'p1', name: 'HK-Azure-01', protocol: 'VLESS', address: 'hk1.node.com', port: 443, tags: ['High Speed', 'HK'], latency: 45, lastChecked: '2 min ago', enabled: true },
      { id: 'p2', name: 'US-GCP-05', protocol: 'Shadowsocks', address: 'us5.node.com', port: 8388, tags: ['US'], latency: 160, lastChecked: '5 min ago', enabled: true },
      { id: 'p3', name: 'JP-AWS-02', protocol: 'Trojan', address: 'jp2.node.com', port: 443, tags: ['Gaming'], latency: 32, lastChecked: '1 min ago', enabled: false },
    ];
  },

  getRouting: async (): Promise<RoutingRule[]> => {
    await sleep(400);
    return [
      { id: 'r1', matchType: 'geosite', matchExpr: 'category-ads-all', outbound: 'block', enabled: true, priority: 1 },
      { id: 'r2', matchType: 'geosite', matchExpr: 'google', outbound: 'ProxyGroup', enabled: true, priority: 10 },
      { id: 'r3', matchType: 'geoip', matchExpr: 'cn', outbound: 'direct', enabled: true, priority: 20 },
    ];
  },

  getDns: async (): Promise<DnsUpstream[]> => {
    await sleep(300);
    return [
      { id: 'd1', name: 'Google DNS', type: 'doh', address: 'https://8.8.8.8/dns-query', strategy: 'prefer_ipv4', enabled: true },
      { id: 'd2', name: 'Cloudflare', type: 'dot', address: '1.1.1.1', detour: 'ProxyGroup', strategy: 'prefer_ipv4', enabled: true },
    ];
  },

  getHosts: async (): Promise<HostsEntry[]> => {
    await sleep(300);
    return [
      { id: 'h1', hostname: 'my-nas.local', ip: '192.168.1.100', group: 'Local', enabled: true, note: 'Home Server' },
      { id: 'h2', hostname: 'test.dev', ip: '127.0.0.1', group: 'Dev', enabled: true },
    ];
  },

  getVersions: async (): Promise<ConfigVersion[]> => {
    await sleep(500);
    return [
      { id: 'v3', version: 'v1.2.4', timestamp: '2023-10-27 14:20', author: 'Admin', summary: 'Added Netflix rules', content: '{ "outbounds": [...] }' },
      { id: 'v2', version: 'v1.2.3', timestamp: '2023-10-26 10:15', author: 'Admin', summary: 'Initial setup', content: '{ "outbounds": [] }' },
    ];
  }
};
