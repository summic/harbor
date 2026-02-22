
export type RuleType = 'exact' | 'suffix' | 'wildcard' | 'regex';
export type ActionType = 'DIRECT' | 'PROXY' | 'BLOCK';
export type ProtocolType = 'Shadowsocks' | 'VLESS' | 'VMess' | 'Trojan' | 'Hysteria2' | 'TUIC' | 'WireGuard' | 'Direct' | 'Block' | 'DNS' | 'Selector' | 'URLTest';
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

export interface ProxyGroup {
  id: string;
  name: string;
  type: OutboundType;
  outbounds: string[];
  defaultOutbound?: string;
  url?: string;
  interval?: string;
}

export interface RoutingRule {
  id: string;
  matchType: 'domain' | 'ip' | 'geosite' | 'geoip' | 'port' | 'process' | 'rule_set' | 'protocol' | 'action' | 'ip_private';
  matchExpr: string;
  outbound: string;
  enabled: boolean;
  priority: number;
}

export interface DnsUpstream {
  id: string;
  name: string;
  type: 'doh' | 'dot' | 'udp' | 'hosts' | 'local' | 'tls';
  address: string;
  detour?: string;
  strategy: 'ipv4_only' | 'ipv6_only' | 'prefer_ipv4' | 'prefer_ipv6' | 'auto';
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

export interface TrafficSimulationMatch {
  index: number;
  summary: string;
  outbound?: string;
  action?: string;
}

export interface TrafficSimulationResult {
  input: {
    target: string;
    protocol: string;
    port?: number;
  };
  normalized: {
    domain?: string;
    ip?: string;
  };
  dns: {
    selectedServer: string;
    matchedRule?: string;
  };
  route: {
    finalOutbound: string;
    matchedRules: TrafficSimulationMatch[];
    actions: TrafficSimulationMatch[];
    usedFinalFallback: boolean;
  };
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
  topDirect: { domain: string; count: number }[];
  topBlocked: { domain: string; count: number }[];
}

export interface UserTargetAggregate {
  target: string;
  requests: number;
  uploadBytes: number;
  downloadBytes: number;
  blockedRequests: number;
  successRate: number;
  lastSeen: string;
}

export interface UserTargetDetail {
  target: string;
  requests: number;
  uploadBytes: number;
  downloadBytes: number;
  blockedRequests: number;
  successRate: number;
  lastSeen: string;
  outboundTypes: Array<{ type: string; count: number }>;
  recent: Array<{
    occurredAt: string;
    outboundType: string;
    networkType: string | null;
    requestCount: number;
    successCount: number;
    blockedCount: number;
    uploadBytes: number;
    downloadBytes: number;
    error: string | null;
  }>;
}

export interface User {
  id: string;
  username: string;
  displayName?: string;
  email: string;
  avatarUrl?: string;
  status: 'active' | 'disabled' | 'expired';
  traffic: TrafficStats;
  devices: UserDevice[];
  lastOnline: string;
  logs: AccessLogSummary;
  created: string;
}

export interface ClientDeviceReport {
  id: string;
  name?: string;
  model?: string;
  osName?: string;
  osVersion?: string;
  appVersion?: string;
  ip?: string;
  location?: string;
}

export interface ClientDeviceReportPayload {
  occurredAt?: string;
  connected?: boolean;
  networkType?: string;
  device?: ClientDeviceReport;
  metadata?: Record<string, unknown>;
}

export interface ClientConnectionReportPayload {
  occurredAt?: string;
  connected?: boolean;
  target?: string;
  outboundType?: string;
  latencyMs?: number;
  error?: string;
  networkType?: string;
  requestCount?: number;
  successCount?: number;
  blockedCount?: number;
  uploadBytes?: number;
  downloadBytes?: number;
  device?: ClientDeviceReport;
  metadata?: Record<string, unknown>;
}
