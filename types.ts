
export type RuleType = 'exact' | 'suffix' | 'wildcard' | 'regex';
export type ActionType = 'DIRECT' | 'PROXY' | 'BLOCK';
export type ProtocolType = 'Shadowsocks' | 'VLESS' | 'VMess' | 'Trojan' | 'Hysteria2' | 'TUIC' | 'WireGuard';
export type OutboundType = 'manual' | 'urltest' | 'fallback';

export interface DomainRule {
  id: string;
  type: RuleType;
  value: string;
  group: string;
  action: ActionType;
  priority: number;
  enabled: boolean;
  note?: string;
}

export interface ProxyNode {
  id: string;
  name: string;
  protocol: ProtocolType;
  address: string;
  port: number;
  tags: string[];
  latency?: number;
  lastChecked?: string;
  enabled: boolean;
}

export interface RoutingRule {
  id: string;
  matchType: 'domain' | 'ip' | 'geosite' | 'geoip' | 'port' | 'process';
  matchExpr: string;
  outbound: string;
  enabled: boolean;
  priority: number;
}

export interface DnsUpstream {
  id: string;
  name: string;
  type: 'doh' | 'dot' | 'udp';
  address: string;
  detour?: string;
  strategy: 'ipv4_only' | 'ipv6_only' | 'prefer_ipv4' | 'prefer_ipv6';
  enabled: boolean;
}

export interface HostsEntry {
  id: string;
  hostname: string;
  ip: string;
  group: string;
  enabled: boolean;
  note?: string;
}

export interface ConfigVersion {
  id: string;
  version: string;
  timestamp: string;
  author: string;
  summary: string;
  content: string;
}

export interface UnifiedProfile {
  content: string;
  publicUrl: string;
  lastUpdated: string;
  size: string;
}

// --- User Management Types ---

export interface UserDevice {
  id: string;
  name: string;
  ip: string;
  os: string;
  appVersion: string;
  lastSeen: string;
  location?: string;
}

export interface TrafficStats {
  upload: number; // bytes
  download: number; // bytes
  total: number; // bytes
}

export interface AccessLogSummary {
  totalRequests: number;
  successRate: number; // percentage
  topAllowed: { domain: string; count: number }[];
  topBlocked: { domain: string; count: number }[];
}

export interface User {
  id: string;
  username: string;
  email: string;
  status: 'active' | 'disabled' | 'expired';
  traffic: TrafficStats;
  devices: UserDevice[];
  lastOnline: string;
  logs: AccessLogSummary;
  created: string;
}
