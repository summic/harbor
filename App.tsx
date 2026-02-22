
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './auth-context';
import { AppShell } from './components/Layout';
import { AuthGate } from './components/AuthGate';
import { DashboardPage } from './pages/Dashboard';
import { DomainsPage } from './pages/Domains';
import { DomainGroupsPage } from './pages/DomainGroups';
import { ProxiesPage } from './pages/Proxies';
import { RoutingPage } from './pages/Routing';
import { SimulationPage } from './pages/Simulation';
import { DnsHostsPage } from './pages/DnsHosts';
import { UnifiedProfilePage } from './pages/UnifiedProfile';
import { UsersPage } from './pages/Users';
import { UserDetailsPage } from './pages/UserDetails';
import { UserTargetDetailsPage } from './pages/UserTargetDetails';
import { AccountSettingsPage } from './pages/AccountSettings';

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

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <AuthGate>
            <AppShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/account" element={<AccountSettingsPage />} />
                <Route path="/domain-groups" element={<AdminRoute><DomainGroupsPage /></AdminRoute>} />
                <Route path="/domains" element={<AdminRoute><DomainsPage /></AdminRoute>} />
                <Route path="/proxies" element={<AdminRoute><ProxiesPage /></AdminRoute>} />
                <Route path="/routing" element={<AdminRoute><RoutingPage /></AdminRoute>} />
                <Route path="/simulation" element={<AdminRoute><SimulationPage /></AdminRoute>} />
                <Route path="/dns-hosts" element={<AdminRoute><DnsHostsPage /></AdminRoute>} />
                <Route path="/users" element={<AdminRoute><UsersPage /></AdminRoute>} />
                <Route path="/users/:id" element={<AdminRoute><UserDetailsPage /></AdminRoute>} />
                <Route path="/users/:id/targets/:target" element={<AdminRoute><UserTargetDetailsPage /></AdminRoute>} />
                <Route path="/profile" element={<AdminRoute><UnifiedProfilePage /></AdminRoute>} />
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
