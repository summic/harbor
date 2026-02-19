import path from 'path';
import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const SUBSCRIPTION_TOKEN = 'u1-alice-7f8a9d2b';
const SUBSCRIPTION_PATH = '/api/v1/client/subscribe';
const PROFILE_PATH = '/api/v1/client/profile';
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
