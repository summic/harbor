
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './auth-context';
import { AppShell } from './components/Layout';
import { AuthGate } from './components/AuthGate';
import { DashboardPage } from './pages/Dashboard';
import { DomainsPage } from './pages/Domains';
import { DomainGroupsPage } from './pages/DomainGroups';
import { ProxiesPage } from './pages/Proxies';
import { SimulationPage } from './pages/Simulation';
import { DnsHostsPage } from './pages/DnsHosts';
import { UnifiedProfilePage } from './pages/UnifiedProfile';
import { UsersPage } from './pages/Users';
import { UserDetailsPage } from './pages/UserDetails';
import { UserTargetDetailsPage } from './pages/UserTargetDetails';
import { AccountSettingsPage } from './pages/AccountSettings';
import { SettingsPage } from './pages/Settings';
import { FailedDomainsPage } from './pages/FailedDomains';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const AdminRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const auth = useAuth();
  if (!auth.isAdmin) {
    return <Navigate to="/" replace />;
  }
  return children;
};

const HomeRoute: React.FC = () => {
  const auth = useAuth();
  const currentSub = (auth.session?.user?.sub ?? '').trim();
  if (auth.isAdmin) {
    return <DashboardPage />;
  }
  if (currentSub) {
    return <Navigate to={`/users/${encodeURIComponent(currentSub)}`} replace />;
  }
  return <Navigate to="/account" replace />;
};

const OwnOrAdminRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const auth = useAuth();
  const params = useParams<{ id: string }>();
  const currentSub = (auth.session?.user?.sub ?? '').trim();
  const targetId = (params.id ?? '').trim();
  if (auth.isAdmin || (currentSub && targetId && currentSub === targetId)) {
    return children;
  }
  return <Navigate to="/" replace />;
};

const LegacyDomainGroupDomainsRedirect: React.FC = () => {
  const params = useParams<{ groupName: string }>();
  const groupName = params.groupName ? encodeURIComponent(params.groupName) : '';
  return <Navigate to={groupName ? `/policy/${groupName}/rules` : '/policy'} replace />;
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <AuthGate>
            <AppShell>
              <Routes>
                <Route path="/" element={<HomeRoute />} />
                <Route path="/dashboard" element={<AdminRoute><DashboardPage /></AdminRoute>} />
                <Route path="/account" element={<AccountSettingsPage />} />
                <Route path="/policy" element={<AdminRoute><DomainGroupsPage /></AdminRoute>} />
                <Route path="/policy/:groupName/rules" element={<AdminRoute><DomainsPage /></AdminRoute>} />
                <Route path="/domain-groups" element={<Navigate to="/policy" replace />} />
                <Route path="/domain-groups/:groupName/domains" element={<LegacyDomainGroupDomainsRedirect />} />
                <Route path="/policy/:groupName/domains" element={<LegacyDomainGroupDomainsRedirect />} />
                <Route path="/proxies" element={<AdminRoute><ProxiesPage /></AdminRoute>} />
                <Route path="/routing" element={<Navigate to="/policy" replace />} />
                <Route path="/simulation" element={<AdminRoute><SimulationPage /></AdminRoute>} />
                <Route path="/dns-hosts" element={<AdminRoute><DnsHostsPage /></AdminRoute>} />
                <Route path="/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
                <Route path="/users/:id" element={<OwnOrAdminRoute><UserDetailsPage /></OwnOrAdminRoute>} />
                <Route path="/users/:id/targets/:target" element={<OwnOrAdminRoute><UserTargetDetailsPage /></OwnOrAdminRoute>} />
                <Route path="/profile" element={<AdminRoute><UnifiedProfilePage /></AdminRoute>} />
                <Route path="/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
                <Route path="/failed-domains" element={<AdminRoute><FailedDomainsPage /></AdminRoute>} />
                <Route path="/quality" element={<Navigate to="/" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </AuthGate>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
