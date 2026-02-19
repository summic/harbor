import path from 'path';
import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const SUBSCRIPTION_TOKEN = 'u1-alice-7f8a9d2b';
const SUBSCRIPTION_PATH = '/api/v1/client/subscribe';
const PROFILE_PATH = '/api/v1/client/profile';
const SIMULATE_PATH = '/api/v1/simulate/traffic';
const PROFILE_STORE_PATH = path.resolve(__dirname, '.local-data', 'unified-profile.json');

const SUBSCRIPTION_PROFILE = {
  log: {
    level: 'info',
    timestamp: true,
  },
  dns: {
    servers: [
      {
        tag: 'google',
        address: 'tls://8.8.8.8',
        strategy: 'prefer_ipv4',
      },
      {
        tag: 'local',
        address: '223.5.5.5',
        detour: 'direct',
      },
    ],
    rules: [
      { outbound: 'any', server: 'local' },
      { clash_mode: 'Direct', server: 'local' },
      { clash_mode: 'Global', server: 'google' },
      { geosite: 'cn', server: 'local' },
      { geosite: 'geolocation-!cn', server: 'google' },
    ],
  },
  inbounds: [
    {
      type: 'mixed',
      tag: 'mixed-in',
      listen: '::',
      listen_port: 7890,
      sniff: true,
    },
  ],
  outbounds: [
    {
      type: 'selector',
      tag: 'proxy',
      outbounds: ['auto', 'direct'],
    },
    {
      type: 'urltest',
      tag: 'auto',
      outbounds: ['hk-01', 'sg-01'],
      url: 'https://www.gstatic.com/generate_204',
      interval: '10m',
    },
    {
      type: 'direct',
      tag: 'direct',
    },
  ],
  route: {
    rules: [
      { protocol: 'dns', outbound: 'dns-out' },
      { geosite: 'cn', geoip: 'cn', outbound: 'direct' },
      { geosite: 'category-ads-all', outbound: 'block' },
    ],
    auto_detect_interface: true,
  },
};

type StoredProfile = {
  profile: Record<string, unknown>;
  token: string;
  lastUpdated: string;
};

const ensureProfileStore = () => {
  if (!fs.existsSync(PROFILE_STORE_PATH)) {
    fs.mkdirSync(path.dirname(PROFILE_STORE_PATH), { recursive: true });
    const initial: StoredProfile = {
      profile: SUBSCRIPTION_PROFILE as Record<string, unknown>,
      token: SUBSCRIPTION_TOKEN,
      lastUpdated: new Date().toLocaleString(),
    };
    fs.writeFileSync(PROFILE_STORE_PATH, JSON.stringify(initial), 'utf-8');
  }
};

const readProfileStore = (): StoredProfile => {
  ensureProfileStore();
  const raw = fs.readFileSync(PROFILE_STORE_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<StoredProfile> & { content?: string };
  if (parsed.profile && typeof parsed.profile === 'object') {
    return {
      profile: parsed.profile as Record<string, unknown>,
      token: parsed.token || SUBSCRIPTION_TOKEN,
      lastUpdated: parsed.lastUpdated || new Date().toLocaleString(),
    };
  }
  if (typeof parsed.content === 'string') {
    return {
      profile: JSON.parse(parsed.content) as Record<string, unknown>,
      token: parsed.token || SUBSCRIPTION_TOKEN,
      lastUpdated: parsed.lastUpdated || new Date().toLocaleString(),
    };
  }
  return {
    profile: SUBSCRIPTION_PROFILE as Record<string, unknown>,
    token: SUBSCRIPTION_TOKEN,
    lastUpdated: new Date().toLocaleString(),
  };
};

const writeProfileStore = (data: StoredProfile) => {
  fs.mkdirSync(path.dirname(PROFILE_STORE_PATH), { recursive: true });
  fs.writeFileSync(PROFILE_STORE_PATH, JSON.stringify(data), 'utf-8');
};

const getOrigin = (req: IncomingMessage) => {
  const host = req.headers.host ?? 'localhost:3000';
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
  return `${proto}://${host}`;
};

const toUnifiedProfilePayload = (req: IncomingMessage, data: StoredProfile) => ({
  content: JSON.stringify(data.profile, null, 2),
  publicUrl: `${getOrigin(req)}${SUBSCRIPTION_PATH}?token=${data.token}`,
  lastUpdated: data.lastUpdated,
  size: `${(Buffer.byteLength(JSON.stringify(data.profile), 'utf8') / 1024).toFixed(1)} KB`,
});

const readBody = async (req: IncomingMessage): Promise<string> =>
  await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += String(chunk);
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload, null, 2));
};

