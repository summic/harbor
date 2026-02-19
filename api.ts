
import { DomainRule, ProxyNode, RoutingRule, DnsUpstream, HostsEntry, ConfigVersion, UnifiedProfile, User, ProtocolType, TrafficSimulationResult } from './types';
import { QualityObservability, normalizeObservabilityResponse } from './utils/quality';
import { loadSession } from './auth';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const QUALITY_MOCK_FALLBACK = import.meta.env.VITE_QUALITY_MOCK_FALLBACK !== 'false';
const DEFAULT_SUBSCRIPTION_PATH = '/api/v1/client/subscribe?token=u1-alice-7f8a9d2b';
const SIMULATE_TRAFFIC_PATH = '/api/v1/simulate/traffic';
const PROXY_LATENCY_PATH = '/api/v1/proxies/latency';
const VERSIONS_PATH = '/api/v1/client/versions';
const PUBLISH_PATH = '/api/v1/client/publish';
const ROLLBACK_PATH = '/api/v1/client/rollback';

const resolveSubscriptionUrl = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${DEFAULT_SUBSCRIPTION_PATH}`;
  }
  return `https://beforeve.com${DEFAULT_SUBSCRIPTION_PATH}`;
};

const fetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const token = loadSession()?.accessToken;
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
};

type JsonObject = Record<string, any>;

const parseJsonObject = (content: string): JsonObject => {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      return parsed as JsonObject;
    }
  } catch {
    // no-op
  }
  return {};
};

const outboundToAction = (outbound?: string): DomainRule['action'] => {
  const v = (outbound ?? '').toLowerCase();
  if (v === 'direct') return 'DIRECT';
  if (v === 'block' || v === 'reject') return 'BLOCK';
  return 'PROXY';
};

const normalizeProtocol = (raw?: string): ProtocolType => {
  const v = (raw ?? '').toLowerCase();
  switch (v) {
    case 'shadowsocks':
      return 'Shadowsocks';
    case 'vless':
      return 'VLESS';
    case 'vmess':
      return 'VMess';
    case 'trojan':
      return 'Trojan';
    case 'hysteria2':
      return 'Hysteria2';
    case 'tuic':
      return 'TUIC';
    case 'wireguard':
      return 'WireGuard';
    case 'selector':
      return 'Selector';
    case 'urltest':
      return 'URLTest';
    case 'direct':
      return 'Direct';
    case 'block':
      return 'Block';
    case 'dns':
      return 'DNS';
    default:
      return 'Shadowsocks';
  }
};

const protocolToOutboundType = (protocol?: ProtocolType): string => {
  switch (protocol) {
    case 'Shadowsocks':
      return 'shadowsocks';
    case 'VLESS':
      return 'vless';
    case 'VMess':
      return 'vmess';
    case 'Trojan':
      return 'trojan';
    case 'Hysteria2':
      return 'hysteria2';
    case 'TUIC':
      return 'tuic';
    case 'WireGuard':
      return 'wireguard';
    default:
      return 'shadowsocks';
  }
};

const normalizeDnsType = (server: JsonObject): DnsUpstream['type'] => {
  const type = String(server.type ?? '').toLowerCase();
  if (type === 'tls') return 'dot';
  if (type === 'https' || type === 'h3') return 'doh';
  if (type === 'local') return 'local';
  if (type === 'hosts') return 'hosts';
  return 'udp';
};

const stringifyExpr = (rule: JsonObject, key: string): string | null => {
  const value = rule[key];
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') return value;
  return null;
};

const domainRuleId = (group: string, type: DomainRule['type'], value: string) =>
  `domain:${encodeURIComponent(group)}:${type}:${encodeURIComponent(value)}`;

const domainRuleKeyToField = (type: DomainRule['type']) => {
  switch (type) {
    case 'exact':
      return 'domain';
    case 'suffix':
      return 'domain_suffix';
    case 'wildcard':
      return 'domain_keyword';
    case 'regex':
      return 'domain_regex';
    default:
      return 'domain_suffix';
  }
};

