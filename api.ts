
import { DomainRule, DomainGroup, ProxyNode, ProxyGroup, RoutingRule, DnsUpstream, HostsEntry, ConfigVersion, UnifiedProfile, User, ProtocolType, TrafficSimulationResult, ClientDeviceReportPayload, ClientConnectionReportPayload, UserTargetAggregate, UserTargetDetail, UserProfileAudit, DashboardSummary, CoreSettings, FailedDomainSummary } from './types';
import { QualityObservability, normalizeObservabilityResponse } from './utils/quality';
import { clearSession, loadSession, resolveActiveSession } from './auth';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const RULES_PATH = '/api/v1/rules';
const QUALITY_MOCK_FALLBACK = import.meta.env.VITE_QUALITY_MOCK_FALLBACK === 'true';
const QUALITY_OBSERVABILITY_PATH = '/api/v1/quality/observability';
const DEFAULT_SUBSCRIPTION_PATH = '/api/v1/client/subscribe';
const SIMULATE_TRAFFIC_PATH = '/api/v1/simulate/traffic';
const PROXY_LATENCY_PATH = '/api/v1/proxies/latency';
const VERSIONS_PATH = '/api/v1/client/versions';
const PUBLISH_PATH = '/api/v1/client/publish';
const ROLLBACK_PATH = '/api/v1/client/rollback';
const AUTH_SYNC_USER_PATH = '/api/v1/auth/sync-user';
const USERS_PATH = '/api/v1/users';
const CLIENT_CONNECT_REPORT_PATH = '/api/v1/client/connect';
const CLIENT_CONNECTIONS_REPORT_PATH = '/api/v1/client/connections';
const DASHBOARD_PATH = '/api/v1/dashboard';
const FAILED_DOMAINS_PATH = '/api/v1/failures/domains';
const userTargetsPath = (id: string) => `${USERS_PATH}/${encodeURIComponent(id)}/targets`;
const userTargetDetailPath = (id: string, target: string) =>
  `${USERS_PATH}/${encodeURIComponent(id)}/targets/${encodeURIComponent(target)}`;

const resolveSubscriptionUrl = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${DEFAULT_SUBSCRIPTION_PATH}`;
  }
  return `https://beforeve.com${DEFAULT_SUBSCRIPTION_PATH}`;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  instance?: string;
  type?: string;
  title?: string;
  errors?: Array<{ field?: string; message: string }>;

  constructor(message: string, init: { status: number; title?: string; code?: string; instance?: string; type?: string; errors?: Array<{ field?: string; message: string }> }) {
    super(message);
    this.name = 'ApiError';
    this.status = init.status;
    this.title = init.title;
    this.code = init.code;
    this.instance = init.instance;
    this.type = init.type;
    this.errors = init.errors;
  }
}

const parseProblemDetail = async (response: Response) => {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const rawText = await response.text();
  if (contentType.includes('application/problem+json') || contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(rawText) as {
        title?: string;
        detail?: string;
        code?: string;
        instance?: string;
        type?: string;
        errors?: Array<{ field?: string; message: string }>;
      };
      if (parsed && typeof parsed === 'object') {
        return {
          title: typeof parsed.title === 'string' ? parsed.title : 'Request failed',
          detail: typeof parsed.detail === 'string' ? parsed.detail : rawText || 'Request failed',
          code: typeof parsed.code === 'string' ? parsed.code : undefined,
          instance: typeof parsed.instance === 'string' ? parsed.instance : undefined,
          type: typeof parsed.type === 'string' ? parsed.type : undefined,
          errors: Array.isArray(parsed.errors) ? parsed.errors : undefined,
        };
      }
    } catch {
      // fall through
    }
  }
  if (rawText && rawText.trim().startsWith('<')) {
    const fallback = rawText.replace(/<[^>]*>/g, '').trim().slice(0, 300);
    return {
      title: 'Request failed',
      detail: fallback || `Request failed with ${response.status}`,
    };
  }
  return {
    title: 'Request failed',
    detail: rawText || `Request failed with ${response.status}`,
  };
};

const isAuthProblem = (parsed: {
  code?: string;
  status?: number;
  detail?: string;
}) => {
  const code = typeof parsed?.code === 'string' ? parsed.code : '';
  return (
    parsed?.status === 401 &&
    (code === 'invalid_access_token' || code === 'missing_bearer_token' || code === 'invalid_token')
  );
};

type AuthInvalidationDetail = {
  code: string;
  path: string;
  status: number;
  detail?: string;
};

const emitAuthInvalidation = (detail: AuthInvalidationDetail) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('harbor:auth-invalid', { detail }));
};

const isAuthFailureError = (error: unknown): error is ApiError => {
  return error instanceof ApiError && error.status === 401;
};

const fallbackUnlessAuthError = async <T>(
  operation: () => Promise<T>,
  fallback: () => Promise<T> | T,
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (isAuthFailureError(error)) {
      throw error;
    }
    return await fallback();
  }
};

const fetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const session = await resolveActiveSession();
  const token = session?.accessToken;
  const tokenType =
    (session?.tokenType || 'Bearer').toLowerCase() === 'bearer'
      ? 'Bearer'
      : session?.tokenType || 'Bearer';
  const initHeaders = new Headers(init?.headers ?? {});
  const mergedHeaders = new Headers();
  mergedHeaders.set('Accept', 'application/json');
  if (token) {
    mergedHeaders.set('Authorization', `${tokenType} ${token}`);
  }
  initHeaders.forEach((value, key) => {
    mergedHeaders.set(key, value);
  });
  const { headers: _ignoredHeaders, ...restInit } = init ?? {};
  const requestUrl = `${API_BASE}${path}`;
  const requestOnce = async (headers: Headers): Promise<Response> => {
    try {
      return await fetch(requestUrl, {
        ...restInit,
        headers,
      });
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      throw new ApiError(`Failed to reach ${requestUrl}: ${cause || 'request failed'}`, {
        status: 0,
        code: 'network_error',
      });
    }
  };

  const response = await requestOnce(mergedHeaders);
  if (!response.ok) {
    const parsed = await parseProblemDetail(response);
    if (
      isAuthProblem({ code: parsed.code, status: response.status, detail: parsed.detail }) &&
      token
    ) {
      const refreshed = await resolveActiveSession({ forceRefresh: true });
      if (!refreshed) {
        clearSession();
        emitAuthInvalidation({
          code: parsed.code || 'invalid_access_token',
          path,
          status: response.status,
          detail: parsed.detail,
        });
        throw new ApiError(parsed.detail || `Request failed with ${response.status}`, {
          status: response.status,
          title: parsed.title,
          code: parsed.code,
          instance: parsed.instance,
          type: parsed.type,
          errors: parsed.errors,
        });
      }

      const hasRefreshedToken = refreshed.accessToken !== token;
      const hasRefreshedTokenType = hasRefreshedToken
        ? (refreshed.tokenType || tokenType || 'Bearer')
        : tokenType;
      if (hasRefreshedToken) {
        const retryHeaders = new Headers(initHeaders);
        retryHeaders.set('Accept', 'application/json');
        retryHeaders.set(
          'Authorization',
          `${hasRefreshedTokenType.toLowerCase() === 'bearer' ? 'Bearer' : hasRefreshedTokenType} ${refreshed.accessToken}`,
        );
        const retryResponse = await requestOnce(retryHeaders);
        if (retryResponse.ok) {
          return retryResponse.json() as Promise<T>;
        }
        const retryParsed = await parseProblemDetail(retryResponse);
        if (retryParsed.code) {
          emitAuthInvalidation({
            code: retryParsed.code,
            path,
            status: retryResponse.status,
            detail: retryParsed.detail,
          });
          clearSession();
        }
        throw new ApiError(retryParsed.detail || `Request failed with ${retryResponse.status}`, {
          status: retryResponse.status,
          title: retryParsed.title,
          code: retryParsed.code,
          instance: retryParsed.instance,
          type: retryParsed.type,
          errors: retryParsed.errors,
        });
      }
      clearSession();
      emitAuthInvalidation({
        code: parsed.code || 'invalid_access_token',
        path,
        status: response.status,
        detail: parsed.detail,
      });
    }

    if (response.status === 401) {
      const authCode = parsed.code || 'authentication_required';
      const authError = new ApiError(parsed.detail || `Request failed with ${response.status}`, {
        status: response.status,
        title: parsed.title,
        code: authCode,
        instance: parsed.instance,
        type: parsed.type,
        errors: parsed.errors,
      });
      clearSession();
      emitAuthInvalidation({
        code: authCode,
        path,
        status: response.status,
        detail: parsed.detail,
      });
      throw authError;
    }
    throw new ApiError(parsed.detail || `Request failed with ${response.status}`, {
      status: response.status,
      title: parsed.title,
      code: parsed.code,
      instance: parsed.instance,
      type: parsed.type,
      errors: parsed.errors,
    });
  }
  return response.json() as Promise<T>;
};

type JsonObject = Record<string, any>;
type RuleEntryItem = {
  id: number;
  scope: 'global' | 'user';
  user_id?: string | null;
  module: string;
  rule_key?: string | null;
  priority: number;
  enabled: boolean;
  payload: JsonObject;
};

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
    case 'domain':
      return 'domain';
    case 'domain_suffix':
      return 'domain_suffix';
    case 'domain_keyword':
      return 'domain_keyword';
    case 'domain_regex':
      return 'domain_regex';
    case 'ip_cidr':
      return 'ip_cidr';
    default:
      return 'domain';
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
type ProxyLatencyRecord = {
  latency?: number;
  latencyStatus: 'ok' | 'failed';
  resolvedAddress?: string;
  lastChecked: string;
};

const proxyLatencyCache = new Map<string, ProxyLatencyRecord>();

const latencyCacheKey = (node: ProxyNode) => `${node.name}|${node.address}|${node.port}`;

const withLatency = (nodes: ProxyNode[]): ProxyNode[] =>
  nodes.map((node) => {
    const cached = proxyLatencyCache.get(latencyCacheKey(node));
    if (!cached) return node;
    return {
      ...node,
      latencyStatus: cached.latencyStatus,
      latency: cached.latency,
      lastChecked: cached.lastChecked,
      resolvedAddress: cached.resolvedAddress,
    };
  });

const nowLabel = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const refreshUnifiedProfile = async (): Promise<UnifiedProfile> => {
  const remote = await fetchJson<UnifiedProfile>('/api/v1/client/profile');
  mockProfileData = { ...remote };
  return { ...remote };
};

const loadConfig = async (): Promise<JsonObject> => {
  const profile = await refreshUnifiedProfile();
  return parseJsonObject(profile.content);
};

const listOutboundTags = (config: JsonObject): string[] => {
  const outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
  const tags = outbounds
    .map((item) => (typeof item?.tag === 'string' ? item.tag : ''))
    .filter((tag) => !!tag);
  return [...new Set(tags)].sort((a, b) => a.localeCompare(b));
};

const pickDNSRefTag = (dnsSection: JsonObject | undefined, preferredTag: unknown, fallbackTag: string): string => {
  const servers = Array.isArray(dnsSection?.servers) ? dnsSection.servers : [];
  const availableTags = new Set<string>();
  for (const item of servers) {
    if (typeof item?.tag === 'string' && item.tag.trim()) {
      availableTags.add(item.tag.trim());
    }
  }
  const preferred = typeof preferredTag === 'string' ? preferredTag.trim() : '';
  if (preferred && availableTags.has(preferred)) {
    return preferred;
  }
  if (fallbackTag) {
    const fallback = fallbackTag.trim();
    if (fallback && availableTags.has(fallback)) {
      return fallback;
    }
  }
  return availableTags.size > 0 ? [...availableTags][0] : '';
};