type SimCtx = {
  domain?: string;
  ip?: string;
  protocol?: string;
  port?: number;
};

const isIPv4 = (value: string): boolean =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(value) &&
  value.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);

const extractHost = (target: string): string => {
  try {
    const parsed = new URL(target.includes('://') ? target : `https://${target}`);
    return parsed.hostname;
  } catch {
    return target.split('/')[0].split(':')[0];
  }
};

const ipToInt = (ip: string): number =>
  ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;

const matchIpCidr = (ip: string, cidr: string): boolean => {
  if (!cidr.includes('/')) return ip === cidr;
  const [network, maskBitsRaw] = cidr.split('/');
  const maskBits = Number(maskBitsRaw);
  if (!isIPv4(network) || !isIPv4(ip) || !Number.isFinite(maskBits)) return false;
  const mask = maskBits === 0 ? 0 : (~((1 << (32 - maskBits)) - 1)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
};

const isPrivateIPv4 = (ip: string): boolean => {
  const parts = ip.split('.').map((item) => Number(item));
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 127) return true;
  return false;
};

const toArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') return [value];
  return [];
};

const matchRule = (rule: Record<string, any>, ctx: SimCtx): boolean => {
  const checks: boolean[] = [];

  const domains = toArray(rule.domain);
  if (domains.length) checks.push(!!ctx.domain && domains.includes(ctx.domain));

  const suffixes = toArray(rule.domain_suffix);
  if (suffixes.length) checks.push(!!ctx.domain && suffixes.some((item) => ctx.domain === item || ctx.domain!.endsWith(`.${item}`)));

  const keywords = toArray(rule.domain_keyword);
  if (keywords.length) checks.push(!!ctx.domain && keywords.some((item) => ctx.domain!.includes(item)));

  const regexList = toArray(rule.domain_regex);
  if (regexList.length) {
    checks.push(
      !!ctx.domain &&
        regexList.some((expr) => {
          try {
            return new RegExp(expr).test(ctx.domain!);
          } catch {
            return false;
          }
        }),
    );
  }

  const ipCidrs = toArray(rule.ip_cidr);
  if (ipCidrs.length) checks.push(!!ctx.ip && ipCidrs.some((item) => matchIpCidr(ctx.ip!, item)));

  const protocols = toArray(rule.protocol).map((item) => item.toLowerCase());
  if (protocols.length) checks.push(!!ctx.protocol && protocols.includes(ctx.protocol.toLowerCase()));

  if (rule.ip_is_private === true) checks.push(!!ctx.ip && isPrivateIPv4(ctx.ip));

  if (checks.length === 0) return false;
  return checks.every(Boolean);
};

const buildInlineRuleSetMatcher = (profile: Record<string, any>) => {
  const result = new Map<string, (ctx: SimCtx) => boolean>();
  const ruleSets = Array.isArray(profile.route?.rule_set) ? profile.route.rule_set : [];
  for (const set of ruleSets) {
    const tag = typeof set?.tag === 'string' ? set.tag : '';
    if (!tag || set?.type !== 'inline' || !Array.isArray(set?.rules)) continue;
    result.set(tag, (ctx: SimCtx) => set.rules.some((rule: Record<string, any>) => matchRule(rule, ctx)));
  }
  return result;
};

const matchRouteRule = (rule: Record<string, any>, ctx: SimCtx, inlineSet: Map<string, (ctx: SimCtx) => boolean>): boolean => {
  const checks: boolean[] = [];
  const tags = toArray(rule.rule_set);
  if (tags.length) {
    checks.push(tags.some((tag) => inlineSet.get(tag)?.(ctx) === true));
  }

  const selfRuleMatch = matchRule(rule, ctx);
  if (selfRuleMatch) checks.push(true);

  if (checks.length === 0) return false;
  return checks.every(Boolean);
};