const domainActionToOutbound = (action: DomainRule['action']) => {
  if (action === 'DIRECT') return 'direct';
  if (action === 'BLOCK') return 'block';
  return 'proxy';
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
const proxyLatencyCache = new Map<string, { latency: number; lastChecked: string }>();

const latencyCacheKey = (node: ProxyNode) => `${node.name}|${node.address}|${node.port}`;

const pseudoHash = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const withLatency = (nodes: ProxyNode[]): ProxyNode[] =>
  nodes.map((node) => {
    const cached = proxyLatencyCache.get(latencyCacheKey(node));
    if (!cached) return node;
    return {
      ...node,
      latency: cached.latency,
      lastChecked: cached.lastChecked,
    };
  });

const nowLabel = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const measureLatency = (node: ProxyNode): number => {
  const seed = pseudoHash(latencyCacheKey(node) + String(Date.now()));
  const base = 35 + (seed % 170);
  const jitter = (seed % 21) - 10;
  return Math.max(12, base + jitter);
};

const refreshUnifiedProfile = async (): Promise<UnifiedProfile> => {
  try {
    const remote = await fetchJson<UnifiedProfile>('/api/v1/client/profile');
    mockProfileData = { ...remote };
    return { ...remote };
  } catch {
    return { ...mockProfileData };
  }
};

const loadConfig = async (): Promise<JsonObject> => {
  const profile = await refreshUnifiedProfile();
  return parseJsonObject(profile.content);
};

const collectRouteSetOutbounds = (config: JsonObject): Map<string, string> => {
  const outbounds = new Map<string, string>();
  const rules = Array.isArray(config.route?.rules) ? config.route.rules : [];
  for (const rule of rules) {
    const sets = Array.isArray(rule?.rule_set) ? rule.rule_set : [];
    for (const tag of sets) {
      if (typeof tag === 'string' && typeof rule?.outbound === 'string') {
        outbounds.set(tag, rule.outbound);
      }
    }
  }
  return outbounds;
};

const toDomainRules = (config: JsonObject): DomainRule[] => {
  const result: DomainRule[] = [];
  const routeSetOutbounds = collectRouteSetOutbounds(config);
  const ruleSets = Array.isArray(config.route?.rule_set) ? config.route.rule_set : [];

  let order = 0;
  for (const set of ruleSets) {
    if (set?.type !== 'inline' || !Array.isArray(set?.rules)) continue;
    const group = String(set?.tag ?? 'inline-rule-set');
    const action = outboundToAction(routeSetOutbounds.get(group));

    for (const rule of set.rules) {
      const mappings: Array<{ key: string; type: DomainRule['type'] }> = [
        { key: 'domain', type: 'exact' },
        { key: 'domain_suffix', type: 'suffix' },
        { key: 'domain_keyword', type: 'wildcard' },
        { key: 'domain_regex', type: 'regex' },
      ];
      for (const mapping of mappings) {
        const value = rule?.[mapping.key];
        const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
        for (const item of values) {
          if (typeof item !== 'string' || !item.trim()) continue;
          order += 1;
          result.push({
            id: domainRuleId(group, mapping.type, item),
            type: mapping.type,
            value: item,
            group,
            action,
            priority: 10000 - order,
            enabled: true,
          });
        }
      }
    }
  }

  return result;
};

const upsertDomainInConfig = (config: JsonObject, rule: DomainRule): JsonObject => {
  const next = JSON.parse(JSON.stringify(config)) as JsonObject;
  next.route = next.route ?? {};
  next.route.rule_set = Array.isArray(next.route.rule_set) ? next.route.rule_set : [];
  next.route.rules = Array.isArray(next.route.rules) ? next.route.rules : [];

  const ruleSets = next.route.rule_set as JsonObject[];
  let targetSet = ruleSets.find((set) => set?.type === 'inline' && set?.tag === rule.group);
  if (!targetSet) {
    targetSet = { type: 'inline', tag: rule.group, rules: [] };
    ruleSets.push(targetSet);
  }
  targetSet.rules = Array.isArray(targetSet.rules) ? targetSet.rules : [];

  const field = domainRuleKeyToField(rule.type);
  const rules = targetSet.rules as JsonObject[];
  let updated = false;
  for (const item of rules) {
    const values = Array.isArray(item[field]) ? item[field] : typeof item[field] === 'string' ? [item[field]] : [];
    if (values.includes(rule.value)) {
      item[field] = values.map((v: string) => (v === rule.value ? rule.value : v));
      updated = true;
      break;
    }
  }
  if (!updated) {
    rules.push({ [field]: [rule.value] });
  }

  const outbound = domainActionToOutbound(rule.action);
  const routeRules = next.route.rules as JsonObject[];
  const mapped = routeRules.find((item) => Array.isArray(item?.rule_set) && item.rule_set.includes(rule.group));
  if (mapped) {
    mapped.outbound = outbound;
  } else {
    routeRules.push({ rule_set: [rule.group], outbound });
  }

  return next;
};

const deleteDomainInConfig = (config: JsonObject, ruleId: string): JsonObject => {
  const next = JSON.parse(JSON.stringify(config)) as JsonObject;
  const parsed = /^domain:([^:]+):([^:]+):(.+)$/.exec(ruleId);
  if (!parsed) return next;
  const group = decodeURIComponent(parsed[1]);
  const type = parsed[2] as DomainRule['type'];
  const value = decodeURIComponent(parsed[3]);
  const field = domainRuleKeyToField(type);

  next.route = next.route ?? {};
  next.route.rule_set = Array.isArray(next.route.rule_set) ? next.route.rule_set : [];
  const ruleSets = next.route.rule_set as JsonObject[];
  const targetSet = ruleSets.find((set) => set?.type === 'inline' && set?.tag === group);
  if (!targetSet || !Array.isArray(targetSet.rules)) return next;

  targetSet.rules = (targetSet.rules as JsonObject[])
    .map((item) => {
      const values = Array.isArray(item[field]) ? item[field] : typeof item[field] === 'string' ? [item[field]] : [];
      const filtered = values.filter((entry: string) => entry !== value);
      if (values.length > 0) {
        if (filtered.length === 0) {
          const clone = { ...item };
          delete clone[field];
          return clone;
        }
        return { ...item, [field]: filtered };
      }
      return item;
    })
    .filter((item) => {
      const keys = ['domain', 'domain_suffix', 'domain_keyword', 'domain_regex', 'ip_cidr'];
      return keys.some((k) => Array.isArray(item[k]) && item[k].length > 0);
    });

  return next;
};

const toProxyNodes = (config: JsonObject): ProxyNode[] => {
  const outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
  return outbounds
    .filter((item) =>
      typeof item?.tag === 'string' &&
      typeof item?.server === 'string' &&
      Number.isFinite(item?.server_port),
    )
    .map((item) => {
      const tag = String(item.tag);
      const server = String(item.server);
      const port = Number(item.server_port);
      return {
        id: `proxy:${encodeURIComponent(tag)}`,
        name: tag,
        protocol: normalizeProtocol(item.type),
        address: server,
        port,
        tags: [String(item.type ?? 'unknown').toUpperCase()],
        enabled: true,
      } as ProxyNode;
    });
};

const ensureOutboundSection = (config: JsonObject): JsonObject => {
  const next = JSON.parse(JSON.stringify(config)) as JsonObject;
  next.outbounds = Array.isArray(next.outbounds) ? next.outbounds : [];
  return next;
};

const decodeProxyTagFromId = (id: string): string | null => {
  const matched = /^proxy:(.+)$/.exec(id);
  if (!matched) return null;
  return decodeURIComponent(matched[1]);
};

const upsertProxyInConfig = (config: JsonObject, payload: {
  id?: string;
  name: string;
  protocol: ProtocolType;
  address: string;
  port: number;
}): JsonObject => {
  const next = ensureOutboundSection(config);
  const outbounds = next.outbounds as JsonObject[];
  const targetTag = payload.id ? decodeProxyTagFromId(payload.id) : null;
  const existingIndex = targetTag
    ? outbounds.findIndex((item) => String(item?.tag ?? '') === targetTag)
    : -1;

  const nextTag = payload.name.trim();
  const base = existingIndex >= 0 ? outbounds[existingIndex] : {};
  const type = protocolToOutboundType(payload.protocol);
  const nextPayload: JsonObject = {
    ...base,
    tag: nextTag,
    type,
    server: payload.address.trim(),
    server_port: Number(payload.port),
  };
  if (type === 'shadowsocks' && !nextPayload.method) {
    nextPayload.method = 'chacha20-ietf-poly1305';
  }
  if (type === 'shadowsocks' && !nextPayload.password) {
    nextPayload.password = 'changeme';
  }

  if (existingIndex >= 0) {
    const oldTag = String(outbounds[existingIndex]?.tag ?? '');
    outbounds[existingIndex] = nextPayload;
    if (oldTag !== nextTag) {
      for (const outbound of outbounds) {
        if (!Array.isArray(outbound?.outbounds)) continue;
        outbound.outbounds = outbound.outbounds.map((item: unknown) => (item === oldTag ? nextTag : item));
      }
    }
  } else {
    outbounds.push(nextPayload);
    for (const outbound of outbounds) {
      if (!Array.isArray(outbound?.outbounds)) continue;
      if (String(outbound?.type ?? '') === 'urltest' && !outbound.outbounds.includes(nextTag)) {
        outbound.outbounds.push(nextTag);
      }
    }
  }

  return next;
};

const deleteProxyInConfig = (config: JsonObject, id: string): JsonObject => {
  const next = ensureOutboundSection(config);
  const outbounds = next.outbounds as JsonObject[];
  const tag = decodeProxyTagFromId(id);
  if (!tag) return next;

  next.outbounds = outbounds.filter((item) => String(item?.tag ?? '') !== tag);
  for (const outbound of next.outbounds as JsonObject[]) {
    if (!Array.isArray(outbound?.outbounds)) continue;
    outbound.outbounds = outbound.outbounds.filter((item: unknown) => item !== tag);
  }
  return next;
};

const toRoutingRules = (config: JsonObject): RoutingRule[] => {
  const rules = Array.isArray(config.route?.rules) ? config.route.rules : [];
  return rules.map((rule, index) => {
    let matchType: RoutingRule['matchType'] = 'action';
    let matchExpr = 'default';

    const candidates: Array<{ key: string; type: RoutingRule['matchType'] }> = [
      { key: 'rule_set', type: 'rule_set' },
      { key: 'domain', type: 'domain' },
      { key: 'domain_suffix', type: 'domain' },
      { key: 'ip_cidr', type: 'ip' },
      { key: 'geosite', type: 'geosite' },
      { key: 'geoip', type: 'geoip' },
      { key: 'protocol', type: 'protocol' },
    ];

    for (const candidate of candidates) {
      const expr = stringifyExpr(rule, candidate.key);
      if (expr) {
        matchType = candidate.type;
        matchExpr = `${candidate.key}: ${expr}`;
        break;
      }
    }

    if (rule?.ip_is_private === true) {
      matchType = 'ip_private';
      matchExpr = 'ip_is_private=true';
    }

    const outbound = String(rule?.outbound ?? rule?.action ?? config.route?.final ?? '-');
    return {
      id: `route-${index + 1}`,
      matchType,
      matchExpr,
      outbound,
      enabled: true,
      priority: index + 1,
    };
  });
};

const ensureRouteSection = (config: JsonObject): JsonObject => {
  const next = JSON.parse(JSON.stringify(config)) as JsonObject;
  next.route = next.route ?? {};
  next.route.rules = Array.isArray(next.route.rules) ? next.route.rules : [];
  return next;
};

const splitExpr = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const parseMatchExpr = (expr: string): { key?: string; value: string } => {
  const parts = expr.split(':');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const value = parts.slice(1).join(':').trim();
    return { key, value };
  }
  return { value: expr.trim() };
};

