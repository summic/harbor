import path from 'path';
import net from 'net';
import type { IncomingMessage, ServerResponse } from 'http';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createDefaultRateLimiter } from './dev-server/api-rate-limit';
import { ConfigStore } from './dev-server/config-store';

const SUBSCRIPTION_PATH = '/api/v1/client/subscribe';
const PROFILE_PATH = '/api/v1/client/profile';
const RULES_PATH = '/api/v1/rules';
const SIMULATE_PATH = '/api/v1/simulate/traffic';
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
const QUALITY_OBSERVABILITY_V1_PATH = '/api/v1/quality/observability';
const QUALITY_OBSERVABILITY_PATH = '/api/quality/observability';
const HEALTH_PATH = '/api/v1/health';
const PROFILE_AUDITS_PATH = '/api/v1/client/profile/audits';
const ADMIN_SUB = 'deeed4b7-748b-4301-8c9e-dfe0893a80cf';
const TRUST_PROXY_HEADERS = (process.env.SAIL_TRUST_PROXY_HEADERS || '').trim().toLowerCase() === 'true';
const TRUSTED_ORIGIN_HOSTS = new Set(
  (process.env.SAIL_TRUSTED_ORIGINS || 'harbor.beforeve.com,localhost,127.0.0.1')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
);
const ALLOWED_USERINFO_HOSTS = new Set(
  (process.env.SAIL_ALLOWED_USERINFO_HOSTS || 'auth0.kylith.com,id.kylith.com')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
);
const SUBSCRIBE_TOKEN_COMPAT =
  (process.env.SAIL_SUBSCRIBE_TOKEN_COMPAT || '').trim().toLowerCase() === 'true';

const STORE = new ConfigStore({
  dbPath: process.env.SAIL_DB_PATH || path.resolve(__dirname, '.local-data', 'sail.sqlite'),
  legacyProfilePath:
    process.env.SAIL_PROFILE_STORE_PATH || path.resolve(__dirname, '.local-data', 'unified-profile.json'),
  importProfilePath:
    process.env.SAIL_IMPORT_PROFILE_PATH || path.resolve(__dirname, '..', 'singbox-config.json'),
  seedProfile: {
    log: { level: 'info', timestamp: true },
    dns: { final: 'dns_direct', strategy: 'prefer_ipv4', servers: [], rules: [] },
    inbounds: [],
    outbounds: [],
    route: { final: 'direct', rules: [], rule_set: [] },
  },
});

const normalizeHeaderHost = (rawHost?: string) => {
  if (!rawHost) return undefined;
  const host = rawHost.split(',')[0]?.trim();
  if (!host) return undefined;
  const colonIndex = host.lastIndexOf(':');
  const hostOnly =
    colonIndex > -1 && !host.startsWith('[') ? host.slice(0, colonIndex).toLowerCase() : host.toLowerCase();
  if (!TRUSTED_ORIGIN_HOSTS.has(hostOnly)) {
    return undefined;
  }
  return host;
};

const getRequestProto = (req: IncomingMessage) => {
  if (TRUST_PROXY_HEADERS) {
    const proto = req.headers['x-forwarded-proto'];
    if (typeof proto === 'string' && /^(https?|wss?)$/i.test(proto.trim())) {
      return proto.trim().toLowerCase();
    }
  }
  return 'http';
};

const getOrigin = (req: IncomingMessage) => {
  const host =
    normalizeHeaderHost(req.headers.host) ??
    '127.0.0.1:5173';
  return `${getRequestProto(req)}://${host}`;
};

const MAX_JSON_BODY_BYTES = 256 * 1024;
const REQUEST_ID_HEADER = 'x-request-id';

const readBody = async (req: IncomingMessage, maxBytes = MAX_JSON_BODY_BYTES): Promise<string> =>
  await new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error(`request body exceeds allowed size (${maxBytes} bytes)`));
        req.destroy();
        return;
      }
      body += String(chunk);
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });

const parseJsonBody = async <T>(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  options: {
    required?: boolean;
    maxBytes?: number;
  } = {},
): Promise<T | null> => {
  const { required = true, maxBytes } = options;
  let raw: string;
  try {
    raw = await readBody(req, maxBytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('request body exceeds allowed size')) {
      sendProblem(res, 413, {
        title: 'Payload too large',
        detail: message,
        instance: pathname,
        code: 'payload_too_large',
      });
    } else {
      sendProblem(res, 400, {
        title: 'Malformed request',
        detail: 'Could not read request body',
        instance: pathname,
        code: 'invalid_request',
      });
    }
    return null;
  }
  if (!raw.trim()) {
    if (!required) {
      return null;
    }
    sendProblem(res, 400, {
      title: 'Malformed request',
      detail: 'Request body is required',
      instance: pathname,
      code: 'invalid_request',
    });
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    sendProblem(res, 400, {
      title: 'Malformed request',
      detail: 'Request body is not valid JSON',
      instance: pathname,
      code: 'invalid_request',
    });
    return null;
  }
};