const simulateTraffic = (profile: Record<string, any>, input: { target: string; protocol?: string; port?: number }) => {
  const host = extractHost(input.target.trim());
  const ctx: SimCtx = {
    domain: isIPv4(host) ? undefined : host.toLowerCase(),
    ip: isIPv4(host) ? host : undefined,
    protocol: (input.protocol || 'tcp').toLowerCase(),
    port: input.port,
  };

  const inlineSet = buildInlineRuleSetMatcher(profile);
  const routeRules = Array.isArray(profile.route?.rules) ? profile.route.rules : [];
  const dnsRules = Array.isArray(profile.dns?.rules) ? profile.dns.rules : [];

  const matchedRules: Array<{ index: number; summary: string; outbound?: string; action?: string }> = [];
  const actions: Array<{ index: number; summary: string; outbound?: string; action?: string }> = [];
  let finalOutbound = typeof profile.route?.final === 'string' ? profile.route.final : 'direct';
  let usedFinalFallback = true;

  for (let i = 0; i < routeRules.length; i += 1) {
    const rule = routeRules[i] as Record<string, any>;
    if (!matchRouteRule(rule, ctx, inlineSet)) continue;

    const summary = JSON.stringify(rule);
    if (typeof rule.action === 'string') {
      const hit = { index: i + 1, summary, action: rule.action };
      actions.push(hit);
      matchedRules.push(hit);
      if (rule.action === 'hijack-dns' && ctx.protocol === 'dns') {
        finalOutbound = 'dns-out';
        usedFinalFallback = false;
        break;
      }
      continue;
    }

    if (typeof rule.outbound === 'string') {
      const hit = { index: i + 1, summary, outbound: rule.outbound };
      matchedRules.push(hit);
      finalOutbound = rule.outbound;
      usedFinalFallback = false;
      break;
    }
  }

  let selectedDnsServer = typeof profile.dns?.final === 'string' ? profile.dns.final : 'dns_direct';
  let matchedDnsRule: string | undefined;
  for (let i = 0; i < dnsRules.length; i += 1) {
    const rule = dnsRules[i] as Record<string, any>;
    let match = false;
    const domains = toArray(rule.domain).map((item) => item.toLowerCase());
    if (domains.length && ctx.domain) match = domains.includes(ctx.domain);
    const tags = toArray(rule.rule_set);
    if (!match && tags.length) {
      match = tags.some((tag) => inlineSet.get(tag)?.(ctx) === true);
    }
    if (match && typeof rule.server === 'string') {
      selectedDnsServer = rule.server;
      matchedDnsRule = `rule #${i + 1}`;
      break;
    }
  }

  return {
    input: {
      target: input.target,
      protocol: ctx.protocol || 'tcp',
      port: input.port,
    },
    normalized: {
      domain: ctx.domain,
      ip: ctx.ip,
    },
    dns: {
      selectedServer: selectedDnsServer,
      matchedRule: matchedDnsRule,
    },
    route: {
      finalOutbound,
      matchedRules,
      actions,
      usedFinalFallback,
    },
  };
};

const subscriptionHandler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
  if (!req.url) {
    next();
    return;
  }

  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === PROFILE_PATH && req.method === 'GET') {
    const current = readProfileStore();
    sendJson(res, 200, toUnifiedProfilePayload(req, current));
    return;
  }

  if (url.pathname === PROFILE_PATH && req.method === 'PUT') {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw) as { content?: string; publicUrl?: string };
      if (typeof payload.content !== 'string') {
        sendJson(res, 400, { error: 'invalid_content' });
        return;
      }
      let profile: Record<string, unknown>;
      try {
        profile = JSON.parse(payload.content) as Record<string, unknown>;
      } catch {
        sendJson(res, 400, { error: 'invalid_profile_json' });
        return;
      }

      const current = readProfileStore();
      let token = current.token;
      if (payload.publicUrl) {
        try {
          const parsed = new URL(payload.publicUrl);
          token = parsed.searchParams.get('token') || token;
        } catch {
          // ignore invalid URL and keep previous token
        }
      }

      const updated: StoredProfile = {
        profile,
        token,
        lastUpdated: new Date().toLocaleString(),
      };
      writeProfileStore(updated);
      sendJson(res, 200, toUnifiedProfilePayload(req, updated));
      return;
    } catch {
      sendJson(res, 400, { error: 'invalid_request' });
      return;
    }
  }

  if (url.pathname === SIMULATE_PATH && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw) as { target?: string; protocol?: string; port?: number };
      if (typeof payload.target !== 'string' || !payload.target.trim()) {
        sendJson(res, 400, { error: 'invalid_target' });
        return;
      }
      const current = readProfileStore();
      const result = simulateTraffic(current.profile, {
        target: payload.target,
        protocol: payload.protocol,
        port: payload.port,
      });
      sendJson(res, 200, result);
      return;
    } catch {
      sendJson(res, 400, { error: 'invalid_request' });
      return;
    }
  }

  if (url.pathname !== SUBSCRIPTION_PATH) {
    next();
    return;
  }

  const token = url.searchParams.get('token');

  if (!token) {
    sendJson(res, 400, { error: 'missing_token' });
    return;
  }

  const current = readProfileStore();
  if (token !== current.token) {
    sendJson(res, 401, { error: 'invalid_token' });
    return;
  }

  sendJson(res, 200, current.profile);
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          name: 'subscription-api-mock',
          configureServer(server) {
            server.middlewares.use(subscriptionHandler);
          },
          configurePreviewServer(server) {
            server.middlewares.use(subscriptionHandler);
          },
        },
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
