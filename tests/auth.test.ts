import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'kylith_sso_session_v1';

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

const createStorage = (): StorageLike => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
};

describe('auth session lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    const local = createStorage();
    const session = createStorage();
    vi.stubGlobal('window', {
      location: {
        origin: 'http://localhost:5173',
        pathname: '/',
      },
    });
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads legacy session shape and normalizes fields', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        access_token: 'legacy-token',
        token_type: 'Bearer',
        expires_at: Date.now() + 60_000,
      }),
    );

    const { loadSession } = await import('../auth');
    const session = loadSession();

    expect(session?.accessToken).toBe('legacy-token');
    expect(session?.tokenType).toBe('Bearer');
  });

  it('refreshes access token when forceRefresh is requested', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accessToken: 'token-old',
        refreshToken: 'refresh-1',
        tokenType: 'Bearer',
        expiresAt: Date.now() - 1000,
      }),
    );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'token-new',
          token_type: 'Bearer',
          refresh_token: 'refresh-2',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_SSO_TOKEN_URL', 'https://id.kylith.com/oauth/token');
    vi.stubEnv('VITE_SSO_CLIENT_ID', 'cid');

    const { resolveActiveSession } = await import('../auth');
    const refreshed = await resolveActiveSession({ forceRefresh: true });

    expect(refreshed?.accessToken).toBe('token-new');
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    const [firstCallUrl, firstCallInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(firstCallUrl)).toContain('oauth/token');
    expect(String(firstCallInit.body || '')).toContain('grant_type=refresh_token');
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as { accessToken?: string };
    expect(persisted.accessToken).toBe('token-new');
  });

  it('clears session when refresh fails', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accessToken: 'token-old',
        refreshToken: 'refresh-1',
        tokenType: 'Bearer',
        expiresAt: Date.now() - 1000,
      }),
    );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response('unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('VITE_SSO_TOKEN_URL', 'https://id.kylith.com/oauth/token');
    vi.stubEnv('VITE_SSO_CLIENT_ID', 'cid');

    const { resolveActiveSession } = await import('../auth');
    const refreshed = await resolveActiveSession({ forceRefresh: true });

    expect(refreshed).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