const getOrCreateRequestId = (req: IncomingMessage): string => {
  const header = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(header) ? header[0] : header;
  if (candidate && candidate.trim()) {
    return candidate.trim();
  }
  return `rid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const emitRequestSummary = (
  req: IncomingMessage,
  res: ServerResponse,
  requestId: string,
  start: number,
  route: string,
) => {
  const method = req.method || 'GET';
  const status = res.statusCode || 200;
  const durationMs = Date.now() - start;
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'log';
  const target = `${method} ${route}`;
  const message = `[harbor][request] ${target} ${status} ${durationMs}ms requestId=${requestId}`;
  if (level === 'error') {
    console.error(message);
  } else if (level === 'warn') {
    console.warn(message);
  } else {
    console.log(message);
  }
};

const API_RATE_LIMITER = createDefaultRateLimiter();

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload, null, 2));
};

const sendProblem = (
  res: ServerResponse,
  status: number,
  params: {
    title: string;
    detail: string;
    instance?: string;
    code?: string;
    type?: string;
    errors?: Array<{ field?: string; message: string }>;
  },
) => {
  const {
    title,
    detail,
    instance,
    code,
    type = `https://harbor.beforeve.com/problems/${code || 'internal-error'}`,
    errors,
  } = params;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(
    JSON.stringify(
      {
        type,
        title,
        status,
        detail,
        ...(instance ? { instance } : {}),
        ...(code ? { code } : {}),
        ...(errors?.length ? { errors } : {}),
      },
      null,
      2,
    ),
  );
};

type AuthInfo = { sub: string };

