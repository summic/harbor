
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
