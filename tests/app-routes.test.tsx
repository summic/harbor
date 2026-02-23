import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const authState = vi.hoisted(() => ({
  isAdmin: true,
}));

const routerState = vi.hoisted(() => ({
  groupName: 'Group A/B',
}));

vi.mock('../auth-context', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ isAdmin: authState.isAdmin }),
}));

vi.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Routes: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Route: ({ element }: { element: React.ReactElement }) => <>{element}</>,
  Navigate: ({ to }: { to: string }) => <div data-nav={to}>NAV:{to}</div>,
  useParams: () => ({ groupName: routerState.groupName }),
}));

vi.mock('@tanstack/react-query', () => ({
  QueryClient: class {
    constructor(_: unknown) {}
  },
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../components/Layout', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('../components/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../pages/Dashboard', () => ({ DashboardPage: () => <div>DashboardPage</div> }));
vi.mock('../pages/Domains', () => ({ DomainsPage: () => <div>DomainsPage</div> }));
vi.mock('../pages/DomainGroups', () => ({ DomainGroupsPage: () => <div>DomainGroupsPage</div> }));
vi.mock('../pages/Proxies', () => ({ ProxiesPage: () => <div>ProxiesPage</div> }));
vi.mock('../pages/Simulation', () => ({ SimulationPage: () => <div>SimulationPage</div> }));
vi.mock('../pages/DnsHosts', () => ({ DnsHostsPage: () => <div>DnsHostsPage</div> }));
vi.mock('../pages/UnifiedProfile', () => ({ UnifiedProfilePage: () => <div>UnifiedProfilePage</div> }));
vi.mock('../pages/Users', () => ({ UsersPage: () => <div>UsersPage</div> }));
vi.mock('../pages/UserDetails', () => ({ UserDetailsPage: () => <div>UserDetailsPage</div> }));
vi.mock('../pages/UserTargetDetails', () => ({ UserTargetDetailsPage: () => <div>UserTargetDetailsPage</div> }));
vi.mock('../pages/AccountSettings', () => ({ AccountSettingsPage: () => <div>AccountSettingsPage</div> }));
vi.mock('../pages/Settings', () => ({ SettingsPage: () => <div>SettingsPage</div> }));
vi.mock('../pages/FailedDomains', () => ({ FailedDomainsPage: () => <div>FailedDomainsPage</div> }));

describe('App route wiring', () => {
  beforeEach(() => {
    authState.isAdmin = true;
    routerState.groupName = 'Group A/B';
  });

  it('renders route elements when admin', async () => {
    const module = await import('../App');
    const html = renderToStaticMarkup(<module.default />);
    expect(html).toContain('DashboardPage');
    expect(html).toContain('DomainGroupsPage');
    expect(html).toContain('DomainsPage');
    expect(html).toContain('ProxiesPage');
    expect(html).toContain('SimulationPage');
    expect(html).toContain('DnsHostsPage');
    expect(html).toContain('UsersPage');
    expect(html).toContain('UserDetailsPage');
    expect(html).toContain('UserTargetDetailsPage');
    expect(html).toContain('UnifiedProfilePage');
    expect(html).toContain('SettingsPage');
    expect(html).toContain('FailedDomainsPage');
    expect(html).toContain('NAV:/policy/Group%20A%2FB/rules');
  });

  it('redirects admin-only pages for normal user', async () => {
    authState.isAdmin = false;
    const module = await import('../App');
    const html = renderToStaticMarkup(<module.default />);
    expect(html).toContain('NAV:/');
    expect(html).toContain('AccountSettingsPage');
  });
});
