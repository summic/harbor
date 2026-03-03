import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const authState = vi.hoisted(() => ({
  loading: false,
  error: null as string | null,
  session: {
    accessToken: 'token',
    user: {
      sub: 'u1',
      name: 'Alice',
      preferred_username: 'alice',
      email: 'alice@example.com',
    },
  } as any,
  isAuthenticated: true,
  isAdmin: true,
  ssoEnabled: true,
  ssoConfigured: true,
  login: vi.fn(async () => {}),
  logout: vi.fn(),
  updateDisplayName: vi.fn(),
}));

const queryState = vi.hoisted(() => ({
  qualityLoading: false,
  qualityError: null as Error | null,
  qualityData: null as any,
  users: [] as any[],
  routing: [] as any[],
}));

vi.mock('../auth-context', () => ({
  useAuth: () => authState,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[0];
    if (key === 'quality-observability') {
      return {
        data: queryState.qualityData,
        isLoading: queryState.qualityLoading,
        isError: !!queryState.qualityError,
        error: queryState.qualityError,
      };
    }
    if (key === 'quality-observability-users') {
      return { data: queryState.users, isLoading: false, isError: false, error: null };
    }
    if (key === 'quality-observability-routing') {
      return { data: queryState.routing, isLoading: false, isError: false, error: null };
    }
    return { data: undefined, isLoading: false, isError: false, error: null };
  },
}));

vi.mock('../api', () => ({
  mockApi: {
    updateCurrentUserDisplayName: vi.fn(async (displayName: string) => ({ displayName })),
    getMyUnifiedProfile: vi.fn(async () => ({ content: '{"route":{},"dns":{}}' })),
    getEffectiveUnifiedProfile: vi.fn(async () => ({ content: '{"route":{},"dns":{}}' })),
    getMyProfileAudits: vi.fn(async () => []),
    getUsers: vi.fn(async () => []),
    getRouting: vi.fn(async () => []),
  },
  qualityApi: {
    getObservability: vi.fn(async () => ({
      stability: { points: [], totalRequests: 0, avgSuccessRate: 0 },
      topDomains: [],
      failureReasons: [],
      updatedAt: new Date().toISOString(),
    })),
  },
}));

vi.mock('../utils/build-info', () => ({
  buildInfo: {
    copyrightText: 'Copyright',
    appVersion: '0.1.1',
  },
}));