const routingRuleToConfigRule = (rule: {
  matchType: RoutingRule['matchType'];
  matchExpr: string;
  outbound: string;
}): JsonObject => {
  const { key, value } = parseMatchExpr(rule.matchExpr);
  const expr = value || '';

  const outbound = rule.outbound.trim();
  if (rule.matchType === 'action') {
    return { action: expr || outbound || 'sniff' };
  }

  if (rule.matchType === 'ip_private') {
    return { ip_is_private: true, outbound };
  }

  const payload: JsonObject = { outbound };
  const pick = (k: string, arr = false) => {
    if (!expr) return;
    if (arr) payload[k] = splitExpr(expr);
    else payload[k] = expr;
  };

  switch (rule.matchType) {
    case 'rule_set':
      pick('rule_set', true);
      break;
    case 'protocol':
      pick('protocol', true);
      break;
    case 'domain':
      if (key === 'domain') pick('domain', true);
      else if (key === 'domain_suffix') pick('domain_suffix', true);
      else pick('domain_suffix', true);
      break;
    case 'ip':
      pick('ip_cidr', true);
      break;
    case 'geosite':
      pick('geosite', true);
      break;
    case 'geoip':
      pick('geoip', true);
      break;
    case 'port':
      payload.port = Number(expr);
      break;
    case 'process':
      pick('process_name', true);
      break;
    default:
      break;
  }
  return payload;
};

