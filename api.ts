
import { DomainRule, ProxyNode, RoutingRule, DnsUpstream, HostsEntry, ConfigVersion, UnifiedProfile, User } from './types';
import { QualityObservability, normalizeObservabilityResponse } from './utils/quality';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const QUALITY_MOCK_FALLBACK = import.meta.env.VITE_QUALITY_MOCK_FALLBACK !== 'false';
const DEFAULT_SUBSCRIPTION_PATH = '/api/v1/client/subscribe?token=u1-alice-7f8a9d2b';

const resolveSubscriptionUrl = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${DEFAULT_SUBSCRIPTION_PATH}`;
  }
  return `https://beforeve.com${DEFAULT_SUBSCRIPTION_PATH}`;
};

const fetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
};


// Mock initial JSON content
const INITIAL_PROFILE_JSON = `{
  "log": {
    "level": "info",
    "timestamp": true
  },
  "dns": {
    "servers": [
      {
        "tag": "google",
        "address": "tls://8.8.8.8",
        "strategy": "prefer_ipv4"
      },
      {
        "tag": "local",
        "address": "223.5.5.5",
        "detour": "direct"
      }
    ],
    "rules": [
      { "outbound": "any", "server": "local" },
      { "clash_mode": "Direct", "server": "local" },
      { "clash_mode": "Global", "server": "google" },
      { "geosite": "cn", "server": "local" },
      { "geosite": "geolocation-!cn", "server": "google" }
    ]
  },
  "inbounds": [
    {
      "type": "mixed",
      "tag": "mixed-in",
      "listen": "::",
      "listen_port": 7890,
      "sniff": true
    }
  ],
  "outbounds": [
    {
      "type": "selector",
      "tag": "proxy",
      "outbounds": ["auto", "direct"]
    },
    {
      "type": "urltest",
      "tag": "auto",
      "outbounds": ["hk-01", "sg-01"],
      "url": "https://www.gstatic.com/generate_204",
      "interval": "10m"
    },
    {
      "type": "direct",
      "tag": "direct"
    }
  ],
  "route": {
    "rules": [
      { "protocol": "dns", "outbound": "dns-out" },
      { "geosite": "cn", "geoip": "cn", "outbound": "direct" },
      { "geosite": "category-ads-all", "outbound": "block" }
    ],
    "auto_detect_interface": true
  }
}`;

// Updated to a subscription-style URL structure
// This implies a unique, secure token for the user 'alice_dev'
let mockProfileData: UnifiedProfile = {
  content: INITIAL_PROFILE_JSON,
  publicUrl: resolveSubscriptionUrl(),
  lastUpdated: "2023-10-27 15:30:00",
  size: "2.4 KB"
};

const mockQualityObservabilityPayload = {
  window: '24h',
  updatedAt: new Date().toISOString(),
  stability: {
    points: Array.from({ length: 24 }).map((_, idx) => ({
      timestamp: new Date(Date.now() - (23 - idx) * 60 * 60 * 1000).toISOString(),
      total: 800 + Math.floor(Math.random() * 300),
      successRate: 97 + Math.random() * 2.5,
      errorRate: 0.3 + Math.random() * 1.2,
      p95LatencyMs: 120 + Math.floor(Math.random() * 120),
    })),
    totalRequests: 24000,
    avgSuccessRate: 98.4,
  },
  topDomains: [
    { domain: 'api.beforeve.com', count: 4321, category: 'key' },
    { domain: 'chat.beforeve.com', count: 3210, category: 'key' },
    { domain: 'cdn.beforeve.com', count: 2890, category: 'key' },
    { domain: 'updates.beforeve.com', count: 1880, category: 'key' },
  ],
  failureReasons: [
    { code: 'DNS_TIMEOUT', count: 38, ratio: 0.22 },
    { code: 'CONNECT_TIMEOUT', count: 29, ratio: 0.17 },
    { code: 'TLS_HANDSHAKE', count: 18, ratio: 0.10 },
    { code: 'RATE_LIMITED', count: 11, ratio: 0.06 },
  ],
};