describe('Account settings, quality observability and auth gate pages', () => {
  beforeEach(() => {
    authState.loading = false;
    authState.error = null;
    authState.session = {
      accessToken: 'token',
      user: {
        sub: 'u1',
        name: 'Alice',
        preferred_username: 'alice',
        email: 'alice@example.com',
      },
    };
    authState.isAuthenticated = true;
    authState.isAdmin = true;
    authState.ssoEnabled = true;
    authState.ssoConfigured = true;

    queryState.qualityLoading = false;
    queryState.qualityError = null;
    queryState.qualityData = {
      stability: {
        points: [
          { timestamp: '2026-02-23T00:00:00.000Z', successRate: 98.2, total: 200 },
          { timestamp: '2026-02-23T01:00:00.000Z', successRate: 96.4, total: 180 },
        ],
        totalRequests: 380,
        avgSuccessRate: 97.3,
      },
      topDomains: [
        { domain: 'google.com', count: 120 },
        { domain: 'twitter.com', count: 80 },
      ],
      failureReasons: [{ code: 'CONNECT_TIMEOUT', count: 3, ratio: 0.3 }],
      updatedAt: '2026-02-23T02:00:00.000Z',
    };
    queryState.users = [
      {
        logs: {
          topAllowed: [{ domain: 'google.com', count: 10 }],
          topDirect: [{ domain: 'apple.com', count: 4 }],
          topBlocked: [{ domain: 'ads.example.com', count: 2 }],
        },
      },
    ];
    queryState.routing = [
      { id: 'r1', matchType: 'domain', matchExpr: 'domain:google.com', outbound: 'proxy' },
      { id: 'r2', matchType: 'domain', matchExpr: 'domain:apple.com', outbound: 'direct' },
    ];
  });

  it('renders account settings page', async () => {
    const { AccountSettingsPage } = await import('../pages/AccountSettings');
    const html = renderToStaticMarkup(<AccountSettingsPage />);
    expect(html).toContain('Account Settings');
    expect(html).toContain('My Personal Config (Server-side)');
    expect(html).toContain('Save Personal Config');
    expect(html).toContain('No personal profile changes yet');
    expect(html).toContain('value="Alice"');
  });

  it('renders account page with email fallback name', async () => {
    authState.session = {
      accessToken: 'token',
      user: {
        sub: 'u1',
        email: 'fallback@example.com',
      },
    };
    const { AccountSettingsPage } = await import('../pages/AccountSettings');
    const html = renderToStaticMarkup(<AccountSettingsPage />);
    expect(html).toContain('value="fallback@example.com"');
  });

  it('renders quality page loading branch', async () => {
    queryState.qualityLoading = true;
    const { QualityObservabilityPage } = await import('../pages/QualityObservability');
    const html = renderToStaticMarkup(<QualityObservabilityPage />);
    expect(html).toContain('animate-spin');
  });

  it('renders quality page error branch', async () => {
    queryState.qualityError = new Error('backend unavailable');
    const { QualityObservabilityPage } = await import('../pages/QualityObservability');
    const html = renderToStaticMarkup(<QualityObservabilityPage />);
    expect(html).toContain('Unable to load quality observability');
    expect(html).toContain('backend unavailable');
  });

  it('renders quality page with full data branches', async () => {
    const { QualityObservabilityPage } = await import('../pages/QualityObservability');
    const html = renderToStaticMarkup(<QualityObservabilityPage />);
    expect(html).toContain('Quality Observability');
    expect(html).toContain('24h Stability Overview');
    expect(html).toContain('max-w-4xl');
    expect(html).toContain('google.com');
    expect(html).toContain('Policy Hit Map');
    expect(html).toContain('outbound: proxy');
  });

  it('renders quality page empty-state branches', async () => {
    queryState.qualityData = {
      stability: { points: [], totalRequests: 0, avgSuccessRate: 0 },
      topDomains: [],
      failureReasons: [],
      updatedAt: '2026-02-23T02:00:00.000Z',
    };
    queryState.users = [];
    queryState.routing = [];
    const { QualityObservabilityPage } = await import('../pages/QualityObservability');
    const html = renderToStaticMarkup(<QualityObservabilityPage />);
    expect(html).toContain('No stability samples');
    expect(html).toContain('No key domains');
    expect(html).toContain('No failure reasons');
    expect(html).toContain('No routing policies');
  });

  it('renders auth gate unauthenticated branch', async () => {
    authState.isAuthenticated = false;
    const { AuthGate } = await import('../components/AuthGate');
    const html = renderToStaticMarkup(
      <AuthGate>
        <div>private</div>
      </AuthGate>,
    );
    expect(html).toContain('Sign in to Harbor');
    expect(html).toContain('Continue');
    expect(html).toContain('v0.1.1');
  });

  it('renders auth gate loading and misconfigured branches', async () => {
    authState.loading = true;
    let module = await import('../components/AuthGate');
    let html = renderToStaticMarkup(
      <module.AuthGate>
        <div>private</div>
      </module.AuthGate>,
    );
    expect(html).toContain('Connecting to Harbor SSO');

    authState.loading = false;
    authState.ssoConfigured = false;
    module = await import('../components/AuthGate');
    html = renderToStaticMarkup(
      <module.AuthGate>
        <div>private</div>
      </module.AuthGate>,
    );
    expect(html).toContain('Harbor SSO is not configured');
  });
});