const upsertRoutingRuleInConfig = (config: JsonObject, input: {
  id?: string;
  matchType: RoutingRule['matchType'];
  matchExpr: string;
  outbound: string;
}): JsonObject => {
  const next = ensureRouteSection(config);
  const list = next.route.rules as JsonObject[];
  const payload = routingRuleToConfigRule(input);

  if (input.id) {
    const matched = /^route-(\d+)$/.exec(input.id);
    if (matched) {
      const index = Number(matched[1]) - 1;
      if (index >= 0 && index < list.length) {
        list[index] = payload;
        return next;
      }
    }
  }
  list.push(payload);
  return next;
};

const deleteRoutingRuleInConfig = (config: JsonObject, id: string): JsonObject => {
  const next = ensureRouteSection(config);
  const list = next.route.rules as JsonObject[];
  const matched = /^route-(\d+)$/.exec(id);
  if (!matched) return next;
  const index = Number(matched[1]) - 1;
  if (index >= 0 && index < list.length) {
    list.splice(index, 1);
  }
  return next;
};

const moveRoutingRuleInConfig = (config: JsonObject, id: string, direction: 'up' | 'down'): JsonObject => {
  const next = ensureRouteSection(config);
  const list = next.route.rules as JsonObject[];
  const matched = /^route-(\d+)$/.exec(id);
  if (!matched) return next;
  const index = Number(matched[1]) - 1;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) {
    return next;
  }
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
  return next;
};

