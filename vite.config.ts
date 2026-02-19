import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { ConfigStore } from './dev-server/config-store';

const SUBSCRIPTION_PATH = '/api/v1/client/subscribe';
const PROFILE_PATH = '/api/v1/client/profile';
const RULES_PATH = '/api/v1/rules';
const SIMULATE_PATH = '/api/v1/simulate/traffic';

const STORE = new ConfigStore({
  dbPath: path.resolve(__dirname, '.local-data', 'sail.sqlite'),
  legacyProfilePath: path.resolve(__dirname, '.local-data', 'unified-profile.json'),
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

const subscriptionHandler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
  if (!req.url) {
    next();
    return;
  }

  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === PROFILE_PATH && req.method === 'GET') {
    sendJson(res, 200, STORE.getUnifiedProfile(getOrigin(req)));
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
      const updated = STORE.saveUnifiedProfile(payload.content, payload.publicUrl);
      const origin = getOrigin(req);
      if (origin.startsWith('http')) {
        updated.publicUrl = `${origin}${SUBSCRIPTION_PATH}?token=${new URL(updated.publicUrl).searchParams.get('token')}`;
      }
      sendJson(res, 200, updated);
      return;
    } catch {
      sendJson(res, 400, { error: 'invalid_request' });
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
        sendJson(res, 400, { error: 'invalid_payload' });
        return;
      }
      STORE.saveRule(payload);
      sendJson(res, 200, { success: true });
      return;
    } catch {
      sendJson(res, 400, { error: 'invalid_request' });
      return;
    }
  }

  if (url.pathname === RULES_PATH && req.method === 'DELETE') {
    const id = Number(url.searchParams.get('id'));
    if (!Number.isFinite(id)) {
      sendJson(res, 400, { error: 'invalid_id' });
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
        sendJson(res, 400, { error: 'invalid_target' });
        return;
      }
      sendJson(res, 200, STORE.simulateTraffic(payload));
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

  const profile = STORE.getSubscriptionProfile(token);
  if (!profile) {
    sendJson(res, 401, { error: 'invalid_token' });
    return;
  }
  sendJson(res, 200, profile);
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
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
