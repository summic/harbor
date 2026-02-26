import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const routeState = vi.hoisted(() => ({
  id: 'u1',
}));

const queryState = vi.hoisted(() => ({
  domainGroups: [] as any[],
  dns: [] as any[],
  failedUsers: [] as any[],
  failedRows: [] as any[],
  unifiedProfile: null as any,
  profileVersions: [] as any[],
  user: null as any,
  userTargets: [] as any[],
}));

const queryClientState = vi.hoisted(() => ({
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
  useParams: () => ({ id: routeState.id }),
}));

vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value }: { value: string }) => <pre>{value}</pre>,
}));

vi.mock('@codemirror/lang-json', () => ({
  json: () => [],
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[0];
    if (key === 'domainGroups') return { data: queryState.domainGroups, isLoading: false };
    if (key === 'dns') return { data: queryState.dns, isLoading: false };
    if (key === 'failed-domains-users') return { data: queryState.failedUsers, isLoading: false };
    if (key === 'failed-domains') return { data: queryState.failedRows, isLoading: false };
    if (key === 'unifiedProfile') return { data: queryState.unifiedProfile, isLoading: false };
    if (key === 'profileVersions') return { data: queryState.profileVersions, isLoading: false };
    if (key === 'user') return { data: queryState.user, isLoading: false };
    if (key === 'user-targets') return { data: queryState.userTargets, isLoading: false };
    return { data: undefined, isLoading: false };
  },
  useMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
    isSuccess: false,
  }),
  useQueryClient: () => queryClientState,
}));

vi.mock('../api', () => ({
  mockApi: {
    getDomainGroups: vi.fn(),
    saveDomainGroup: vi.fn(),
    deleteDomainGroup: vi.fn(),
    getDns: vi.fn(),
    getUsers: vi.fn(),
    getFailedDomains: vi.fn(),
    getUnifiedProfile: vi.fn(),
    getVersions: vi.fn(),
    saveUnifiedProfile: vi.fn(),
    rollbackVersion: vi.fn(),
    getUser: vi.fn(),
    getUserTargets: vi.fn(),
  },
}));

describe('Remaining pages render', () => {
  beforeEach(() => {
    routeState.id = 'u1';
    queryState.domainGroups = [{ id: 'g1', name: 'kn-system', action: 'PROXY', dnsServer: 'dns_direct', ruleCount: 12 }];
    queryState.dns = [{ id: 'dns:dns_direct', name: 'dns_direct', type: 'dot', address: '223.6.6.6:853', enabled: true }];
    queryState.failedUsers = [{ id: 'u1', displayName: 'Alice', email: 'alice@example.com' }];
    queryState.failedRows = [{ domain: 'twitter.com', failures: 3, requests: 10, successRate: 70, outboundType: 'proxy', lastError: 'timeout', lastSeen: '2026-02-23' }];
    queryState.unifiedProfile = {
      content: '{\n  "log": {"level":"info"}\n}',
      lastUpdated: '2026-02-23',
      size: '2.4 KB',
      publicUrl: 'http://localhost:5173/api/v1/client/subscribe?token=t1',
    };
    queryState.profileVersions = [{ id: 'v1', version: 'v0.1.1', timestamp: '2026-02-23', summary: 'publish' }];
    queryState.user = {
      id: 'u1',
      username: 'alice',
      displayName: 'Alice',
      email: 'alice@example.com',
      status: 'active',
      avatarUrl: '',
      traffic: { upload: 1024, download: 2048, total: 3072 },
      devices: [{ id: 'd1', name: 'iPhone', os: 'iOS', ip: '192.168.1.10', appVersion: '1.0.0', lastSeen: 'now' }],
      lastOnline: 'now',
      created: '2026-02-01',
      logs: {
        totalRequests: 20,
        successRate: 95,
        topAllowed: [{ domain: 'google.com', count: 10 }],
        topDirect: [{ domain: 'apple.com', count: 5 }],
        topBlocked: [],
      },
    };
    queryState.userTargets = [{ target: 'google.com', policy: 'proxy', requests: 10, uploadBytes: 1000, downloadBytes: 3000, blockedRequests: 0, successRate: 100, lastSeen: '2026-02-23' }];
  });

  it('renders domain groups page', async () => {
    const { DomainGroupsPage } = await import('../pages/DomainGroups');
    const html = renderToStaticMarkup(<DomainGroupsPage />);
    expect(html).toContain('Policy');
    expect(html).toContain('Add Policy Group');
    expect(html).toContain('kn-system');
  });

  it('renders failed domains page', async () => {
    const { FailedDomainsPage } = await import('../pages/FailedDomains');
    const html = renderToStaticMarkup(<FailedDomainsPage />);
    expect(html).toContain('Failed Domains');
    expect(html).toContain('twitter.com');
    expect(html).toContain('Results');
  });

  it('renders unified profile page with versions', async () => {
    const { UnifiedProfilePage } = await import('../pages/UnifiedProfile');
    const html = renderToStaticMarkup(<UnifiedProfilePage />);
    expect(html).toContain('Unified Profile');
    expect(html).toContain('Actions');
    expect(html).toContain('Versions');
    expect(html).toContain('v0.1.1');
  });

  it('renders user details and target table', async () => {
    const { UserDetailsPage } = await import('../pages/UserDetails');
    const html = renderToStaticMarkup(<UserDetailsPage />);
    expect(html).toContain('Back to Users Directory');
    expect(html).toContain('Access Logs Overview');
    expect(html).toContain('Targets (By Request Count)');
    expect(html).toContain('google.com');
  });

  it('renders user not found branch', async () => {
    queryState.user = null;
    const { UserDetailsPage } = await import('../pages/UserDetails');
    const html = renderToStaticMarkup(<UserDetailsPage />);
    expect(html).toContain('User Not Found');
    expect(html).toContain('Return to Users');
  });
});
