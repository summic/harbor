import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => {
  return {
    clearSession: vi.fn(),
    loadSession: vi.fn(() => null),
    resolveActiveSession: vi.fn(async () => ({
      accessToken: 'token-1',
      tokenType: 'Bearer',
      user: { sub: 'u1' },
    })),
  };
});

vi.mock('../auth', () => ({
  clearSession: authMocks.clearSession,
  loadSession: authMocks.loadSession,
  resolveActiveSession: authMocks.resolveActiveSession,
}));

describe('api client auth and retry flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries once with refreshed token when receiving 401 invalid_access_token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            title: 'Authentication failed',
            detail: 'Invalid access token',
            code: 'invalid_access_token',
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 'u1', username: 'alice', email: 'a@b.c', status: 'active' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    authMocks.resolveActiveSession
      .mockResolvedValueOnce({
        accessToken: 'token-1',
        tokenType: 'Bearer',
        user: { sub: 'u1' },
      })
      .mockResolvedValueOnce({
        accessToken: 'token-2',
        tokenType: 'Bearer',
        user: { sub: 'u1' },
      });

    const { mockApi } = await import('../api');
    const users = await mockApi.getUsers();

    expect(users.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstAuth = new Headers((fetchMock.mock.calls[0][1] as RequestInit)?.headers).get('Authorization');
    const secondAuth = new Headers((fetchMock.mock.calls[1][1] as RequestInit)?.headers).get('Authorization');
    expect(firstAuth).toBe('Bearer token-1');
    expect(secondAuth).toBe('Bearer token-2');
    expect(authMocks.clearSession).not.toHaveBeenCalled();
  });

  it('returns undefined for getUserTargetDetail when backend responds 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: 'Resource not found',
          detail: 'Target not found',
          code: 'not_found',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    authMocks.resolveActiveSession.mockResolvedValue({
      accessToken: 'token-1',
      tokenType: 'Bearer',
      user: { sub: 'u1' },
    });

    const { mockApi } = await import('../api');
    const detail = await mockApi.getUserTargetDetail('u1', 'missing.example.com');
    expect(detail).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends bearer token and payload for reportClientConnect', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          user: {
            id: 'u1',
            username: 'alice',
            email: 'alice@example.com',
            status: 'active',
            traffic: { upload: 0, download: 0, total: 0 },
            devices: [],
            logs: { totalRequests: 0, successRate: 100, topAllowed: [], topDirect: [], topBlocked: [] },
            lastOnline: new Date().toISOString(),
            created: new Date().toISOString(),
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    authMocks.resolveActiveSession.mockResolvedValue({
      accessToken: 'token-1',
      tokenType: 'Bearer',
      user: { sub: 'u1' },
    });

    const { mockApi } = await import('../api');
    const user = await mockApi.reportClientConnect({
      connected: true,
      occurredAt: new Date().toISOString(),
      networkType: 'wifi',
      device: {
        id: 'ios-device-1',
        name: 'iPhone',
        model: 'iPhone18,2',
        osName: 'iOS',
        osVersion: '26.3',
        appVersion: '1.0.0',
      },
      metadata: {
        status: 'connected',
      },
    });

    expect(user?.id).toBe('u1');
    const reqInit = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(reqInit.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-1');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(String(reqInit.body || '')).toContain('ios-device-1');
  });

  it('falls back to mock users when backend returns html error body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<!DOCTYPE html><html><body>500 error</body></html>', {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    authMocks.resolveActiveSession.mockResolvedValue({
      accessToken: 'token-1',
      tokenType: 'Bearer',
      user: { sub: 'u1' },
    });

    const { mockApi } = await import('../api');
    const users = await mockApi.getUsers();
    expect(users.length).toBeGreaterThan(0);
  });

  it('uses computed dashboard fallback when dashboard API fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: 'internal error',
          detail: 'oops',
          code: 'internal_error',
        }),
        { status: 500, headers: { 'Content-Type': 'application/problem+json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    authMocks.resolveActiveSession.mockResolvedValue({
      accessToken: 'token-1',
      tokenType: 'Bearer',
      user: { sub: 'u1' },
    });

    const { mockApi } = await import('../api');
    const summary = await mockApi.getDashboardSummary();
    expect(summary.stats.activeUsers).toBeGreaterThanOrEqual(0);
    expect(summary.traffic.uploadSeries.length).toBe(24);
    expect(summary.traffic.downloadSeries.length).toBe(24);
  });
});
