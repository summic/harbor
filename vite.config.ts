import path from 'path';
import net from 'net';
import type { IncomingMessage, ServerResponse } from 'http';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
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
const HEALTH_PATH = '/api/v1/health';

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

const getOrigin = (req: IncomingMessage) => {
  const host = req.headers.host ?? 'localhost:5173';
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
  return `${proto}://${host}`;
};

const readBody = async (req: IncomingMessage): Promise<string> =>
  await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
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

const isTrustedIssuer = (issuer: string): boolean => {
  try {
    const host = new URL(issuer).hostname.toLowerCase();
    return host === 'auth0.kylith.com' || host === 'id.kylith.com' || host.endsWith('.kylith.com');
  } catch {
    return false;
  }
};

const buildUserInfoCandidates = (accessToken: string): string[] => {
  const candidates = [...ENV_USERINFO_URLS, ...DEFAULT_USERINFO_URLS];
  const payload = parseJwtPayload(accessToken);
  const issuer = typeof payload?.iss === 'string' ? payload.iss.trim() : '';
  if (issuer) {
    const normalizedIssuer = issuer.replace(/\/+$/, '');
    candidates.unshift(`${normalizedIssuer}/userinfo`, `${normalizedIssuer}/oauth2/userinfo`);
  }
  return Array.from(new Set(candidates));
};

const extractBearerToken = (req: IncomingMessage): string | null => {
  const raw = req.headers.authorization;
  if (!raw) return null;
  const [scheme, value] = raw.split(' ');
  if (!scheme || !value || scheme.toLowerCase() !== 'bearer') return null;
  const token = value.trim();
  return token ? token : null;
};

