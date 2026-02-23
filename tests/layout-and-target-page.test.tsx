import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const routerState = vi.hoisted(() => ({
  pathname: '/',
  params: { id: 'u1', target: 'video.twimg.com' },
}));

const queryState = vi.hoisted(() => ({
  isLoading: false,
  data: undefined as any,
}));

const authState = vi.hoisted(() => ({
  isAdmin: true,
  logout: vi.fn(),
  session: {
    user: {
      sub: 'deeed4b7-748b-4301-8c9e-dfe0893a80cf',
      name: 'Admin User',
      email: 'admin@example.com',
    },
  },
}));

const appStoreState = vi.hoisted(() => ({
  isSidebarOpen: true,
  toggleSidebar: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useLocation: () => ({ pathname: routerState.pathname }),
  useNavigate: () => vi.fn(),
  useParams: () => routerState.params,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ isLoading: queryState.isLoading, data: queryState.data }),
}));

vi.mock('../api', () => ({
  mockApi: {
    getUserTargetDetail: vi.fn(),
  },
}));

vi.mock('../auth-context', () => ({
  useAuth: () => authState,
}));

vi.mock('../store', () => ({
  useAppStore: () => appStoreState,
}));

vi.mock('../utils/build-info', () => ({
  buildInfo: {
    appVersion: '0.1.1',
    buildTimeText: '2026-02-23 20:00',
    gitSha: 'abc123',
    copyrightText: '© 2026 Beforeve',
  },
}));

describe('tsx page rendering', () => {
  beforeEach(() => {
    routerState.pathname = '/';
    routerState.params = { id: 'u1', target: 'video.twimg.com' };
    queryState.isLoading = false;
    queryState.data = undefined;
    authState.isAdmin = true;
    authState.session = {
      user: {
        sub: 'deeed4b7-748b-4301-8c9e-dfe0893a80cf',
        name: 'Admin User',
        email: 'admin@example.com',
      },
    };
  });

  it('renders app shell with admin sidebar and footer metadata', async () => {
    const { AppShell } = await import('../components/Layout');
    const html = renderToStaticMarkup(
      <AppShell>
        <div>Page Content</div>
      </AppShell>,
    );

    expect(html).toContain('Harbor');
    expect(html).toContain('Dashboard');
    expect(html).toContain('Unified Profile');
    expect(html).toContain('Version v0.1.1');
    expect(html).toContain('Page Content');
  });

  it('hides sidebar for non-admin users', async () => {
    authState.isAdmin = false;
    const { AppShell } = await import('../components/Layout');
    const html = renderToStaticMarkup(
      <AppShell>
        <div>User Home</div>
      </AppShell>,
    );

    expect(html).not.toContain('Unified Profile');
    expect(html).toContain('User Home');
    expect(html).toContain('Admin User');
  });

  it('renders target details not found state', async () => {
    queryState.isLoading = false;
    queryState.data = undefined;
    const { UserTargetDetailsPage } = await import('../pages/UserTargetDetails');
    const html = renderToStaticMarkup(<UserTargetDetailsPage />);
    expect(html).toContain('Target Not Found');
    expect(html).toContain('Back to User');
  });

  it('renders loading state for target details', async () => {
    queryState.isLoading = true;
    queryState.data = undefined;
    const { UserTargetDetailsPage } = await import('../pages/UserTargetDetails');
    const html = renderToStaticMarkup(<UserTargetDetailsPage />);
    expect(html).toContain('animate-spin');
  });

  it('renders full target detail cards', async () => {
    queryState.isLoading = false;
    queryState.data = {
      target: 'video.twimg.com',
      requests: 12,
      uploadBytes: 2048,
      downloadBytes: 8192,
      blockedRequests: 1,
      successRate: 95.2,
      lastSeen: '2026-02-23T10:02:00.000Z',
      outboundTypes: [{ type: 'proxy', count: 10 }, { type: 'direct', count: 2 }],
      recent: [
        {
          occurredAt: '2026-02-23T10:02:00.000Z',
          outboundType: 'proxy',
          networkType: 'wifi',
          requestCount: 8,
          successCount: 8,
          blockedCount: 0,
          uploadBytes: 1024,
          downloadBytes: 4096,
          error: null,
        },
      ],
    };
    const { UserTargetDetailsPage } = await import('../pages/UserTargetDetails');
    const html = renderToStaticMarkup(<UserTargetDetailsPage />);

    expect(html).toContain('Request aggregation by target');
    expect(html).toContain('Connection');
    expect(html).toContain('Metadata');
    expect(html).toContain('Recent Records');
    expect(html).toContain('video.twimg.com');
    expect(html).toContain('Active');
    expect(html).toContain('proxy:10 / direct:2');
  });
});
