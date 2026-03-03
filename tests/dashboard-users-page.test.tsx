import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const queryState = vi.hoisted(() => ({
  dashboardLoading: false,
  dashboardData: null as any,
  qualityData: null as any,
  failedDomains: [] as any[],
  users: [] as any[],
}));

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[0];
    if (key === 'dashboard-summary') {
      return { data: queryState.dashboardData, isLoading: queryState.dashboardLoading };
    }
    if (key === 'dashboard-quality-observability') {
      return { data: queryState.qualityData, isLoading: false };
    }
    if (key === 'dashboard-failed-domains') {
      return { data: queryState.failedDomains, isLoading: false };
    }
    if (key === 'users') {
      return { data: queryState.users, isLoading: false };
    }
    return { data: undefined, isLoading: false };
  },
}));

vi.mock('../api', () => ({
  mockApi: {
    getDashboardSummary: vi.fn(),
    getFailedDomains: vi.fn(),
    getUsers: vi.fn(),
  },
  qualityApi: {
    getObservability: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

describe('Dashboard and Users pages', () => {
  beforeEach(() => {
    queryState.dashboardLoading = false;
    queryState.dashboardData = {
      stats: {
        activeUsers: 3,
        activeNodes: 5,
        systemLoadPercent: 34,
        configVersion: 'v0.1.1',
      },
      traffic: {
        uploadSeries: Array.from({ length: 24 }, (_, i) => i * 100),
        downloadSeries: Array.from({ length: 24 }, (_, i) => i * 150),
      },
      devices: {
        series: Array.from({ length: 24 }, (_, i) => (i % 5) + 1),
      },
      syncRequests: {
        series: Array.from({ length: 24 }, () => 0),
      },
      auditLogs: [],
    };
    queryState.qualityData = {
      topDomains: [
        { domain: 'google.com', count: 100, policy: 'proxy' },
        { domain: '172.19.0.2:53', count: 20, policy: 'dns' },
      ],
      failureReasons: [{ code: 'CONNECT_TIMEOUT', count: 5, ratio: 0.5 }],
    };
    queryState.failedDomains = [
      {
        domain: 'twitter.com',
        failures: 8,
        requests: 20,
        successRate: 60,
        lastError: 'dial tcp timeout',
        lastSeen: '2026-02-23T10:00:00.000Z',
        outboundType: 'proxy',
      },
    ];
    queryState.users = [
      {
        id: 'u1',
        username: 'alice',
        displayName: 'Alice',
        email: 'alice@example.com',
        status: 'active',
        traffic: { total: 1024 * 1024 * 10 },
        devices: [{ id: 'd1' }],
        lastOnline: 'just now',
      },
    ];
    navigateMock.mockReset();
  });

  it('renders dashboard with cards, charts and domain/failure sections', async () => {
    const { DashboardPage } = await import('../pages/Dashboard');
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).toContain('Traffic Overview');
    expect(html).toContain('Top Domains (All Requests)');
    expect(html).toContain('Proxy Failures');
    expect(html).toContain('Failed Domains');
    expect(html).toContain('max-w-[1800px]');
    expect(html).toContain('google.com');
    expect(html).toContain('twitter.com');
  });

  it('renders dashboard empty branches when no domains/failures', async () => {
    queryState.qualityData = { topDomains: [], failureReasons: [] };
    queryState.failedDomains = [];
    const { DashboardPage } = await import('../pages/Dashboard');
    const html = renderToStaticMarkup(<DashboardPage />);
    expect(html).toContain('No domain requests yet');
    expect(html).toContain('No failure reasons yet');
    expect(html).toContain('No failed domains in last 24h');
  });

  it('renders users directory rows', async () => {
    const { UsersPage } = await import('../pages/Users');
    const html = renderToStaticMarkup(<UsersPage />);
    expect(html).toContain('User Management');
    expect(html).toContain('Users Directory');
    expect(html).toContain('alice@example.com');
    expect(html).toContain('View Details');
  });
});
