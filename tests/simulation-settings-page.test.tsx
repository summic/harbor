import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const queryState = vi.hoisted(() => ({
  settingsLoading: false,
  settingsData: null as any,
  outboundTagsData: [] as string[],
  simulationMutation: {
    isPending: false,
    data: null as any,
    error: null as Error | null,
    mutate: vi.fn(),
  },
  settingsMutation: {
    isSuccess: false,
    mutate: vi.fn(),
  },
}));

const queryClientState = vi.hoisted(() => ({
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'settings') {
      return { data: queryState.settingsData, isLoading: queryState.settingsLoading };
    }
    if (queryKey[0] === 'outboundTags') {
      return { data: queryState.outboundTagsData, isLoading: false };
    }
    return { data: undefined, isLoading: false };
  },
  useMutation: ({ mutationFn, onSuccess }: { mutationFn: unknown; onSuccess?: (value: any) => void }) => {
    if ((mutationFn as any)?.name === 'simulateTraffic') {
      return queryState.simulationMutation;
    }
    return {
      ...queryState.settingsMutation,
      onSuccess,
    };
  },
  useQueryClient: () => queryClientState,
}));

vi.mock('../api', () => ({
  mockApi: {
    simulateTraffic: async () => ({}),
    getSettings: async () => ({}),
    getOutboundTags: async () => [],
    saveSettings: async (input: unknown) => input,
  },
}));

describe('Simulation and Settings pages', () => {
  beforeEach(() => {
    queryState.settingsLoading = false;
    queryState.settingsData = null;
    queryState.outboundTagsData = ['proxy', 'direct'];
    queryState.simulationMutation = {
      isPending: false,
      data: null,
      error: null,
      mutate: vi.fn(),
    };
    queryState.settingsMutation = {
      isSuccess: false,
      mutate: vi.fn(),
    };
    queryClientState.setQueryData = vi.fn();
    queryClientState.invalidateQueries = vi.fn();
  });

  it('renders simulation page empty and loading variants', async () => {
    const { SimulationPage } = await import('../pages/Simulation');
    const emptyHtml = renderToStaticMarkup(<SimulationPage />);
    expect(emptyHtml).toContain('Traffic Simulation');
    expect(emptyHtml).toContain('Run simulation to inspect the full decision timeline.');
    expect(emptyHtml).toContain('Run Simulation');

    queryState.simulationMutation.isPending = true;
    const pendingHtml = renderToStaticMarkup(<SimulationPage />);
    expect(pendingHtml).toContain('Simulating...');
  });

  it('renders simulation result and error branches', async () => {
    queryState.simulationMutation.error = new Error('network failed');
    const { SimulationPage } = await import('../pages/Simulation');
    const errorHtml = renderToStaticMarkup(<SimulationPage />);
    expect(errorHtml).toContain('network failed');

    queryState.simulationMutation.error = null;
    queryState.simulationMutation.data = {
      input: { target: 'example.com', protocol: 'tcp', port: 443 },
      normalized: { domain: 'example.com', ip: undefined },
      dns: { selectedServer: 'dns_proxy', matchedRule: 'rule #1' },
      route: {
        finalOutbound: 'proxy',
        matchedRules: [
          { index: 1, summary: '{"rule_set":["kn-system"]}', outbound: 'proxy' },
        ],
        actions: [],
        usedFinalFallback: false,
      },
    };
    const resultHtml = renderToStaticMarkup(<SimulationPage />);
    expect(resultHtml).toContain('DNS Decision');
    expect(resultHtml).toContain('server: dns_proxy');
    expect(resultHtml).toContain('Final Outbound');
    expect(resultHtml).toContain('proxy');
  });

  it('renders settings page loading and success states', async () => {
    const { SettingsPage } = await import('../pages/Settings');
    queryState.settingsLoading = true;
    const loadingHtml = renderToStaticMarkup(<SettingsPage />);
    expect(loadingHtml).toContain('Settings');
    expect(loadingHtml).toContain('animate-spin');

    queryState.settingsLoading = false;
    queryState.settingsData = {
      logDisabled: false,
      logLevel: 'warn',
      logOutput: 'test_mainland.log',
      logTimestamp: true,
      ntpEnabled: true,
      ntpServer: 'time.apple.com',
      ntpServerPort: 123,
      ntpInterval: '30m',
      ntpDetour: 'direct',
      ntpDomainResolver: 'dns_direct',
      tunTag: 'tun-in',
      tunAddress: '172.19.0.1/30',
      tunAutoRoute: true,
      tunStrictRoute: true,
      tunStack: 'mixed',
      routeFinal: 'proxy',
      routeAutoDetectInterface: false,
      routeDefaultDomainResolver: 'dns_direct',
      dnsFinal: 'dns_proxy',
      dnsIndependentCache: true,
      dnsStrategy: 'prefer_ipv4',
    };
    queryState.settingsMutation.isSuccess = true;

    const readyHtml = renderToStaticMarkup(<SettingsPage />);
    expect(readyHtml).toContain('Route Final');
    expect(readyHtml).toContain('DNS Final Server Tag');
    expect(readyHtml).toContain('Unified Profile');
    expect(readyHtml).toContain('Settings saved.');
  });
});