const toDnsServers = (config: JsonObject): DnsUpstream[] => {
  const dns = config.dns ?? {};
  const servers = Array.isArray(dns.servers) ? dns.servers : [];
  return servers.map((server, index) => {
    const normalizedType = normalizeDnsType(server);
    const name = String(server?.tag ?? `dns-${index + 1}`);
    const tag = String(server?.tag ?? `dns-${index + 1}`);
    let address = 'system';
    if (normalizedType === 'hosts') {
      const count = server?.predefined && typeof server.predefined === 'object'
        ? Object.keys(server.predefined).length
        : 0;
      address = `${count} host records`;
    } else if (typeof server?.address === 'string') {
      address = server.address;
    } else if (typeof server?.server === 'string') {
      const port = Number.isFinite(server?.server_port) ? `:${server.server_port}` : '';
      address = `${server.server}${port}`;
    }

    return {
      id: `dns:${encodeURIComponent(tag)}`,
      name,
      type: normalizedType,
      address,
      detour: typeof server?.detour === 'string' ? server.detour : undefined,
      strategy: (dns.strategy as DnsUpstream['strategy']) || 'auto',
      enabled: true,
    };
  });
};

const toHostsEntries = (config: JsonObject): HostsEntry[] => {
  const dns = config.dns ?? {};
  const servers = Array.isArray(dns.servers) ? dns.servers : [];
  const result: HostsEntry[] = [];
  let id = 0;

  for (const server of servers) {
    if (String(server?.type ?? '').toLowerCase() !== 'hosts') continue;
    const predefined = server?.predefined && typeof server.predefined === 'object'
      ? server.predefined
      : {};
    for (const [hostname, ip] of Object.entries(predefined)) {
      id += 1;
      result.push({
        id: `host:${encodeURIComponent(String(server?.tag ?? 'hosts'))}:${encodeURIComponent(hostname)}`,
        hostname,
        ip: String(ip),
        group: String(server?.tag ?? 'hosts'),
        enabled: true,
      });
    }
  }

  return result;
};

const ensureDnsSection = (config: JsonObject): JsonObject => {
  const next = JSON.parse(JSON.stringify(config)) as JsonObject;
  next.dns = next.dns ?? {};
  next.dns.servers = Array.isArray(next.dns.servers) ? next.dns.servers : [];
  next.dns.rules = Array.isArray(next.dns.rules) ? next.dns.rules : [];
  return next;
};