const TOKEN_SUB_CACHE_TTL_MS = 5 * 60 * 1000;
const tokenSubCache = new Map<string, { sub: string; expiresAt: number }>();
const DEFAULT_USERINFO_URLS = [
  'https://auth0.kylith.com/oauth2/userinfo',
  'https://id.kylith.com/oauth2/userinfo',
];
const ENV_USERINFO_URLS = (process.env.SAIL_OIDC_USERINFO_URLS || process.env.SAIL_OIDC_USERINFO_URL || process.env.VITE_SSO_USERINFO_URL || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const parseJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadBase64.padEnd(Math.ceil(payloadBase64.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const buildUserInfoCandidates = (): string[] => {
  const candidates = [...ENV_USERINFO_URLS, ...DEFAULT_USERINFO_URLS];
  return Array.from(new Set(candidates.filter((candidate) => {
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      return (
        ['http:', 'https:'].includes(url.protocol) &&
        (ALLOWED_USERINFO_HOSTS.has(host) || host.endsWith('.kylith.com'))
      );
    } catch {
      return false;
    }
  })));
};

const normalizeAuthHeader = (value: string | string[] | undefined): string | undefined => {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
};

const requestIP = (req: IncomingMessage): string => {
  const directIp = req.socket.remoteAddress?.trim();
  if (TRUST_PROXY_HEADERS) {
    const forwarded = normalizeAuthHeader(req.headers['x-forwarded-for']);
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    const realIp = normalizeAuthHeader(req.headers['x-real-ip'] as string | undefined);
    if (realIp) {
      return realIp;
    }
  }
  return directIp || 'unknown';
};

const isAllowedUserSub = (sub: string, expectedSub: string | undefined) => {
  if (!expectedSub) return false;
  return sub === expectedSub;
};

const isAdminSub = (sub: string) => sub === ADMIN_SUB;

const requireAuth = async (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<AuthInfo | null> => {
  const accessToken = extractBearerToken(req);
  if (!accessToken) {
    sendProblem(res, 401, {
      title: 'Authentication failed',
      detail: 'Bearer token is required',
      instance: pathname,
      code: 'missing_bearer_token',
    });
    return null;
  }
  const authInfo = await fetchAuthInfo(accessToken);
  if (!authInfo?.sub) {
    sendProblem(res, 401, {
      title: 'Authentication failed',
      detail: 'Invalid access token',
      instance: pathname,
      code: 'invalid_access_token',
    });
    return null;
  }
  return authInfo;
};

const requireAdmin = async (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<AuthInfo | null> => {
  const authInfo = await requireAuth(req, res, pathname);
  if (!authInfo) return null;
  if (!isAdminSub(authInfo.sub)) {
    sendProblem(res, 403, {
      title: 'Forbidden',
      detail: 'Admin scope required',
      instance: pathname,
      code: 'forbidden',
    });
    return null;
  }
  return authInfo;
};

const extractBearerToken = (req: IncomingMessage): string | null => {
  const raw = req.headers.authorization;
  if (!raw) return null;
  const parts = raw.trim().split(/\s+/);
  if (parts.length < 2) return null;
  if (parts[0].toLowerCase() !== 'bearer') return null;
  const token = parts.slice(1).join(' ').trim();
  return token ? token : null;
};

const sanitizeReportedIp = (reportedIp: string | undefined, req: IncomingMessage): string | undefined => {
  const value = (reportedIp || '').trim();
  if (!value || value === '0.0.0.0' || value === '::' || value.toLowerCase() === 'unknown') {
    const source = requestIP(req).trim();
    return source || undefined;
  }
  return value;
};

const tokenSnapshot = (token: string | null) => {
  if (!token) {
    return { present: false };
  }
  const payload = parseJwtPayload(token);
  const exp = typeof payload?.exp === 'number' ? payload.exp : undefined;
  return {
    present: true,
    prefix: token.slice(0, 6),
    suffix: token.slice(-6),
    length: token.length,
    jwtLike: token.split('.').length >= 3,
    sub: typeof payload?.sub === 'string' ? payload.sub : undefined,
    iss: typeof payload?.iss === 'string' ? payload.iss : undefined,
    exp,
    expired: typeof exp === 'number' ? Date.now() >= exp * 1000 : undefined,
  };
};

const logSubscribeAudit = (
  req: IncomingMessage,
  event: 'success' | 'auth_failed' | 'token_compat',
  extra: Record<string, unknown> = {},
) => {
  const token = extractBearerToken(req);
  const snapshot = tokenSnapshot(token);
  const statusCode = event === 'success' || event === 'token_compat' ? 200 : 401;
  STORE.ingestApiRequestLog({
    path: SUBSCRIPTION_PATH,
    method: req.method || 'GET',
    statusCode,
    userId:
      (typeof extra.userSub === 'string' ? extra.userSub : undefined) ||
      (typeof snapshot.sub === 'string' ? snapshot.sub : undefined),
    ip: requestIP(req),
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '',
    occurredAt: new Date().toISOString(),
  });
  const payload = {
    ts: new Date().toISOString(),
    event,
    method: req.method,
    path: req.url ?? SUBSCRIPTION_PATH,
    host: req.headers.host ?? '',
    ip: requestIP(req),
    ua: req.headers['user-agent'] ?? '',
    token: snapshot,
    ...extra,
  };
  if (event === 'success') {
    console.info('[harbor][subscribe]', JSON.stringify(payload));
  } else {
    console.warn('[harbor][subscribe]', JSON.stringify(payload));
  }
};

const fetchAuthInfo = async (accessToken: string): Promise<AuthInfo | null> => {
  const cached = tokenSubCache.get(accessToken);
  if (cached && cached.expiresAt > Date.now()) {
    return { sub: cached.sub };
  }
  const candidates = buildUserInfoCandidates();
  for (const userInfoURL of candidates) {
    try {
      const response = await fetch(userInfoURL, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as { sub?: string };
      const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
      if (!sub) continue;
      tokenSubCache.set(accessToken, { sub, expiresAt: Date.now() + TOKEN_SUB_CACHE_TTL_MS });
      return { sub };
    } catch {
      continue;
    }
  }
  return null;
};

const requireOwnOrAdmin = async (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  targetSub: string,
): Promise<AuthInfo | null> => {
  const authInfo = await requireAuth(req, res, pathname);
  if (!authInfo) {
    return null;
  }
  if (!isAdminSub(authInfo.sub) && !isAllowedUserSub(authInfo.sub, targetSub)) {
    sendProblem(res, 403, {
      title: 'Forbidden',
      detail: 'You do not have permission to access this resource',
      instance: pathname,
      code: 'forbidden',
    });
    return null;
  }
  return authInfo;
};

const safeParseId = (raw: string | undefined): string | null => {
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw).trim();
    return decoded || null;
  } catch {
    return null;
  }
};

const measureTcpLatency = (host: string, port: number, timeoutMs: number): Promise<number | null> =>
  new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;
    const finish = (latency: number | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(latency);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(Date.now() - started));
    socket.once('timeout', () => finish(null));
    socket.once('error', () => finish(null));
    socket.connect(port, host);
  });

const subscriptionHandler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
  if (!req.url) {
    next();
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const requestId = getOrCreateRequestId(req);
  const startedAt = Date.now();
  res.setHeader('X-Request-Id', requestId);
  const route = `${url.pathname}${url.search}`;
  res.on('finish', () => {
    emitRequestSummary(req, res, requestId, startedAt, route);
  });
  if (url.pathname.startsWith('/api/')) {
    API_RATE_LIMITER.cleanup();
    const rateLimit = API_RATE_LIMITER.check({ key: requestIP(req), route: url.pathname, now: startedAt });
    res.setHeader('X-RateLimit-Limit', String(rateLimit.limit));
    res.setHeader('X-RateLimit-Reset', String(rateLimit.resetAt));
    if (rateLimit.remaining <= 0) {
      res.setHeader('X-RateLimit-Remaining', '0');
    } else {
      res.setHeader('X-RateLimit-Remaining', String(rateLimit.remaining));
    }

    if (!rateLimit.allowed) {
      if (rateLimit.retryAfterSeconds) {
        res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
      }
      res.statusCode = 429;
      sendProblem(res, 429, {
        title: 'Too Many Requests',
        detail: 'API rate limit exceeded',
        instance: url.pathname,
        code: 'rate_limited',
      });
      return;
    }
  }

  if (url.pathname === HEALTH_PATH && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      service: 'harbor',
      time: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === PROFILE_AUDITS_PATH && req.method === 'GET') {
    const authInfo = await requireAuth(req, res, url.pathname);
    if (!authInfo) {
      return;
    }
    const limit = Number(url.searchParams.get('limit') ?? '20');
    sendJson(res, 200, STORE.listUserProfileAudits(authInfo.sub, limit));
    return;
  }

  if (url.pathname === PROFILE_PATH && req.method === 'GET') {
    const authInfo = await requireAuth(req, res, url.pathname);
    if (!authInfo) {
      return;
    }
    const scope = (url.searchParams.get('scope') as 'effective' | 'global' | 'user' | null) || 'effective';
    if (scope === 'global' && authInfo.sub !== ADMIN_SUB) {
      sendProblem(res, 403, {
        title: 'Forbidden',
        detail: 'Admin scope required',
        instance: url.pathname,
        code: 'forbidden',
      });
      return;
    }
    sendJson(res, 200, STORE.getUnifiedProfile(getOrigin(req), authInfo.sub, scope));
    return;
  }

  if (url.pathname === PROFILE_PATH && req.method === 'PUT') {
    const authInfo = await requireAuth(req, res, url.pathname);
    if (!authInfo) return;
    const payload = await parseJsonBody<{ content?: string; publicUrl?: string }>(req, res, url.pathname);
    if (!payload) return;
    if (typeof payload.content !== 'string') {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: 'content must be a string',
        instance: url.pathname,
        code: 'invalid_content',
      });
      return;
    }
    const scope = (url.searchParams.get('scope') as 'effective' | 'global' | 'user' | null) || 'user';
    try {
      let updated;
      if (scope === 'global') {
        if (!isAdminSub(authInfo.sub)) {
          sendProblem(res, 403, {
            title: 'Forbidden',
            detail: 'Admin scope required',
            instance: url.pathname,
            code: 'forbidden',
          });
          return;
        }
        updated = STORE.saveUnifiedProfile(payload.content, payload.publicUrl);
      } else {
        updated = STORE.saveUserUnifiedProfile(authInfo.sub, payload.content);
      }
      const origin = getOrigin(req);
      if (origin.startsWith('http')) {
        updated.publicUrl = `${origin}${SUBSCRIPTION_PATH}`;
      }
      sendJson(res, 200, updated);
    } catch (error) {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: error instanceof Error ? error.message : 'invalid profile payload',
        instance: url.pathname,
        code: 'invalid_profile',
      });
    }
  }

  if (url.pathname === RULES_PATH && req.method === 'GET') {
    const authInfo = await requireAdmin(req, res, url.pathname);
    if (!authInfo) return;
    const scope = url.searchParams.get('scope') as 'global' | 'user' | null;
    const module = url.searchParams.get('module') || undefined;
    const userId = url.searchParams.get('user_id') || undefined;
    sendJson(res, 200, {
      items: STORE.listRules(scope ?? undefined, module, userId),
    });
    return;
  }

  if (url.pathname === RULES_PATH && req.method === 'POST') {
    const authInfo = await requireAdmin(req, res, url.pathname);
    if (!authInfo) return;
    const payload = await parseJsonBody<{
      id?: number;
      scope: 'global' | 'user';
      module: string;
      payload: Record<string, unknown>;
      user_id?: string;
      rule_key?: string;
      priority?: number;
      enabled?: boolean;
    }>(req, res, url.pathname);
    if (!payload) return;
    if (!payload.scope || !payload.module || !payload.payload) {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: 'scope, module, and payload are required',
        instance: url.pathname,
        code: 'invalid_payload',
      });
      return;
    }
    STORE.saveRule(payload);
    sendJson(res, 200, { success: true });
  }

  if (url.pathname === RULES_PATH && req.method === 'DELETE') {
    const authInfo = await requireAdmin(req, res, url.pathname);
    if (!authInfo) return;
    const id = Number(url.searchParams.get('id'));
    if (!Number.isFinite(id)) {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: 'id must be a number',
        instance: url.pathname,
        code: 'invalid_id',
      });
      return;
    }
    STORE.deleteRule(id);
    sendJson(res, 200, { success: true });
    return;
  }

  if (url.pathname === SIMULATE_PATH && req.method === 'POST') {
    const authInfo = await requireAdmin(req, res, url.pathname);
    if (!authInfo) return;
    const payload = await parseJsonBody<{ target?: string; protocol?: string; port?: number }>(req, res, url.pathname);
    if (!payload) return;
    if (typeof payload.target !== 'string' || !payload.target.trim()) {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: 'target is required',
        instance: url.pathname,
        code: 'invalid_target',
      });
      return;
    }
    sendJson(res, 200, STORE.simulateTraffic(payload));
  }

  if (url.pathname === PROXY_LATENCY_PATH && req.method === 'POST') {
    const authInfo = await requireAdmin(req, res, url.pathname);
    if (!authInfo) return;
    const payload = await parseJsonBody<{ targets?: Array<{ id?: string; host?: string; port?: number }>; timeoutMs?: number }>(
      req,
      res,
      url.pathname,
      { required: false },
    );
    const targets = Array.isArray(payload?.targets) ? payload?.targets : [];
    const timeoutMs = Number.isFinite(payload?.timeoutMs) ? Number(payload?.timeoutMs) : 2000;
    const checkedAt = new Date().toISOString();
    const results = await Promise.all(
      targets.map(async (target) => {
        const host = String(target?.host ?? '').trim();
        const port = Number(target?.port);
        if (!host || !Number.isFinite(port) || port <= 0) {
          return { id: String(target?.id ?? ''), latency: null, checkedAt };
        }
        const latency = await measureTcpLatency(host, port, timeoutMs);
        return { id: String(target?.id ?? ''), latency, checkedAt };
      }),
    );
    sendJson(res, 200, results);
  }

  if (url.pathname === VERSIONS_PATH && req.method === 'GET') {
    const authInfo = await requireAdmin(req, res, url.pathname);
    if (!authInfo) return;
    sendJson(res, 200, STORE.listVersions());
    return;
  }

  if (url.pathname === PUBLISH_PATH && req.method === 'POST') {
    const authInfo = await requireAdmin(req, res, url.pathname);
    if (!authInfo) return;
    const payload =
      (await parseJsonBody<{ summary?: string; author?: string }>(req, res, url.pathname, { required: false })) || {};
    sendJson(res, 200, STORE.publishCurrentProfile(payload.summary, payload.author));
  }

  if (url.pathname === ROLLBACK_PATH && req.method === 'POST') {
    const authInfo = await requireAdmin(req, res, url.pathname);
    if (!authInfo) return;
    const payload = await parseJsonBody<{ id?: string }>(req, res, url.pathname);
    if (!payload) return;
    if (!payload.id) {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: 'id is required',
        instance: url.pathname,
        code: 'missing_id',
      });
      return;
    }
    try {
      const updated = STORE.rollbackVersion(payload.id);
      const origin = getOrigin(req);
      updated.publicUrl = `${origin}${SUBSCRIPTION_PATH}?token=${new URL(updated.publicUrl).searchParams.get('token')}`;
      sendJson(res, 200, updated);
    } catch (error) {
      sendProblem(res, 400, {
        title: 'Rollback failed',
        detail: error instanceof Error ? error.message : 'invalid_request',
        instance: url.pathname,
        code: 'rollback_failed',
      });
    }
  }

  if (url.pathname === AUTH_SYNC_USER_PATH && req.method === 'POST') {
    const authInfo = await requireAuth(req, res, url.pathname);
    if (!authInfo) {
      return;
    }
    const payload = await parseJsonBody<{
      sub?: string;
      name?: string;
      email?: string;
      preferred_username?: string;
      picture?: string;
    }>(req, res, url.pathname);
    if (!payload) return;
    if (!payload.sub || !payload.sub.trim()) {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: 'sub is required',
        instance: url.pathname,
        code: 'missing_sub',
      });
      return;
    }
    if (payload.sub !== authInfo.sub) {
      sendProblem(res, 403, {
        title: 'Forbidden',
        detail: 'Token sub does not match payload',
        instance: url.pathname,
        code: 'forbidden',
      });
      return;
    }
    STORE.upsertOAuthUser({
      sub: payload.sub,
      name: payload.name,
      email: payload.email,
      preferred_username: payload.preferred_username,
      picture: payload.picture,
    });
    sendJson(res, 200, { success: true });
  }

  if (url.pathname === USERS_PATH && req.method === 'GET') {
    const authInfo = await requireAdmin(req, res, url.pathname);
    if (!authInfo) return;
    sendJson(res, 200, STORE.listUsers());
    return;
  }

  if (url.pathname === DASHBOARD_PATH && req.method === 'GET') {
    const authInfo = await requireAdmin(req, res, url.pathname);
    if (!authInfo) return;
    sendJson(res, 200, STORE.getDashboardSummary());
    return;
  }

  if (url.pathname === FAILED_DOMAINS_PATH && req.method === 'GET') {
    const authInfo = await requireAdmin(req, res, url.pathname);
    if (!authInfo) return;
    const window = url.searchParams.get('window') ?? undefined;
    const limitRaw = Number(url.searchParams.get('limit') ?? '20');
    const userId = url.searchParams.get('userId') ?? undefined;
    const outboundType = url.searchParams.get('outboundType') ?? undefined;
    sendJson(
      res,
      200,
      STORE.listFailedDomains({
        window,
        limit: Number.isFinite(limitRaw) ? limitRaw : 20,
        userId,
        outboundType,
      }),
    );
    return;
  }

  if (
    (url.pathname === QUALITY_OBSERVABILITY_PATH || url.pathname === QUALITY_OBSERVABILITY_V1_PATH) &&
    req.method === 'GET'
  ) {
    const authInfo = await requireAdmin(req, res, url.pathname);
    if (!authInfo) return;
    const window = url.searchParams.get('window') ?? undefined;
    const topNRaw = Number(url.searchParams.get('topN') ?? '10');
    const bucket = url.searchParams.get('bucket') ?? undefined;
    sendJson(
      res,
      200,
      STORE.getQualityObservability({
        window,
        topN: Number.isFinite(topNRaw) ? topNRaw : 10,
        bucket,
      }),
    );
    return;
  }

  const userTargetsListMatch = url.pathname.match(/^\/api\/v1\/users\/([^/]+)\/targets$/);
  if (userTargetsListMatch && req.method === 'GET') {
    const id = safeParseId(userTargetsListMatch[1]);
    if (!id) {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: 'user id is required',
        instance: url.pathname,
        code: 'invalid_user_id',
      });
      return;
    }
    const authInfo = await requireOwnOrAdmin(req, res, url.pathname, id);
    if (!authInfo) return;
    const limitRaw = Number(url.searchParams.get('limit') ?? '100');
    const items = STORE.listUserTargetAggregates(id, limitRaw);
    sendJson(res, 200, items);
    return;
  }

  const userTargetDetailMatch = url.pathname.match(/^\/api\/v1\/users\/([^/]+)\/targets\/(.+)$/);
  if (userTargetDetailMatch && req.method === 'GET') {
    const id = safeParseId(userTargetDetailMatch[1]);
    if (!id) {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: 'user id is required',
        instance: url.pathname,
        code: 'invalid_user_id',
      });
      return;
    }
    const authInfo = await requireOwnOrAdmin(req, res, url.pathname, id);
    if (!authInfo) return;
    const target = safeParseId(userTargetDetailMatch[2]);
    if (!target) {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: 'target is required',
        instance: url.pathname,
        code: 'invalid_target',
      });
      return;
    }
    const detail = STORE.getUserTargetDetail(id, target);
    if (!detail) {
      sendProblem(res, 404, {
        title: 'Resource not found',
        detail: 'Target not found',
        instance: url.pathname,
        code: 'not_found',
      });
      return;
    }
    sendJson(res, 200, detail);
    return;
  }

  if (url.pathname === CLIENT_CONNECT_REPORT_PATH && req.method === 'POST') {
    const authInfo = await requireAuth(req, res, url.pathname);
    if (!authInfo) return;

    const payload = await parseJsonBody<{
      occurredAt?: string;
      connected?: boolean;
      networkType?: string;
      device?: {
        id?: string;
        name?: string;
        model?: string;
        osName?: string;
        osVersion?: string;
        appVersion?: string;
        ip?: string;
        location?: string;
      };
      metadata?: Record<string, unknown>;
    }>(req, res, url.pathname);
    if (!payload) return;

    if (payload.device && (!payload.device.id || !payload.device.id.trim())) {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: 'device.id must be a non-empty string when device is provided',
        instance: url.pathname,
        code: 'invalid_device_id',
      });
      return;
    }

    try {
      const updated = STORE.ingestClientDeviceReport(authInfo.sub, {
        occurredAt: payload.occurredAt,
        connected: payload.connected,
        networkType: payload.networkType,
        sourceIp: requestIP(req),
        device: payload.device?.id
          ? {
              id: payload.device.id,
              name: payload.device.name,
              model: payload.device.model,
              osName: payload.device.osName,
              osVersion: payload.device.osVersion,
              appVersion: payload.device.appVersion,
              ip: sanitizeReportedIp(payload.device.ip, req),
              location: payload.device.location,
            }
          : undefined,
        metadata: payload.metadata,
      });
      sendJson(res, 200, { success: true, user: updated });
    } catch (error) {
      sendProblem(res, 400, {
        title: 'Connect report rejected',
        detail: error instanceof Error ? error.message : 'invalid_request',
        instance: url.pathname,
        code: 'connect_report_invalid',
      });
    }
  }

  if (url.pathname === CLIENT_CONNECTIONS_REPORT_PATH && req.method === 'POST') {
    const authInfo = await requireAuth(req, res, url.pathname);
    if (!authInfo) return;

    const payload = await parseJsonBody<{
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
      device?: {
        id?: string;
        name?: string;
        model?: string;
        osName?: string;
        osVersion?: string;
        appVersion?: string;
        ip?: string;
        location?: string;
      };
      metadata?: Record<string, unknown>;
    }>(req, res, url.pathname);
    if (!payload) return;

    if (payload.device && (!payload.device.id || !payload.device.id.trim())) {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: 'device.id must be a non-empty string when device is provided',
        instance: url.pathname,
        code: 'invalid_device_id',
      });
      return;
    }

    try {
      STORE.ingestClientConnectionLog(authInfo.sub, {
        occurredAt: payload.occurredAt,
        connected: payload.connected,
        target: payload.target,
        sourceIp: requestIP(req),
        outboundType:
          (typeof payload.outboundType === 'string' ? payload.outboundType : undefined) ||
          (typeof payload.metadata?.outbound_type === 'string' ? String(payload.metadata.outbound_type) : undefined),
        latencyMs: payload.latencyMs,
        error: payload.error,
        networkType: payload.networkType,
        requestCount: payload.requestCount,
        successCount: payload.successCount,
        blockedCount: payload.blockedCount,
        uploadBytes: payload.uploadBytes,
        downloadBytes: payload.downloadBytes,
        device: payload.device?.id
          ? {
              id: payload.device.id,
              name: payload.device.name,
              model: payload.device.model,
              osName: payload.device.osName,
              osVersion: payload.device.osVersion,
              appVersion: payload.device.appVersion,
              ip: sanitizeReportedIp(payload.device.ip, req),
              location: payload.device.location,
            }
          : undefined,
        metadata: payload.metadata,
      });
      sendJson(res, 200, { success: true, received: true });
    } catch (error) {
      sendProblem(res, 400, {
        title: 'Connection log rejected',
        detail: error instanceof Error ? error.message : 'invalid_request',
        instance: url.pathname,
        code: 'connection_log_invalid',
      });
    }
  }

  if (url.pathname.startsWith(`${USERS_PATH}/`) && req.method === 'GET') {
    const id = safeParseId(url.pathname.slice(USERS_PATH.length + 1));
    if (!id) {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: 'user id is required',
        instance: url.pathname,
        code: 'invalid_user_id',
      });
      return;
    }
    const authInfo = await requireOwnOrAdmin(req, res, url.pathname, id);
    if (!authInfo) return;
    const user = STORE.getUser(id);
    if (!user) {
      sendProblem(res, 404, {
        title: 'Resource not found',
        detail: 'User not found',
        instance: url.pathname,
        code: 'not_found',
      });
      return;
    }
    sendJson(res, 200, user);
    return;
  }

  if (url.pathname.startsWith(`${USERS_PATH}/`) && req.method === 'PATCH') {
    const id = safeParseId(url.pathname.slice(USERS_PATH.length + 1));
    if (!id) {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: 'user id is required',
        instance: url.pathname,
        code: 'invalid_user_id',
      });
      return;
    }
    const authInfo = await requireOwnOrAdmin(req, res, url.pathname, id);
    if (!authInfo) return;
    const payload = await parseJsonBody<{ displayName?: string }>(req, res, url.pathname);
    if (!payload) return;
    if (!payload?.displayName || !payload.displayName.trim()) {
      sendProblem(res, 400, {
        title: 'Validation failed',
        detail: 'displayName is required',
        instance: url.pathname,
        code: 'missing_display_name',
      });
      return;
    }
    try {
      const updated = STORE.updateUserDisplayName(id, payload.displayName);
      sendJson(res, 200, updated);
    } catch (error) {
      sendProblem(res, 400, {
        title: 'Profile update failed',
        detail: error instanceof Error ? error.message : 'invalid_request',
        instance: url.pathname,
        code: 'profile_update_failed',
      });
    }
  }

  if (url.pathname !== SUBSCRIPTION_PATH) {
    if (url.pathname.startsWith('/api/')) {
      sendProblem(res, 404, {
        title: 'Resource not found',
        detail: 'API route not found',
        instance: url.pathname,
        code: 'not_found',
      });
      return;
    }
    next();
    return;
  }

  const accessToken = extractBearerToken(req);
  if (accessToken) {
    const authInfo = await fetchAuthInfo(accessToken);
    if (!authInfo?.sub) {
      logSubscribeAudit(req, 'auth_failed', { reason: 'invalid_access_token' });
      sendProblem(res, 401, {
        title: 'Authentication failed',
        detail: 'Invalid access token',
        instance: url.pathname,
        code: 'invalid_access_token',
      });
      return;
    }
    logSubscribeAudit(req, 'success', { userSub: authInfo.sub, authMode: 'bearer' });
    sendJson(res, 200, STORE.getSubscriptionProfileByUser(authInfo.sub));
    return;
  }

  if (!SUBSCRIBE_TOKEN_COMPAT) {
    logSubscribeAudit(req, 'auth_failed', { reason: 'missing_bearer_token', compatMode: false });
    sendProblem(res, 401, {
      title: 'Authentication failed',
      detail: 'Bearer token is required',
      instance: url.pathname,
      code: 'missing_bearer_token',
    });
    return;
  }
  const token = url.searchParams.get('token');
  if (!token) {
    logSubscribeAudit(req, 'auth_failed', { reason: 'missing_bearer_token', compatMode: true });
    sendProblem(res, 401, {
      title: 'Authentication failed',
      detail: 'Bearer token is required',
      instance: url.pathname,
      code: 'missing_bearer_token',
    });
    return;
  }

  const profile = STORE.getSubscriptionProfile(token);
  if (!profile) {
    logSubscribeAudit(req, 'auth_failed', { reason: 'invalid_token_query', compatMode: true });
    sendProblem(res, 401, {
      title: 'Authentication failed',
      detail: 'token is invalid',
      instance: url.pathname,
      code: 'invalid_token',
    });
    return;
  }
  logSubscribeAudit(req, 'token_compat', { compatMode: true });
  sendJson(res, 200, profile);
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const readPackageVersion = () => {
    try {
      const pkgRaw = readFileSync(path.resolve(__dirname, 'package.json'), 'utf8');
      const pkg = JSON.parse(pkgRaw) as { version?: string };
      return pkg.version || '0.0.0';
    } catch {
      return process.env.npm_package_version ?? '0.0.0';
    }
  };
  const appVersion = readPackageVersion();
  const readGitValue = (command: string, fallback: string) => {
    try {
      return execSync(command, { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
    } catch {
      return fallback;
    }
  };
  const buildTime = readGitValue('git log -1 --format=%cI', new Date().toISOString());
  const gitSha = readGitValue('git rev-parse --short HEAD', 'local');
  console.info(
    `[harbor] subscribe auth mode: ${
      SUBSCRIBE_TOKEN_COMPAT ? 'bearer + legacy token compatibility' : 'bearer-only'
    }`,
  );
  const allowedHosts = ['harbor.beforeve.com', 'localhost', '127.0.0.1'];
  return {
    server: {
      port: 5173,
      host: '0.0.0.0',
      allowedHosts,
    },
    preview: {
      host: '0.0.0.0',
      allowedHosts,
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
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.APP_VERSION': JSON.stringify(appVersion),
      'process.env.BUILD_TIME': JSON.stringify(buildTime),
      __APP_VERSION__: JSON.stringify(appVersion),
      __LAST_COMMIT_TIME__: JSON.stringify(buildTime),
      __GIT_SHA__: JSON.stringify(gitSha),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    test: {
      exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**', '.idea/**', '.git/**', '.cache/**'],
    },
  };
});