const toCoreSettings = (config: JsonObject): CoreSettings => {
  const inbound = Array.isArray(config.inbounds) ? config.inbounds.find((item) => item?.type === 'tun') : undefined;
  const tunAddressRaw = Array.isArray(inbound?.address)
    ? inbound.address[0]
    : inbound?.address ?? inbound?.inet4_address ?? '172.19.0.1/30';
  const dnsSection = (config.dns as JsonObject) ?? {};
  const routeDefaultCandidate = config.route?.default_domain_resolver;
  const dnsFinalCandidate = dnsSection.final;
  const routeFinalTag = pickDNSRefTag(dnsSection, routeDefaultCandidate, '');
  const dnsFinalTag = pickDNSRefTag(dnsSection, dnsFinalCandidate, routeFinalTag);
  return {
    logDisabled: Boolean(config.log?.disabled),
    logLevel: (config.log?.level ?? 'info') as CoreSettings['logLevel'],
    logOutput: String(config.log?.output ?? ''),
    logTimestamp: config.log?.timestamp !== false,
    ntpEnabled: config.ntp?.enabled !== false,
    ntpServer: String(config.ntp?.server ?? 'time.apple.com'),
    ntpServerPort: Number(config.ntp?.server_port ?? 123),
    ntpInterval: String(config.ntp?.interval ?? '30m'),
    ntpDetour: String(config.ntp?.detour ?? 'direct'),
    ntpDomainResolver: pickDNSRefTag(dnsSection, config.ntp?.domain_resolver, dnsFinalTag),
    tunTag: String(inbound?.tag ?? 'tun-in'),
    tunAddress: String(tunAddressRaw ?? '172.19.0.1/30'),
    tunAutoRoute: inbound?.auto_route !== false,
    tunStrictRoute: inbound?.strict_route !== false,
    tunStack: (inbound?.stack ?? 'mixed') as CoreSettings['tunStack'],
    routeFinal: String(config.route?.final ?? 'proxy'),
    routeAutoDetectInterface: config.route?.auto_detect_interface !== false,
    routeDefaultDomainResolver: routeFinalTag,
    dnsFinal: dnsFinalTag,
    dnsIndependentCache: config.dns?.independent_cache !== false,
    dnsStrategy: (config.dns?.strategy ?? 'prefer_ipv4') as CoreSettings['dnsStrategy'],
  };
};

const applyCoreSettings = (config: JsonObject, payload: CoreSettings): JsonObject => {
  const next = JSON.parse(JSON.stringify(config)) as JsonObject;
  next.log = {
    ...(next.log ?? {}),
    disabled: payload.logDisabled,
    level: payload.logLevel,
    output: payload.logOutput,
    timestamp: payload.logTimestamp,
  };
  next.ntp = {
    ...(next.ntp ?? {}),
    enabled: payload.ntpEnabled,
    server: payload.ntpServer,
    server_port: payload.ntpServerPort,
    interval: payload.ntpInterval,
    detour: payload.ntpDetour,
    domain_resolver: payload.ntpDomainResolver,
  };
  const inbounds = Array.isArray(next.inbounds) ? next.inbounds : [];
  const tunIndex = inbounds.findIndex((item) => item?.type === 'tun');
  const tunInbound = {
    ...(tunIndex >= 0 ? inbounds[tunIndex] : {}),
    type: 'tun',
    tag: payload.tunTag,
    auto_route: payload.tunAutoRoute,
    strict_route: payload.tunStrictRoute,
    stack: payload.tunStack,
    address: [payload.tunAddress],
  };
  if (tunIndex >= 0) {
    inbounds[tunIndex] = tunInbound;
  } else {
    inbounds.unshift(tunInbound);
  }
  next.inbounds = inbounds;
  next.route = {
    ...(next.route ?? {}),
    final: payload.routeFinal,
    auto_detect_interface: payload.routeAutoDetectInterface,
    default_domain_resolver: payload.routeDefaultDomainResolver,
  };
  next.dns = {
    ...(next.dns ?? {}),
    final: payload.dnsFinal,
    independent_cache: payload.dnsIndependentCache,
    strategy: payload.dnsStrategy,
  };
  return next;
};

const listModuleRules = async (module: string): Promise<RuleEntryItem[]> => {
  const query = `?scope=global&module=${encodeURIComponent(module)}`;
  const data = await fetchJson<{ items: RuleEntryItem[] }>(`${RULES_PATH}${query}`);
  return Array.isArray(data.items) ? data.items : [];
};

const deleteRuleEntry = async (id: number): Promise<void> => {
  await fetchJson<{ success: boolean }>(`${RULES_PATH}?id=${id}`, { method: 'DELETE' });
};