const upsertDnsServerInConfig = (config: JsonObject, server: {
  name: string;
  type: DnsUpstream['type'];
  address: string;
  detour?: string;
  strategy?: DnsUpstream['strategy'];
}): JsonObject => {
  const next = ensureDnsSection(config);
  const tag = server.name.trim();
  const list = next.dns.servers as JsonObject[];
  const index = list.findIndex((item) => String(item?.tag ?? '') === tag);

  let payload: JsonObject;
  if (server.type === 'hosts') {
    const existing = index >= 0 ? list[index] : {};
    payload = {
      type: 'hosts',
      tag,
      predefined: existing.predefined && typeof existing.predefined === 'object' ? existing.predefined : {},
    };
  } else if (server.type === 'local') {
    payload = { type: 'local', tag };
  } else if (server.type === 'dot' || server.type === 'tls') {
    const [host, portRaw] = server.address.split(':');
    payload = {
      type: 'tls',
      tag,
      server: host,
      ...(portRaw && Number.isFinite(Number(portRaw)) ? { server_port: Number(portRaw) } : {}),
      ...(server.detour ? { detour: server.detour } : {}),
    };
  } else if (server.type === 'doh') {
    payload = {
      type: 'https',
      tag,
      server: server.address,
      ...(server.detour ? { detour: server.detour } : {}),
    };
  } else {
    payload = {
      type: 'udp',
      tag,
      server: server.address,
      ...(server.detour ? { detour: server.detour } : {}),
    };
  }

  if (index >= 0) {
    list[index] = payload;
  } else {
    list.push(payload);
  }

  if (server.strategy) {
    next.dns.strategy = server.strategy;
  }
  return next;
};

const deleteDnsServerInConfig = (config: JsonObject, id: string): JsonObject => {
  const next = ensureDnsSection(config);
  const match = /^dns:(.+)$/.exec(id);
  if (!match) return next;
  const tag = decodeURIComponent(match[1]);
  next.dns.servers = (next.dns.servers as JsonObject[]).filter((item) => String(item?.tag ?? '') !== tag);
  next.dns.rules = (next.dns.rules as JsonObject[]).filter((rule) => {
    if (typeof rule?.server !== 'string') return true;
    return rule.server !== tag;
  });
  if (next.dns.final === tag) {
    delete next.dns.final;
  }
  return next;
};

const upsertHostInConfig = (config: JsonObject, host: {
  hostname: string;
  ip: string;
  group?: string;
}): JsonObject => {
  const next = ensureDnsSection(config);
  const group = (host.group || 'dns_hosts').trim();
  const servers = next.dns.servers as JsonObject[];
  let target = servers.find((item) => String(item?.type ?? '').toLowerCase() === 'hosts' && String(item?.tag ?? '') === group);
  if (!target) {
    target = { type: 'hosts', tag: group, predefined: {} };
    servers.unshift(target);
  }
  const predefined = target.predefined && typeof target.predefined === 'object' ? target.predefined : {};
  target.predefined = {
    ...predefined,
    [host.hostname.trim()]: host.ip.trim(),
  };
  return next;
};

