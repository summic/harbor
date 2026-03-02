import React from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Settings2 } from 'lucide-react';
import { mockApi } from '../api';
import { LoadingOverlay, SectionCard } from '../components/Common';
import { CoreSettings } from '../types';

const defaultSettings: CoreSettings = {
  logDisabled: false,
  logLevel: 'info',
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
  routeAutoDetectInterface: true,
  routeDefaultDomainResolver: 'dns_direct',
  dnsFinal: 'dns_direct',
  dnsIndependentCache: true,
  dnsStrategy: 'prefer_ipv4',
};

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: mockApi.getSettings });
  const { data: outboundTags = [] } = useQuery({ queryKey: ['outboundTags'], queryFn: mockApi.getOutboundTags });
  const [form, setForm] = React.useState<CoreSettings>(defaultSettings);

  React.useEffect(() => {
    if (!data) return;
    setForm(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: mockApi.saveSettings,
    onSuccess: (next) => {
      setForm(next);
      queryClient.setQueryData(['settings'], next);
      queryClient.invalidateQueries({ queryKey: ['unifiedProfile'] });
    },
  });

  const update = <K extends keyof CoreSettings>(key: K, value: CoreSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-slate-500">System-level settings used to compile Unified Profile.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/profile" className="inline-flex items-center px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            Unified Profile
          </Link>
          <button
            onClick={() => saveMutation.mutate(form)}
            className="inline-flex items-center px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800"
          >
            <Save size={15} className="mr-2" />
            Save Settings
          </button>
        </div>
      </div>

      <SectionCard title="Log & NTP">
        <div className="relative space-y-4">
          {isLoading ? <LoadingOverlay /> : null}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm text-slate-600">
              Log Level
              <select className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" value={form.logLevel} onChange={(e) => update('logLevel', e.target.value as CoreSettings['logLevel'])}>
                <option value="trace">trace</option>
                <option value="debug">debug</option>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
              </select>
            </label>
            <label className="text-sm text-slate-600">
              Log Output
              <input className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" value={form.logOutput} onChange={(e) => update('logOutput', e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm text-slate-600">
              NTP Server
              <input className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" value={form.ntpServer} onChange={(e) => update('ntpServer', e.target.value)} />
            </label>
            <label className="text-sm text-slate-600">
              NTP Interval
              <input className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" value={form.ntpInterval} onChange={(e) => update('ntpInterval', e.target.value)} />
            </label>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="TUN">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="text-sm text-slate-600">
            Tag
            <input className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" value={form.tunTag} onChange={(e) => update('tunTag', e.target.value)} />
          </label>
          <label className="text-sm text-slate-600">
            Address
            <input className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" value={form.tunAddress} onChange={(e) => update('tunAddress', e.target.value)} />
          </label>
          <label className="text-sm text-slate-600">
            Stack
            <select className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" value={form.tunStack} onChange={(e) => update('tunStack', e.target.value as CoreSettings['tunStack'])}>
              <option value="mixed">mixed</option>
              <option value="system">system</option>
            </select>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Route & DNS Finals">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="text-sm text-slate-600">
            Route Final
            <select
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"
              value={form.routeFinal}
              onChange={(e) => update('routeFinal', e.target.value)}
            >
              {[...new Set([...outboundTags, form.routeFinal])].map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Route Resolver
            <input className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50" value={form.routeDefaultDomainResolver} onChange={(e) => update('routeDefaultDomainResolver', e.target.value)} />
          </label>
          <label className="text-sm text-slate-600">
            DNS Final Server Tag
            <input
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"
              value={form.dnsFinal}
              onChange={(e) => update('dnsFinal', e.target.value)}
              placeholder="e.g. dns_direct"
            />
            <span className="mt-1 block text-xs text-slate-400">Fallback DNS server tag used when no DNS rule matches.</span>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Switches">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-700">
          {[
            ['logDisabled', 'Log Disabled'],
            ['logTimestamp', 'Log Timestamp'],
            ['ntpEnabled', 'NTP Enabled'],
            ['tunAutoRoute', 'TUN Auto Route'],
            ['tunStrictRoute', 'TUN Strict Route'],
            ['routeAutoDetectInterface', 'Route Auto Detect Interface'],
            ['dnsIndependentCache', 'DNS Independent Cache'],
          ].map(([key, label]) => (
            <label key={key} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(form[key as keyof CoreSettings])}
                onChange={(e) => update(key as keyof CoreSettings, e.target.checked as never)}
              />
              {label}
            </label>
          ))}
        </div>
      </SectionCard>

      {saveMutation.isSuccess ? (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2 inline-flex items-center gap-2">
          <Settings2 size={14} />
          Settings saved.
        </div>
      ) : null}
    </div>
  );
};
