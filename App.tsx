
import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './components/Layout';
import { DashboardPage } from './pages/Dashboard';
import { DomainsPage } from './pages/Domains';
import { ProxiesPage } from './pages/Proxies';
import { RoutingPage } from './pages/Routing';
import { DnsHostsPage } from './pages/DnsHosts';
import { PublishPage } from './pages/Publish';
import { UnifiedProfilePage } from './pages/UnifiedProfile';
import { UsersPage } from './pages/Users';
import { UserDetailsPage } from './pages/UserDetails';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AppShell>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/domains" element={<DomainsPage />} />
            <Route path="/proxies" element={<ProxiesPage />} />
            <Route path="/routing" element={<RoutingPage />} />
            <Route path="/dns-hosts" element={<DnsHostsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/:id" element={<UserDetailsPage />} />
            <Route path="/profile" element={<UnifiedProfilePage />} />
            <Route path="/publish" element={<PublishPage />} />
          </Routes>
        </AppShell>
      </Router>
    </QueryClientProvider>
  );
};

export default App;