const upsertRuleEntry = async (payload: {
  scope: 'global';
  module: string;
  payload: JsonObject;
  rule_key?: string;
  priority?: number;
}): Promise<void> => {
  await fetchJson<{ success: boolean }>(RULES_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

const replaceModuleRows = async (
  module: string,
  rows: JsonObject[],
  tagKey?: string,
): Promise<void> => {
  const existing = await listModuleRules(module);
  for (const row of existing) {
    await deleteRuleEntry(row.id);
  }
  for (let index = 0; index < rows.length; index += 1) {
    const payload = rows[index];
    const ruleKey =
      tagKey && typeof payload?.[tagKey] === 'string'
        ? String(payload[tagKey])
        : undefined;
    await upsertRuleEntry({
      scope: 'global',
      module,
      payload,
      rule_key: ruleKey,
      priority: index,
    });
  }
};

const replaceMetaRow = async (module: string, payload: JsonObject): Promise<void> => {
  await replaceModuleRows(module, [payload]);
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

const collectDnsRuleSetServers = (config: JsonObject): Map<string, string> => {
  const servers = new Map<string, string>();
  const rules = Array.isArray(config.dns?.rules) ? config.dns.rules : [];
  for (const rule of rules) {
    if (!Array.isArray(rule?.rule_set) || typeof rule?.server !== 'string') continue;
    for (const tag of rule.rule_set) {
      if (typeof tag === 'string') {
        servers.set(tag, rule.server);
      }
    }
  }
  return servers;
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
        { key: 'domain', type: 'domain' },
        { key: 'domain_suffix', type: 'domain_suffix' },
        { key: 'domain_keyword', type: 'domain_keyword' },
        { key: 'domain_regex', type: 'domain_regex' },
        { key: 'ip_cidr', type: 'ip_cidr' },
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

const toDomainGroups = (config: JsonObject): DomainGroup[] => {
  const routeSetOutbounds = collectRouteSetOutbounds(config);
  const dnsRuleSetServers = collectDnsRuleSetServers(config);
  const rules = toDomainRules(config);
  const countByGroup = new Map<string, number>();
  for (const rule of rules) {
    countByGroup.set(rule.group, (countByGroup.get(rule.group) ?? 0) + 1);
  }
  const ruleSets = Array.isArray(config.route?.rule_set) ? config.route.rule_set : [];
  const groups = ruleSets
    .filter((set: JsonObject) => set?.type === 'inline' && typeof set?.tag === 'string')
    .map((set: JsonObject) => {
      const name = String(set.tag);
      return {
        id: `domain-group:${encodeURIComponent(name)}`,
        name,
        action: outboundToAction(routeSetOutbounds.get(name)),
        dnsServer: dnsRuleSetServers.get(name),
        ruleCount: countByGroup.get(name) ?? 0,
      } as DomainGroup;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return groups;
};

const ensureDomainGroupInConfig = (
  config: JsonObject,
  name: string,
  action: DomainGroup['action'],
): JsonObject => {
  const next = JSON.parse(JSON.stringify(config)) as JsonObject;
  next.route = next.route ?? {};
  next.route.rule_set = Array.isArray(next.route.rule_set) ? next.route.rule_set : [];
  next.route.rules = Array.isArray(next.route.rules) ? next.route.rules : [];

  const ruleSets = next.route.rule_set as JsonObject[];
  const routeRules = next.route.rules as JsonObject[];
  const outbound = domainActionToOutbound(action);

  const set = ruleSets.find((item) => item?.type === 'inline' && item?.tag === name);
  if (!set) {
    ruleSets.push({ type: 'inline', tag: name, rules: [] });
  }

  const mapping = routeRules.find((item) => Array.isArray(item?.rule_set) && item.rule_set.includes(name));
  if (mapping) {
    mapping.outbound = outbound;
  } else {
    routeRules.push({ rule_set: [name], outbound });
  }

  return next;
};

const renameDomainGroupInConfig = (
  config: JsonObject,
  from: string,
  to: string,
): JsonObject => {
  if (!from || !to || from === to) return config;
  const next = JSON.parse(JSON.stringify(config)) as JsonObject;
  next.route = next.route ?? {};
  next.route.rule_set = Array.isArray(next.route.rule_set) ? next.route.rule_set : [];
  next.route.rules = Array.isArray(next.route.rules) ? next.route.rules : [];

  const ruleSets = next.route.rule_set as JsonObject[];
  const routeRules = next.route.rules as JsonObject[];
  const dnsRules = Array.isArray(next.dns?.rules) ? (next.dns.rules as JsonObject[]) : [];
  for (const item of ruleSets) {
    if (item?.type === 'inline' && item?.tag === from) {
      item.tag = to;
    }
  }
  for (const item of routeRules) {
    if (!Array.isArray(item?.rule_set)) continue;
    item.rule_set = item.rule_set.map((value: unknown) => (value === from ? to : value));
  }
  for (const item of dnsRules) {
    if (!Array.isArray(item?.rule_set)) continue;
    item.rule_set = item.rule_set.map((value: unknown) => (value === from ? to : value));
  }
  return next;
};

const updateDomainGroupActionInConfig = (
  config: JsonObject,
  name: string,
  action: DomainGroup['action'],
): JsonObject => {
  const next = JSON.parse(JSON.stringify(config)) as JsonObject;
  next.route = next.route ?? {};
  next.route.rules = Array.isArray(next.route.rules) ? next.route.rules : [];
  const routeRules = next.route.rules as JsonObject[];
  const outbound = domainActionToOutbound(action);
  const mapping = routeRules.find((item) => Array.isArray(item?.rule_set) && item.rule_set.includes(name));
  if (mapping) {
    mapping.outbound = outbound;
  } else {
    routeRules.push({ rule_set: [name], outbound });
  }
  return next;
};

const updateDomainGroupDnsInConfig = (
  config: JsonObject,
  name: string,
  dnsServer?: string,
): JsonObject => {
  const next = JSON.parse(JSON.stringify(config)) as JsonObject;
  next.dns = next.dns ?? {};
  next.dns.rules = Array.isArray(next.dns.rules) ? next.dns.rules : [];
  const dnsRules = next.dns.rules as JsonObject[];

  const existingIndex = dnsRules.findIndex(
    (item) => Array.isArray(item?.rule_set) && item.rule_set.includes(name),
  );

  if (!dnsServer || !dnsServer.trim()) {
    if (existingIndex >= 0) {
      dnsRules.splice(existingIndex, 1);
    }
    return next;
  }

  if (existingIndex >= 0) {
    dnsRules[existingIndex].server = dnsServer;
  } else {
    dnsRules.push({ rule_set: [name], server: dnsServer });
  }

  return next;
};

const deleteDomainGroupInConfig = (config: JsonObject, name: string): JsonObject => {
  const next = JSON.parse(JSON.stringify(config)) as JsonObject;
  next.route = next.route ?? {};
  next.route.rule_set = Array.isArray(next.route.rule_set) ? next.route.rule_set : [];
  next.route.rules = Array.isArray(next.route.rules) ? next.route.rules : [];

  next.route.rule_set = (next.route.rule_set as JsonObject[]).filter(
    (item) => !(item?.type === 'inline' && item?.tag === name),
  );
  next.route.rules = (next.route.rules as JsonObject[]).filter(
    (item) => !(Array.isArray(item?.rule_set) && item.rule_set.includes(name)),
  );
  next.dns = next.dns ?? {};
  next.dns.rules = Array.isArray(next.dns.rules) ? next.dns.rules : [];
  next.dns.rules = (next.dns.rules as JsonObject[]).filter(
    (item) => !(Array.isArray(item?.rule_set) && item.rule_set.includes(name)),
  );
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

const toProxyGroups = (config: JsonObject): ProxyGroup[] => {
  const outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
  return outbounds
    .filter((item) => {
      const type = String(item?.type ?? '').toLowerCase();
      return type === 'selector' || type === 'urltest' || type === 'fallback';
    })
    .map((item, index) => {
      const type = String(item?.type ?? '').toLowerCase();
      const normalizedType = (type === 'urltest' ? 'urltest' : type === 'fallback' ? 'fallback' : 'manual') as ProxyGroup['type'];
      return {
        id: `group:${encodeURIComponent(String(item?.tag ?? `group-${index + 1}`))}`,
        name: String(item?.tag ?? `group-${index + 1}`),
        type: normalizedType,
        outbounds: Array.isArray(item?.outbounds)
          ? item.outbounds.filter((entry: unknown): entry is string => typeof entry === 'string')
          : [],
        defaultOutbound: typeof item?.default === 'string' ? item.default : undefined,
        url: typeof item?.url === 'string' ? item.url : undefined,
        interval: typeof item?.interval === 'string' ? item.interval : undefined,
      };
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

const decodeGroupTagFromId = (id: string): string | null => {
  const matched = /^group:(.+)$/.exec(id);
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

const upsertProxyGroupInConfig = (
  config: JsonObject,
  payload: {
    id?: string;
    name: string;
    type: ProxyGroup['type'];
    outbounds: string[];
    defaultOutbound?: string;
    url?: string;
    interval?: string;
  },
): JsonObject => {
  const next = ensureOutboundSection(config);
  const outbounds = next.outbounds as JsonObject[];
  const targetTag = payload.id ? decodeGroupTagFromId(payload.id) : null;
  const existingIndex = targetTag
    ? outbounds.findIndex((item) => String(item?.tag ?? '') === targetTag)
    : -1;

  const nextTag = payload.name.trim();
  const base = existingIndex >= 0 ? outbounds[existingIndex] : {};
  const type = payload.type === 'manual' ? 'selector' : payload.type;
  const members = Array.from(
    new Set(payload.outbounds.map((item) => item.trim()).filter(Boolean)),
  );
  const nextPayload: JsonObject = {
    ...base,
    tag: nextTag,
    type,
    outbounds: members,
    interrupt_exist_connections: false,
  };

  if (type === 'selector') {
    if (payload.defaultOutbound?.trim()) {
      nextPayload.default = payload.defaultOutbound.trim();
    } else {
      delete nextPayload.default;
    }
    delete nextPayload.url;
    delete nextPayload.interval;
    delete nextPayload.tolerance;
    delete nextPayload.idle_timeout;
  } else {
    if (payload.url?.trim()) {
      nextPayload.url = payload.url.trim();
    }
    if (payload.interval?.trim()) {
      nextPayload.interval = payload.interval.trim();
    }
    if (type === 'urltest') {
      nextPayload.tolerance = Number(nextPayload.tolerance ?? 80);
      nextPayload.idle_timeout = String(nextPayload.idle_timeout ?? '30m');
    } else {
      delete nextPayload.tolerance;
      delete nextPayload.idle_timeout;
    }
    delete nextPayload.default;
  }

  if (existingIndex >= 0) {
    outbounds[existingIndex] = nextPayload;
  } else {
    outbounds.push(nextPayload);
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

const KNOWN_MATCH_KEYS = new Set(['rule_set', 'domain', 'domain_suffix', 'ip_cidr', 'geosite', 'geoip', 'protocol', 'port', 'process_name']);

const parseMatchExpr = (expr: string): { key?: string; value: string } => {
  const trimmed = expr.trim();
  const sepIndex = trimmed.indexOf(':');
  if (sepIndex <= 0) return { value: trimmed };

  const maybeKey = trimmed.slice(0, sepIndex).trim();
  if (!KNOWN_MATCH_KEYS.has(maybeKey)) {
    return { value: trimmed };
  }

  const value = trimmed.slice(sepIndex + 1).trim();
  if (!value) return { value: trimmed };
  return { key: maybeKey, value };
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

  const normalizedDetour = typeof server.detour === 'string' && server.detour.trim()
    ? server.detour.trim()
    : undefined;

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
      ...(normalizedDetour ? { detour: normalizedDetour } : {}),
    };
  } else if (server.type === 'doh') {
    payload = {
      type: 'https',
      tag,
      server: server.address,
      ...(normalizedDetour ? { detour: normalizedDetour } : {}),
    };
  } else {
    payload = {
      type: 'udp',
      tag,
      server: server.address,
      ...(normalizedDetour ? { detour: normalizedDetour } : {}),
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
      topDirect: [],
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
      topDirect: [],
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
      topDirect: [],
      topBlocked: []
    }
  }
];

export const mockApi = {
  syncCurrentUserFromSession: async (): Promise<void> => {
    const session = loadSession();
    const user = session?.user;
    if (!user?.sub) return;
    await fetchJson<{ success: boolean }>(AUTH_SYNC_USER_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sub: user.sub,
        name: typeof user.name === 'string' ? user.name : undefined,
        email: typeof user.email === 'string' ? user.email : undefined,
        preferred_username: typeof user.preferred_username === 'string' ? user.preferred_username : undefined,
        picture: typeof (user as any).picture === 'string' ? (user as any).picture : undefined,
      }),
    });
  },
  getDomains: async (): Promise<DomainRule[]> => {
    await sleep(200);
    const config = await loadConfig();
    return toDomainRules(config);
  },

  getDomainGroups: async (): Promise<DomainGroup[]> => {
    await sleep(160);
    const config = await loadConfig();
    return toDomainGroups(config);
  },

  saveDomainGroup: async (payload: {
    id?: string;
    name: string;
    action: DomainGroup['action'];
    previousName?: string;
    dnsServer?: string;
  }): Promise<DomainGroup[]> => {
    await sleep(180);
    const targetName = payload.name.trim();
    if (!targetName) throw new Error('group name is required');

    let config = await loadConfig();
    config = ensureDomainGroupInConfig(config, targetName, payload.action);

    const fromName = payload.previousName?.trim();
    if (fromName && fromName !== targetName) {
      config = renameDomainGroupInConfig(config, fromName, targetName);
    }
    config = updateDomainGroupActionInConfig(config, targetName, payload.action);
    config = updateDomainGroupDnsInConfig(config, targetName, payload.dnsServer);

    await replaceModuleRows('route.rule_set', Array.isArray(config.route?.rule_set) ? config.route.rule_set : [], 'tag');
    await replaceModuleRows('route.rules', Array.isArray(config.route?.rules) ? config.route.rules : []);
    await replaceModuleRows('dns.rules', Array.isArray(config.dns?.rules) ? config.dns.rules : []);
    const synced = await loadConfig();
    return toDomainGroups(synced);
  },

  deleteDomainGroup: async (name: string): Promise<DomainGroup[]> => {
    await sleep(160);
    const config = await loadConfig();
    const nextConfig = deleteDomainGroupInConfig(config, name);
    await replaceModuleRows('route.rule_set', Array.isArray(nextConfig.route?.rule_set) ? nextConfig.route.rule_set : [], 'tag');
    await replaceModuleRows('route.rules', Array.isArray(nextConfig.route?.rules) ? nextConfig.route.rules : []);
    await replaceModuleRows('dns.rules', Array.isArray(nextConfig.dns?.rules) ? nextConfig.dns.rules : []);
    const synced = await loadConfig();
    return toDomainGroups(synced);
  },

  saveDomainRule: async (payload: Partial<DomainRule> & { id?: string }): Promise<DomainRule[]> => {
    await sleep(180);
    const config = await loadConfig();
    const current = toDomainRules(config);
    const existing = payload.id ? current.find((item) => item.id === payload.id) : undefined;
    const nextRule: DomainRule = {
      id: payload.id || domainRuleId(payload.group || 'custom', (payload.type as DomainRule['type']) || 'domain_suffix', payload.value || ''),
      type: (payload.type as DomainRule['type']) || existing?.type || 'domain_suffix',
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

    await replaceModuleRows('route.rule_set', Array.isArray(nextConfig.route?.rule_set) ? nextConfig.route.rule_set : [], 'tag');
    await replaceModuleRows('route.rules', Array.isArray(nextConfig.route?.rules) ? nextConfig.route.rules : []);
    const synced = await loadConfig();
    return toDomainRules(synced);
  },

  deleteDomainRule: async (id: string): Promise<DomainRule[]> => {
    await sleep(160);
    const config = await loadConfig();
    const nextConfig = deleteDomainInConfig(config, id);
    await replaceModuleRows('route.rule_set', Array.isArray(nextConfig.route?.rule_set) ? nextConfig.route.rule_set : [], 'tag');
    await replaceModuleRows('route.rules', Array.isArray(nextConfig.route?.rules) ? nextConfig.route.rules : []);
    const synced = await loadConfig();
    return toDomainRules(synced);
  },

  getProxies: async (): Promise<ProxyNode[]> => {
    await sleep(220);
    const config = await loadConfig();
    return toProxyNodes(config);
  },

  getProxyGroups: async (): Promise<ProxyGroup[]> => {
    await sleep(180);
    const config = await loadConfig();
    return toProxyGroups(config);
  },

  saveProxyGroup: async (payload: {
    id?: string;
    name: string;
    type: ProxyGroup['type'];
    outbounds: string[];
    defaultOutbound?: string;
    url?: string;
    interval?: string;
  }): Promise<ProxyGroup[]> => {
    await sleep(180);
    if (!payload.name.trim()) {
      throw new Error('group name is required');
    }
    const config = await loadConfig();
    const nextConfig = upsertProxyGroupInConfig(config, payload);
    await replaceModuleRows('outbounds', Array.isArray(nextConfig.outbounds) ? nextConfig.outbounds : [], 'tag');
    const synced = await loadConfig();
    return toProxyGroups(synced);
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
    await replaceModuleRows('outbounds', Array.isArray(nextConfig.outbounds) ? nextConfig.outbounds : [], 'tag');
    const synced = await loadConfig();
    return toProxyNodes(synced);
  },

  deleteProxyNode: async (id: string): Promise<ProxyNode[]> => {
    await sleep(150);
    const config = await loadConfig();
    const nextConfig = deleteProxyInConfig(config, id);
    await replaceModuleRows('outbounds', Array.isArray(nextConfig.outbounds) ? nextConfig.outbounds : [], 'tag');
    const synced = await loadConfig();
    return toProxyNodes(synced);
  },

  checkProxiesLatency: async (): Promise<ProxyNode[]> => {
    const config = await loadConfig();
    const nodes = toProxyNodes(config);
    const checkedAt = nowLabel();
    try {
      const response = await fetchJson<
        Array<{ id: string; latency: number | null; checkedAt: string; targetIp?: string }>
      >(PROXY_LATENCY_PATH, {
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
      const responseById = new Map(response.map((item) => [item.id, item] as const));
      for (const item of response) {
        const node = nodes.find((candidate) => candidate.id === item.id);
        if (!node) continue;
        if (item.latency == null) {
          proxyLatencyCache.set(latencyCacheKey(node), {
            latencyStatus: 'failed',
            lastChecked: item.checkedAt || checkedAt,
            resolvedAddress: item.targetIp,
          });
          continue;
        }
        proxyLatencyCache.set(latencyCacheKey(node), {
          latency: item.latency,
          latencyStatus: 'ok',
          lastChecked: item.checkedAt || checkedAt,
          resolvedAddress: item.targetIp,
        });
      }

      for (const node of nodes) {
        const result = responseById.get(node.id);
        if (!result) {
          proxyLatencyCache.set(latencyCacheKey(node), {
            latencyStatus: 'failed',
            lastChecked: checkedAt,
          });
          continue;
        }
        if (result.latency == null) {
          proxyLatencyCache.set(latencyCacheKey(node), {
            latencyStatus: 'failed',
            lastChecked: result.checkedAt || checkedAt,
          });
        }
      }
    } catch {
      for (const node of nodes) {
        proxyLatencyCache.set(latencyCacheKey(node), {
          latencyStatus: 'failed',
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
    await replaceModuleRows('route.rules', Array.isArray(nextConfig.route?.rules) ? nextConfig.route.rules : []);
    const synced = await loadConfig();
    return toRoutingRules(synced);
  },

  deleteRoutingRule: async (id: string): Promise<RoutingRule[]> => {
    await sleep(160);
    const config = await loadConfig();
    const nextConfig = deleteRoutingRuleInConfig(config, id);
    await replaceModuleRows('route.rules', Array.isArray(nextConfig.route?.rules) ? nextConfig.route.rules : []);
    const synced = await loadConfig();
    return toRoutingRules(synced);
  },

  moveRoutingRule: async (payload: {
    id: string;
    direction: 'up' | 'down';
  }): Promise<RoutingRule[]> => {
    await sleep(140);
    const config = await loadConfig();
    const nextConfig = moveRoutingRuleInConfig(config, payload.id, payload.direction);
    await replaceModuleRows('route.rules', Array.isArray(nextConfig.route?.rules) ? nextConfig.route.rules : []);
    const synced = await loadConfig();
    return toRoutingRules(synced);
  },

  getDns: async (): Promise<DnsUpstream[]> => {
    await sleep(180);
    const config = await loadConfig();
    return toDnsServers(config);
  },

  getSettings: async (): Promise<CoreSettings> => {
    await sleep(120);
    const config = await loadConfig();
    return toCoreSettings(config);
  },

  getOutboundTags: async (): Promise<string[]> => {
    await sleep(100);
    const config = await loadConfig();
    return listOutboundTags(config);
  },

  saveSettings: async (payload: CoreSettings): Promise<CoreSettings> => {
    await sleep(160);
    const config = await loadConfig();
    const nextConfig = applyCoreSettings(config, payload);
    const dnsSection = (nextConfig.dns as JsonObject) ?? {};
    const dnsFinal = pickDNSRefTag(dnsSection, nextConfig.dns?.final, '');
    const routeDefaultDomainResolver = pickDNSRefTag(dnsSection, nextConfig.route?.default_domain_resolver, dnsFinal);
    await replaceMetaRow('meta.log', nextConfig.log ?? {});
    await replaceMetaRow('meta.ntp', nextConfig.ntp ?? {});
    await replaceMetaRow('meta.dns', {
      final: dnsFinal,
      independent_cache: nextConfig.dns?.independent_cache ?? false,
      strategy: nextConfig.dns?.strategy ?? 'prefer_ipv4',
    });
    await replaceMetaRow('meta.route', {
      final: nextConfig.route?.final ?? 'proxy',
      auto_detect_interface: nextConfig.route?.auto_detect_interface ?? true,
      default_domain_resolver: routeDefaultDomainResolver,
    });
    await replaceModuleRows('inbounds', Array.isArray(nextConfig.inbounds) ? nextConfig.inbounds : [], 'tag');
    const synced = await loadConfig();
    return toCoreSettings(synced);
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
    const dnsSection = (nextConfig.dns as JsonObject) ?? {};
    const dnsFinal = pickDNSRefTag(dnsSection, nextConfig.dns?.final, '');
    await replaceModuleRows('dns.servers', Array.isArray(nextConfig.dns?.servers) ? nextConfig.dns.servers : [], 'tag');
    await replaceMetaRow('meta.dns', {
      final: dnsFinal,
      independent_cache: nextConfig.dns?.independent_cache ?? false,
      strategy: nextConfig.dns?.strategy ?? 'prefer_ipv4',
    });
    const synced = await loadConfig();
    return toDnsServers(synced);
  },

  deleteDnsServer: async (id: string): Promise<DnsUpstream[]> => {
    await sleep(140);
    const config = await loadConfig();
    const nextConfig = deleteDnsServerInConfig(config, id);
    const dnsSection = (nextConfig.dns as JsonObject) ?? {};
    const dnsFinal = pickDNSRefTag(dnsSection, nextConfig.dns?.final, '');
    await replaceModuleRows('dns.servers', Array.isArray(nextConfig.dns?.servers) ? nextConfig.dns.servers : [], 'tag');
    await replaceModuleRows('dns.rules', Array.isArray(nextConfig.dns?.rules) ? nextConfig.dns.rules : []);
    await replaceMetaRow('meta.dns', {
      final: dnsFinal,
      independent_cache: nextConfig.dns?.independent_cache ?? false,
      strategy: nextConfig.dns?.strategy ?? 'prefer_ipv4',
    });
    const synced = await loadConfig();
    return toDnsServers(synced);
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
    await replaceModuleRows('dns.servers', Array.isArray(nextConfig.dns?.servers) ? nextConfig.dns.servers : [], 'tag');
    const synced = await loadConfig();
    return toHostsEntries(synced);
  },

  deleteHostEntry: async (id: string): Promise<HostsEntry[]> => {
    await sleep(130);
    const config = await loadConfig();
    const nextConfig = deleteHostInConfig(config, id);
    await replaceModuleRows('dns.servers', Array.isArray(nextConfig.dns?.servers) ? nextConfig.dns.servers : [], 'tag');
    const synced = await loadConfig();
    return toHostsEntries(synced);
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
    await replaceModuleRows('dns.servers', Array.isArray(nextConfig.dns?.servers) ? nextConfig.dns.servers : [], 'tag');
    const synced = await loadConfig();
    return toHostsEntries(synced);
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
    const remote = await fetchJson<UnifiedProfile>('/api/v1/client/profile?scope=global');
    mockProfileData = { ...remote };
    return remote;
  },

  getMyUnifiedProfile: async (): Promise<UnifiedProfile> => {
    await sleep(180);
    return fetchJson<UnifiedProfile>('/api/v1/client/profile?scope=user');
  },

  saveMyUnifiedProfile: async (payload: { content: string }): Promise<UnifiedProfile> => {
    await sleep(250);
    return fetchJson<UnifiedProfile>('/api/v1/client/profile?scope=user', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  getEffectiveUnifiedProfile: async (): Promise<UnifiedProfile> => {
    await sleep(180);
    return fetchJson<UnifiedProfile>('/api/v1/client/profile?scope=effective');
  },

  getMyProfileAudits: async (limit = 20): Promise<UserProfileAudit[]> => {
    await sleep(120);
    return fetchJson<UserProfileAudit[]>(`/api/v1/client/profile/audits?limit=${Math.max(1, Math.min(100, limit))}`);
  },

  saveUnifiedProfile: async (payload: { content: string; publicUrl?: string }): Promise<UnifiedProfile> => {
    await sleep(300);
    const remote = await fetchJson<UnifiedProfile>('/api/v1/client/profile?scope=global', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    mockProfileData = { ...remote };
    return remote;
  },

  getUsers: async (): Promise<User[]> => {
    await sleep(240);
    return fallbackUnlessAuthError(
      () => fetchJson<User[]>(USERS_PATH),
      () => [...mockUsers],
    );
  },

  getDashboardSummary: async (): Promise<DashboardSummary> => {
    await sleep(120);
    return fallbackUnlessAuthError(
      () => fetchJson<DashboardSummary>(DASHBOARD_PATH),
      async () => {
      const users = await mockApi.getUsers();
      const activeUsers = users.filter((user) => user.status === 'active').length;
      const upload = users.reduce((sum, user) => sum + user.traffic.upload, 0);
      const download = users.reduce((sum, user) => sum + user.traffic.download, 0);
      return {
        stats: {
          activeUsers,
          activeNodes: 0,
          systemLoadPercent: 0,
          configVersion: 'v0.0.0',
        },
        traffic: {
          uploadSeries: Array.from({ length: 24 }, (_, index) => Math.floor((upload / 24) * (index / 23))),
          downloadSeries: Array.from({ length: 24 }, (_, index) => Math.floor((download / 24) * (index / 23))),
        },
        devices: {
          series: Array.from({ length: 24 }, () => users.reduce((sum, user) => sum + user.devices.length, 0)),
        },
        syncRequests: {
          series: Array.from({ length: 24 }, () => 0),
        },
        auditLogs: [],
      };
      },
    );
  },

  getFailedDomains: async (input?: {
    window?: string;
    limit?: number;
    userId?: string;
    outboundType?: string;
  }): Promise<FailedDomainSummary[]> => {
    await sleep(100);
    const params = new URLSearchParams();
    if (input?.window) params.set('window', input.window);
    if (Number.isFinite(input?.limit as number)) params.set('limit', String(Math.trunc(input?.limit as number)));
    if (input?.userId) params.set('userId', input.userId);
    if (input?.outboundType) params.set('outboundType', input.outboundType);
    const query = params.toString();
    return fetchJson<FailedDomainSummary[]>(`${FAILED_DOMAINS_PATH}${query ? `?${query}` : ''}`);
  },

  getUser: async (id: string): Promise<User | undefined> => {
    await sleep(180);
    return fallbackUnlessAuthError(
      () => fetchJson<User>(`${USERS_PATH}/${encodeURIComponent(id)}`),
      () => mockUsers.find((u) => u.id === id),
    );
  },

  getUserTargets: async (id: string, limit = 200): Promise<UserTargetAggregate[]> => {
    await sleep(160);
    return fallbackUnlessAuthError(
      () => fetchJson<UserTargetAggregate[]>(`${userTargetsPath(id)}?limit=${Math.max(1, Math.min(500, limit))}`),
      () => [],
    );
  },

  getUserTargetDetail: async (id: string, target: string): Promise<UserTargetDetail | undefined> => {
    await sleep(120);
    return fallbackUnlessAuthError(
      () => fetchJson<UserTargetDetail>(userTargetDetailPath(id, target)),
      () => undefined,
    );
  },

  reportClientConnect: async (payload: ClientDeviceReportPayload): Promise<User | undefined> => {
    const response = await fetchJson<{ success: boolean; user?: User }>(CLIENT_CONNECT_REPORT_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.user;
  },

  reportClientConnections: async (payload: ClientConnectionReportPayload): Promise<User | undefined> => {
    const response = await fetchJson<{ success: boolean; user?: User }>(CLIENT_CONNECTIONS_REPORT_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.user;
  },

  updateCurrentUserDisplayName: async (displayName: string): Promise<User> => {
    const session = loadSession();
    const sub = session?.user?.sub;
    const name = displayName.trim();
    if (!sub) {
      throw new Error('missing_user_sub');
    }
    if (!name) {
      throw new Error('display_name_required');
    }
    return fetchJson<User>(`${USERS_PATH}/${encodeURIComponent(sub)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: name }),
    });
  },
};

export const qualityApi = {
  getObservability: async (params: { window?: string; topN?: number; bucket?: string } = {}): Promise<QualityObservability> => {
    const search = new URLSearchParams();
    if (params.window) search.set('window', params.window);
    if (params.topN) search.set('topN', String(params.topN));
    if (params.bucket) search.set('bucket', params.bucket);
    const query = search.toString();

    try {
      const payload = await fetchJson<unknown>(`${QUALITY_OBSERVABILITY_PATH}${query ? `?${query}` : ''}`);
      return normalizeObservabilityResponse(payload);
    } catch (error) {
      if (isAuthFailureError(error)) {
        throw error;
      }
      if (QUALITY_MOCK_FALLBACK) {
        console.warn('[qualityApi] falling back to mock observability payload:', error);
        return normalizeObservabilityResponse(mockQualityObservabilityPayload);
      }
      throw error;
    }
  },
};