const deleteHostInConfig = (config: JsonObject, id: string): JsonObject => {
  const next = ensureDnsSection(config);
  const match = /^host:([^:]+):(.+)$/.exec(id);
  if (!match) return next;
  const group = decodeURIComponent(match[1]);
  const hostname = decodeURIComponent(match[2]);
  const servers = next.dns.servers as JsonObject[];
  const target = servers.find((item) => String(item?.type ?? '').toLowerCase() === 'hosts' && String(item?.tag ?? '') === group);
  if (!target || !target.predefined || typeof target.predefined !== 'object') return next;
  delete target.predefined[hostname];
  return next;
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
    await sleep(200);
    const config = await loadConfig();
    return toDomainRules(config);
  },

  saveDomainRule: async (payload: Partial<DomainRule> & { id?: string }): Promise<DomainRule[]> => {
    await sleep(180);
    const config = await loadConfig();
    const current = toDomainRules(config);
    const existing = payload.id ? current.find((item) => item.id === payload.id) : undefined;
    const nextRule: DomainRule = {
      id: payload.id || domainRuleId(payload.group || 'custom', (payload.type as DomainRule['type']) || 'suffix', payload.value || ''),
      type: (payload.type as DomainRule['type']) || existing?.type || 'suffix',
      value: payload.value || existing?.value || '',
      group: payload.group || existing?.group || 'custom',
      action: (payload.action as DomainRule['action']) || existing?.action || 'PROXY',
      priority: Number.isFinite(payload.priority) ? Number(payload.priority) : existing?.priority || 10,
      enabled: payload.enabled ?? existing?.enabled ?? true,
      note: payload.note ?? existing?.note,
    };
    if (!nextRule.value.trim()) {
      throw new Error('domain value is required');
    }

    let nextConfig = config;
    if (existing && existing.value !== nextRule.value) {
      nextConfig = deleteDomainInConfig(nextConfig, existing.id);
    }
    nextConfig = upsertDomainInConfig(nextConfig, nextRule);

    await mockApi.saveUnifiedProfile({
      content: JSON.stringify(nextConfig, null, 2),
      publicUrl: mockProfileData.publicUrl,
    });
    return toDomainRules(nextConfig);
  },

  deleteDomainRule: async (id: string): Promise<DomainRule[]> => {
    await sleep(160);
    const config = await loadConfig();
    const nextConfig = deleteDomainInConfig(config, id);
    await mockApi.saveUnifiedProfile({
      content: JSON.stringify(nextConfig, null, 2),
      publicUrl: mockProfileData.publicUrl,
    });
    return toDomainRules(nextConfig);
  },

  getProxies: async (): Promise<ProxyNode[]> => {
    await sleep(220);
    const config = await loadConfig();
    return withLatency(toProxyNodes(config));
  },

  saveProxyNode: async (payload: {
    id?: string;
    name: string;
    protocol: ProtocolType;
    address: string;
    port: number;
  }): Promise<ProxyNode[]> => {
    await sleep(180);
    if (!payload.name.trim() || !payload.address.trim() || !Number.isFinite(payload.port)) {
      throw new Error('name, address and port are required');
    }
    const config = await loadConfig();
    const nextConfig = upsertProxyInConfig(config, payload);
    await mockApi.saveUnifiedProfile({
      content: JSON.stringify(nextConfig, null, 2),
      publicUrl: mockProfileData.publicUrl,
    });
    return withLatency(toProxyNodes(nextConfig));
  },

  deleteProxyNode: async (id: string): Promise<ProxyNode[]> => {
    await sleep(150);
    const config = await loadConfig();
    const nextConfig = deleteProxyInConfig(config, id);
    await mockApi.saveUnifiedProfile({
      content: JSON.stringify(nextConfig, null, 2),
      publicUrl: mockProfileData.publicUrl,
    });
    return withLatency(toProxyNodes(nextConfig));
  },

  checkProxiesLatency: async (): Promise<ProxyNode[]> => {
    const config = await loadConfig();
    const nodes = toProxyNodes(config);
    try {
      const response = await fetchJson<Array<{ id: string; latency: number | null; checkedAt: string }>>(PROXY_LATENCY_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: nodes.map((node) => ({
            id: node.id,
            host: node.address,
            port: node.port,
          })),
          timeoutMs: 2000,
        }),
      });
      for (const item of response) {
        if (item.latency == null) continue;
        const node = nodes.find((candidate) => candidate.id === item.id);
        if (!node) continue;
        proxyLatencyCache.set(latencyCacheKey(node), {
          latency: item.latency,
          lastChecked: item.checkedAt || nowLabel(),
        });
      }
    } catch {
      const checkedAt = nowLabel();
      for (const node of nodes) {
        proxyLatencyCache.set(latencyCacheKey(node), {
          latency: measureLatency(node),
          lastChecked: checkedAt,
        });
      }
    }
    return withLatency(nodes);
  },

  getRouting: async (): Promise<RoutingRule[]> => {
    await sleep(180);
    const config = await loadConfig();
    return toRoutingRules(config);
  },

  saveRoutingRule: async (payload: {
    id?: string;
    matchType: RoutingRule['matchType'];
    matchExpr: string;
    outbound: string;
  }): Promise<RoutingRule[]> => {
    await sleep(180);
    const config = await loadConfig();
    const nextConfig = upsertRoutingRuleInConfig(config, payload);
    await mockApi.saveUnifiedProfile({
      content: JSON.stringify(nextConfig, null, 2),
      publicUrl: mockProfileData.publicUrl,
    });
    return toRoutingRules(nextConfig);
  },

  deleteRoutingRule: async (id: string): Promise<RoutingRule[]> => {
    await sleep(160);
    const config = await loadConfig();
    const nextConfig = deleteRoutingRuleInConfig(config, id);
    await mockApi.saveUnifiedProfile({
      content: JSON.stringify(nextConfig, null, 2),
      publicUrl: mockProfileData.publicUrl,
    });
    return toRoutingRules(nextConfig);
  },

  moveRoutingRule: async (payload: {
    id: string;
    direction: 'up' | 'down';
  }): Promise<RoutingRule[]> => {
    await sleep(140);
    const config = await loadConfig();
    const nextConfig = moveRoutingRuleInConfig(config, payload.id, payload.direction);
    await mockApi.saveUnifiedProfile({
      content: JSON.stringify(nextConfig, null, 2),
      publicUrl: mockProfileData.publicUrl,
    });
    return toRoutingRules(nextConfig);
  },

  getDns: async (): Promise<DnsUpstream[]> => {
    await sleep(180);
    const config = await loadConfig();
    return toDnsServers(config);
  },

  saveDnsServer: async (payload: {
    id?: string;
    name: string;
    type: DnsUpstream['type'];
    address: string;
    detour?: string;
    strategy?: DnsUpstream['strategy'];
  }): Promise<DnsUpstream[]> => {
    await sleep(180);
    const config = await loadConfig();
    const nextConfig = upsertDnsServerInConfig(config, payload);
    await mockApi.saveUnifiedProfile({
      content: JSON.stringify(nextConfig, null, 2),
      publicUrl: mockProfileData.publicUrl,
    });
    return toDnsServers(nextConfig);
  },

  deleteDnsServer: async (id: string): Promise<DnsUpstream[]> => {
    await sleep(140);
    const config = await loadConfig();
    const nextConfig = deleteDnsServerInConfig(config, id);
    await mockApi.saveUnifiedProfile({
      content: JSON.stringify(nextConfig, null, 2),
      publicUrl: mockProfileData.publicUrl,
    });
    return toDnsServers(nextConfig);
  },

  getHosts: async (): Promise<HostsEntry[]> => {
    await sleep(180);
    const config = await loadConfig();
    return toHostsEntries(config);
  },

  saveHostEntry: async (payload: {
    hostname: string;
    ip: string;
    group?: string;
  }): Promise<HostsEntry[]> => {
    await sleep(150);
    if (!payload.hostname.trim() || !payload.ip.trim()) {
      throw new Error('hostname and ip are required');
    }
    const config = await loadConfig();
    const nextConfig = upsertHostInConfig(config, payload);
    await mockApi.saveUnifiedProfile({
      content: JSON.stringify(nextConfig, null, 2),
      publicUrl: mockProfileData.publicUrl,
    });
    return toHostsEntries(nextConfig);
  },

  deleteHostEntry: async (id: string): Promise<HostsEntry[]> => {
    await sleep(130);
    const config = await loadConfig();
    const nextConfig = deleteHostInConfig(config, id);
    await mockApi.saveUnifiedProfile({
      content: JSON.stringify(nextConfig, null, 2),
      publicUrl: mockProfileData.publicUrl,
    });
    return toHostsEntries(nextConfig);
  },

  batchImportHosts: async (text: string): Promise<HostsEntry[]> => {
    await sleep(160);
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const parsed = lines
      .map((line) => line.split(/\s+/))
      .filter((parts) => parts.length >= 2)
      .map((parts) => ({ ip: parts[0], hostname: parts[1], group: 'dns_hosts' }));

    if (parsed.length === 0) {
      throw new Error('no valid host entries');
    }

    let nextConfig = await loadConfig();
    for (const item of parsed) {
      nextConfig = upsertHostInConfig(nextConfig, item);
    }
    await mockApi.saveUnifiedProfile({
      content: JSON.stringify(nextConfig, null, 2),
      publicUrl: mockProfileData.publicUrl,
    });
    return toHostsEntries(nextConfig);
  },

  simulateTraffic: async (payload: {
    target: string;
    protocol?: string;
    port?: number;
  }): Promise<TrafficSimulationResult> => {
    await sleep(120);
    return fetchJson<TrafficSimulationResult>(SIMULATE_TRAFFIC_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  getVersions: async (): Promise<ConfigVersion[]> => {
    await sleep(240);
    return fetchJson<ConfigVersion[]>(VERSIONS_PATH);
  },

  publishCurrentProfile: async (payload?: { summary?: string; author?: string }): Promise<ConfigVersion> => {
    await sleep(180);
    return fetchJson<ConfigVersion>(PUBLISH_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });
  },

  rollbackVersion: async (id: string): Promise<UnifiedProfile> => {
    await sleep(220);
    const profile = await fetchJson<UnifiedProfile>(ROLLBACK_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    mockProfileData = { ...profile };
    return profile;
  },

  getUnifiedProfile: async (): Promise<UnifiedProfile> => {
    await sleep(200);
    return refreshUnifiedProfile();
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