const mockUsers: User[] = [
  {
    id: 'u1',
    username: 'alice_dev',
    email: 'alice@company.com',
    status: 'active',
    traffic: {
      upload: 1024 * 1024 * 450, // 450 MB
      download: 1024 * 1024 * 1024 * 5.2, // 5.2 GB
      total: 1024 * 1024 * 1024 * 5.65
    },
    devices: [
      { id: 'd1', name: 'MacBook Pro', ip: '192.168.1.101', os: 'macOS 14.2', appVersion: '1.8.0', lastSeen: '2 mins ago', location: 'Hong Kong, CN' },
      { id: 'd2', name: 'iPhone 15', ip: '192.168.1.102', os: 'iOS 17.3', appVersion: '1.7.9', lastSeen: '4 hours ago', location: 'Tokyo, JP' }
    ],
    lastOnline: '2 mins ago',
    created: '2023-09-01',
    logs: {
      totalRequests: 14520,
      successRate: 98.2,
      topAllowed: [
        { domain: 'github.com', count: 1240 },
        { domain: 'google.com', count: 980 },
        { domain: 'stackoverflow.com', count: 450 },
        { domain: 'youtube.com', count: 320 }
      ],
      topBlocked: [
        { domain: 'analytics.google.com', count: 210 },
        { domain: 'doubleclick.net', count: 150 },
        { domain: 'facebook.com', count: 45 }
      ]
    }
  },
  {
    id: 'u2',
    username: 'bob_sales',
    email: 'bob@company.com',
    status: 'active',
    traffic: {
      upload: 1024 * 1024 * 120, // 120 MB
      download: 1024 * 1024 * 890, // 890 MB
      total: 1024 * 1024 * 1010
    },
    devices: [
      { id: 'd3', name: 'Windows Workstation', ip: '192.168.1.105', os: 'Windows 11', appVersion: '1.7.8', lastSeen: '1 day ago', location: 'New York, US' }
    ],
    lastOnline: '1 day ago',
    created: '2023-10-15',
    logs: {
      totalRequests: 2100,
      successRate: 95.5,
      topAllowed: [
        { domain: 'salesforce.com', count: 800 },
        { domain: 'linkedin.com', count: 400 }
      ],
      topBlocked: [
        { domain: 'netflix.com', count: 50 },
        { domain: 'tiktok.com', count: 20 }
      ]
    }
  },
  {
    id: 'u3',
    username: 'guest_01',
    email: 'guest@temp.com',
    status: 'expired',
    traffic: {
      upload: 1024 * 1024 * 10,
      download: 1024 * 1024 * 50,
      total: 1024 * 1024 * 60
    },
    devices: [],
    lastOnline: '2 weeks ago',
    created: '2023-10-01',
    logs: {
      totalRequests: 150,
      successRate: 90.0,
      topAllowed: [{ domain: 'google.com', count: 50 }],
      topBlocked: []
    }
  }
];

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
  },

  getUnifiedProfile: async (): Promise<UnifiedProfile> => {
    await sleep(200);
    try {
      const remote = await fetchJson<UnifiedProfile>('/api/v1/client/profile');
      mockProfileData = { ...remote };
      return remote;
    } catch {
      return { ...mockProfileData };
    }
  },

  saveUnifiedProfile: async (payload: { content: string; publicUrl?: string }): Promise<UnifiedProfile> => {
    await sleep(300);
    try {
      const remote = await fetchJson<UnifiedProfile>('/api/v1/client/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      mockProfileData = { ...remote };
      return remote;
    } catch {
      mockProfileData = {
        ...mockProfileData,
        content: payload.content,
        publicUrl: payload.publicUrl?.trim() || mockProfileData.publicUrl,
        lastUpdated: new Date().toLocaleString(),
        size: (new Blob([payload.content]).size / 1024).toFixed(1) + " KB"
      };
      return mockProfileData;
    }
  },

  getUsers: async (): Promise<User[]> => {
    await sleep(600);
    return [...mockUsers];
  },

  getUser: async (id: string): Promise<User | undefined> => {
    await sleep(400);
    return mockUsers.find(u => u.id === id);
  }
};

export const qualityApi = {
  getObservability: async (params: { window?: string; topN?: number; bucket?: string } = {}): Promise<QualityObservability> => {
    const search = new URLSearchParams();
    if (params.window) search.set('window', params.window);
    if (params.topN) search.set('topN', String(params.topN));
    if (params.bucket) search.set('bucket', params.bucket);
    const query = search.toString();

    try {
      const payload = await fetchJson<unknown>(`/api/quality/observability${query ? `?${query}` : ''}`);
      return normalizeObservabilityResponse(payload);
    } catch (error) {
      if (QUALITY_MOCK_FALLBACK) {
        console.warn('[qualityApi] falling back to mock observability payload:', error);
        return normalizeObservabilityResponse(mockQualityObservabilityPayload);
      }
      throw error;
    }
  },
};