const fetchAuthInfo = async (accessToken: string): Promise<AuthInfo | null> => {
  const cached = tokenSubCache.get(accessToken);
  if (cached && cached.expiresAt > Date.now()) {
    return { sub: cached.sub };
  }
  const candidates = buildUserInfoCandidates(accessToken);
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
  // Compatibility fallback: some issued access tokens may not be accepted by userinfo,
  // but still carry sub/iss claims we can use for telemetry attribution.
  const jwtPayload = parseJwtPayload(accessToken);
  const sub = typeof jwtPayload?.sub === 'string' ? jwtPayload.sub.trim() : '';
  const iss = typeof jwtPayload?.iss === 'string' ? jwtPayload.iss.trim() : '';
  const exp = typeof jwtPayload?.exp === 'number' ? jwtPayload.exp : null;
  const isExpired = typeof exp === 'number' ? Date.now() >= exp * 1000 : false;
  if (sub && iss && !isExpired && isTrustedIssuer(iss)) {
    tokenSubCache.set(accessToken, { sub, expiresAt: Date.now() + TOKEN_SUB_CACHE_TTL_MS });
    return { sub };
  }
  return null;
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

  if (url.pathname === HEALTH_PATH && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      service: 'harbor',
      time: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === PROFILE_PATH && req.method === 'GET') {
    sendJson(res, 200, STORE.getUnifiedProfile(getOrigin(req)));
    return;
  }

  if (url.pathname === PROFILE_PATH && req.method === 'PUT') {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw) as { content?: string; publicUrl?: string };
      if (typeof payload.content !== 'string') {
        sendProblem(res, 400, {
          title: 'Validation failed',
          detail: 'content must be a string',
          instance: url.pathname,
          code: 'invalid_content',
        });
        return;
      }
      const updated = STORE.saveUnifiedProfile(payload.content, payload.publicUrl);
      const origin = getOrigin(req);
      if (origin.startsWith('http')) {
        updated.publicUrl = `${origin}${SUBSCRIPTION_PATH}?token=${new URL(updated.publicUrl).searchParams.get('token')}`;
      }
      sendJson(res, 200, updated);
      return;
    } catch {
      sendProblem(res, 400, {
        title: 'Malformed request',
        detail: 'Request body is not valid JSON',
        instance: url.pathname,
        code: 'invalid_request',
      });
      return;
    }
  }

  if (url.pathname === RULES_PATH && req.method === 'GET') {
    const scope = url.searchParams.get('scope') as 'global' | 'user' | null;
    const module = url.searchParams.get('module') || undefined;
    const userId = url.searchParams.get('user_id') || undefined;
    sendJson(res, 200, {
      items: STORE.listRules(scope ?? undefined, module, userId),
    });
    return;
  }

  if (url.pathname === RULES_PATH && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw) as {
        id?: number;
        scope: 'global' | 'user';
        module: string;
        payload: Record<string, unknown>;
        user_id?: string;
        rule_key?: string;
        priority?: number;
        enabled?: boolean;
      };
      if (!payload?.scope || !payload?.module || !payload?.payload) {
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
      return;
    } catch {
      sendProblem(res, 400, {
        title: 'Malformed request',
        detail: 'Request body is not valid JSON',
        instance: url.pathname,
        code: 'invalid_request',
      });
      return;
    }
  }

  if (url.pathname === RULES_PATH && req.method === 'DELETE') {
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
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw) as { target?: string; protocol?: string; port?: number };
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
      return;
    } catch {
      sendProblem(res, 400, {
        title: 'Malformed request',
        detail: 'Request body is not valid JSON',
        instance: url.pathname,
        code: 'invalid_request',
      });
      return;
    }
  }

  if (url.pathname === PROXY_LATENCY_PATH && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw) as {
        targets?: Array<{ id?: string; host?: string; port?: number }>;
        timeoutMs?: number;
      };
      const targets = Array.isArray(payload.targets) ? payload.targets : [];
      const timeoutMs = Number.isFinite(payload.timeoutMs) ? Number(payload.timeoutMs) : 2000;
      const checkedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const results = await Promise.all(
        targets.map(async (target) => {
          const host = String(target.host ?? '').trim();
          const port = Number(target.port);
          if (!host || !Number.isFinite(port) || port <= 0) {
            return { id: String(target.id ?? ''), latency: null, checkedAt };
          }
          const latency = await measureTcpLatency(host, port, timeoutMs);
          return { id: String(target.id ?? ''), latency, checkedAt };
        }),
      );
      sendJson(res, 200, results);
      return;
    } catch {
      sendProblem(res, 400, {
        title: 'Malformed request',
        detail: 'Request body is not valid JSON',
        instance: url.pathname,
        code: 'invalid_request',
      });
      return;
    }
  }

  if (url.pathname === VERSIONS_PATH && req.method === 'GET') {
    sendJson(res, 200, STORE.listVersions());
    return;
  }

  if (url.pathname === PUBLISH_PATH && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) as { summary?: string; author?: string } : {};
      sendJson(res, 200, STORE.publishCurrentProfile(payload.summary, payload.author));
      return;
    } catch {
      sendProblem(res, 400, {
        title: 'Malformed request',
        detail: 'Request body is not valid JSON',
        instance: url.pathname,
        code: 'invalid_request',
      });
      return;
    }
  }

  if (url.pathname === ROLLBACK_PATH && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw) as { id?: string };
      if (!payload.id) {
        sendProblem(res, 400, {
          title: 'Validation failed',
          detail: 'id is required',
          instance: url.pathname,
          code: 'missing_id',
        });
        return;
      }
      const updated = STORE.rollbackVersion(payload.id);
      const origin = getOrigin(req);
      updated.publicUrl = `${origin}${SUBSCRIPTION_PATH}?token=${new URL(updated.publicUrl).searchParams.get('token')}`;
      sendJson(res, 200, updated);
      return;
    } catch (error) {
      sendProblem(res, 400, {
        title: 'Rollback failed',
        detail: error instanceof Error ? error.message : 'invalid_request',
        instance: url.pathname,
        code: 'rollback_failed',
      });
      return;
    }
  }

  if (url.pathname === AUTH_SYNC_USER_PATH && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw) as {
        sub?: string;
        name?: string;
        email?: string;
        preferred_username?: string;
        picture?: string;
      };
      if (!payload.sub || !payload.sub.trim()) {
        sendProblem(res, 400, {
          title: 'Validation failed',
          detail: 'sub is required',
          instance: url.pathname,
          code: 'missing_sub',
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
      return;
    } catch {
      sendProblem(res, 400, {
        title: 'Malformed request',
        detail: 'Request body is not valid JSON',
        instance: url.pathname,
        code: 'invalid_request',
      });
      return;
    }
  }

  if (url.pathname === USERS_PATH && req.method === 'GET') {
    sendJson(res, 200, STORE.listUsers());
    return;
  }

  const userTargetsListMatch = url.pathname.match(/^\/api\/v1\/users\/([^/]+)\/targets$/);
  if (userTargetsListMatch && req.method === 'GET') {
    const id = decodeURIComponent(userTargetsListMatch[1]);
    const limitRaw = Number(url.searchParams.get('limit') ?? '100');
    const items = STORE.listUserTargetAggregates(id, limitRaw);
    sendJson(res, 200, items);
    return;
  }

  const userTargetDetailMatch = url.pathname.match(/^\/api\/v1\/users\/([^/]+)\/targets\/(.+)$/);
  if (userTargetDetailMatch && req.method === 'GET') {
    const id = decodeURIComponent(userTargetDetailMatch[1]);
    const target = decodeURIComponent(userTargetDetailMatch[2]);
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
    try {
      const accessToken = extractBearerToken(req);
      if (!accessToken) {
        sendProblem(res, 401, {
          title: 'Authentication failed',
          detail: 'Bearer token is required',
          instance: url.pathname,
          code: 'missing_bearer_token',
        });
        return;
      }
      const authInfo = await fetchAuthInfo(accessToken);
      if (!authInfo?.sub) {
        sendProblem(res, 401, {
          title: 'Authentication failed',
          detail: 'Invalid access token',
          instance: url.pathname,
          code: 'invalid_access_token',
        });
        return;
      }

      const raw = await readBody(req);
      const payload = JSON.parse(raw) as {
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
      };
      if (payload.device && (!payload.device.id || !payload.device.id.trim())) {
        sendProblem(res, 400, {
          title: 'Validation failed',
          detail: 'device.id must be a non-empty string when device is provided',
          instance: url.pathname,
          code: 'invalid_device_id',
        });
        return;
      }

      const updated = STORE.ingestClientDeviceReport(authInfo.sub, {
        occurredAt: payload.occurredAt,
        connected: payload.connected,
        networkType: payload.networkType,
        device: payload.device?.id
          ? {
              id: payload.device.id,
              name: payload.device.name,
              model: payload.device.model,
              osName: payload.device.osName,
              osVersion: payload.device.osVersion,
              appVersion: payload.device.appVersion,
              ip: payload.device.ip,
              location: payload.device.location,
            }
          : undefined,
        metadata: payload.metadata,
      });
      sendJson(res, 200, { success: true, user: updated });
      return;
    } catch (error) {
      sendProblem(res, 400, {
        title: 'Connect report rejected',
        detail: error instanceof Error ? error.message : 'invalid_request',
        instance: url.pathname,
        code: 'connect_report_invalid',
      });
      return;
    }
  }

  if (url.pathname === CLIENT_CONNECTIONS_REPORT_PATH && req.method === 'POST') {
    try {
      const accessToken = extractBearerToken(req);
      if (!accessToken) {
        sendProblem(res, 401, {
          title: 'Authentication failed',
          detail: 'Bearer token is required',
          instance: url.pathname,
          code: 'missing_bearer_token',
        });
        return;
      }
      const authInfo = await fetchAuthInfo(accessToken);
      if (!authInfo?.sub) {
        sendProblem(res, 401, {
          title: 'Authentication failed',
          detail: 'Invalid access token',
          instance: url.pathname,
          code: 'invalid_access_token',
        });
        return;
      }

      const raw = await readBody(req);
      const payload = JSON.parse(raw) as {
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
      };

      if (payload.device && (!payload.device.id || !payload.device.id.trim())) {
        sendProblem(res, 400, {
          title: 'Validation failed',
          detail: 'device.id must be a non-empty string when device is provided',
          instance: url.pathname,
          code: 'invalid_device_id',
        });
        return;
      }

      STORE.ingestClientConnectionLog(authInfo.sub, {
        occurredAt: payload.occurredAt,
        connected: payload.connected,
        target: payload.target,
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
              ip: payload.device.ip,
              location: payload.device.location,
            }
          : undefined,
        metadata: payload.metadata,
      });
      sendJson(res, 200, { success: true, received: true });
      return;
    } catch (error) {
      sendProblem(res, 400, {
        title: 'Connection log rejected',
        detail: error instanceof Error ? error.message : 'invalid_request',
        instance: url.pathname,
        code: 'connection_log_invalid',
      });
      return;
    }
  }

  if (url.pathname.startsWith(`${USERS_PATH}/`) && req.method === 'GET') {
    const id = decodeURIComponent(url.pathname.slice(USERS_PATH.length + 1));
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
    try {
      const id = decodeURIComponent(url.pathname.slice(USERS_PATH.length + 1));
      const raw = await readBody(req);
      const payload = JSON.parse(raw) as { displayName?: string };
      if (!payload?.displayName || !payload.displayName.trim()) {
        sendProblem(res, 400, {
          title: 'Validation failed',
          detail: 'displayName is required',
          instance: url.pathname,
          code: 'missing_display_name',
        });
        return;
      }
      const updated = STORE.updateUserDisplayName(id, payload.displayName);
      sendJson(res, 200, updated);
      return;
    } catch (error) {
      sendProblem(res, 400, {
        title: 'Profile update failed',
        detail: error instanceof Error ? error.message : 'invalid_request',
        instance: url.pathname,
        code: 'profile_update_failed',
      });
      return;
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

  const token = url.searchParams.get('token');
  if (!token) {
    sendProblem(res, 400, {
      title: 'Validation failed',
      detail: 'token is required',
      instance: url.pathname,
      code: 'missing_token',
    });
    return;
  }

  const profile = STORE.getSubscriptionProfile(token);
  if (!profile) {
    sendProblem(res, 401, {
      title: 'Authentication failed',
      detail: 'token is invalid',
      instance: url.pathname,
      code: 'invalid_token',
    });
    return;
  }
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
