import React from 'react';
import { UserRound, Save, FileJson, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth-context';
import { mockApi } from '../api';

export const AccountSettingsPage: React.FC = () => {
  const auth = useAuth();
  const user = auth.session?.user as Record<string, unknown> | undefined;
  const initialName =
    (user?.name as string | undefined) ||
    (user?.preferred_username as string | undefined) ||
    (user?.email as string | undefined) ||
    '';
  const [displayName, setDisplayName] = React.useState(initialName);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [profileContent, setProfileContent] = React.useState('');
  const [effectiveContent, setEffectiveContent] = React.useState('');
  const [profileSaving, setProfileSaving] = React.useState(false);
  const [profileLoading, setProfileLoading] = React.useState(false);
  const [profileMessage, setProfileMessage] = React.useState<string | null>(null);
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [domainSuffixText, setDomainSuffixText] = React.useState('');
  const [domainOutbound, setDomainOutbound] = React.useState<'proxy' | 'direct' | 'block'>('proxy');
  const [dnsHostsText, setDnsHostsText] = React.useState('');

  const prettify = (value: unknown) => JSON.stringify(value, null, 2);

  const parseProfile = React.useCallback((content: string) => {
    try {
      const parsed = JSON.parse(content) as Record<string, any>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }, []);

  const hydrateVisualEditors = React.useCallback((content: string) => {
    const root = parseProfile(content);
    const route = (root.route ?? {}) as Record<string, any>;
    const dns = (root.dns ?? {}) as Record<string, any>;
    const ruleSet = Array.isArray(route.rule_set) ? route.rule_set : [];
    const routeRules = Array.isArray(route.rules) ? route.rules : [];
    const dnsServers = Array.isArray(dns.servers) ? dns.servers : [];

    const domainRuleSet = ruleSet.find((item) => item?.tag === 'user-domains');
    const domainList = (() => {
      const rules = Array.isArray(domainRuleSet?.rules) ? domainRuleSet.rules : [];
      const first = rules.find((it) => Array.isArray(it?.domain_suffix));
      return Array.isArray(first?.domain_suffix) ? first.domain_suffix : [];
    })();
    setDomainSuffixText(domainList.join('\n'));

    const outboundRule = routeRules.find(
      (item) => Array.isArray(item?.rule_set) && item.rule_set.includes('user-domains'),
    );
    const outboundValue = String(outboundRule?.outbound || 'proxy').toLowerCase();
    setDomainOutbound(
      outboundValue === 'direct' ? 'direct' : outboundValue === 'block' ? 'block' : 'proxy',
    );

    const dnsHostsServer = dnsServers.find((item) => item?.tag === 'dns_user_hosts' && item?.type === 'hosts');
    const predefined = (dnsHostsServer?.predefined ?? {}) as Record<string, string>;
    const hostLines = Object.entries(predefined).map(([host, ip]) => `${ip} ${host}`);
    setDnsHostsText(hostLines.join('\n'));
  }, [parseProfile]);

  const applyVisualEditorsToProfile = React.useCallback(() => {
    const root = parseProfile(profileContent);
    root.route = root.route && typeof root.route === 'object' ? root.route : {};
    root.dns = root.dns && typeof root.dns === 'object' ? root.dns : {};
    root.route.rule_set = Array.isArray(root.route.rule_set) ? root.route.rule_set : [];
    root.route.rules = Array.isArray(root.route.rules) ? root.route.rules : [];
    root.dns.servers = Array.isArray(root.dns.servers) ? root.dns.servers : [];
    root.dns.rules = Array.isArray(root.dns.rules) ? root.dns.rules : [];

    const suffixes = domainSuffixText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    root.route.rule_set = root.route.rule_set.filter((item: any) => item?.tag !== 'user-domains');
    root.route.rules = root.route.rules.filter(
      (item: any) => !(Array.isArray(item?.rule_set) && item.rule_set.includes('user-domains')),
    );
    if (suffixes.length > 0) {
      root.route.rule_set.push({
        tag: 'user-domains',
        type: 'inline',
        rules: [{ domain_suffix: suffixes }],
      });
      root.route.rules.push({
        rule_set: ['user-domains'],
        outbound: domainOutbound,
      });
    }

    const hostMap: Record<string, string> = {};
    dnsHostsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const ip = parts[0];
          const host = parts[1];
          hostMap[host] = ip;
        }
      });
    root.dns.servers = root.dns.servers.filter((item: any) => item?.tag !== 'dns_user_hosts');
    root.dns.rules = root.dns.rules.filter((item: any) => item?.server !== 'dns_user_hosts');
    const hostnames = Object.keys(hostMap);
    if (hostnames.length > 0) {
      root.dns.servers.push({
        type: 'hosts',
        tag: 'dns_user_hosts',
        predefined: hostMap,
      });
      root.dns.rules.push({
        domain: hostnames,
        server: 'dns_user_hosts',
      });
    }

    const next = prettify(root);
    setProfileContent(next);
    setProfileMessage('Visual changes applied to JSON.');
    setProfileError(null);
  }, [domainOutbound, domainSuffixText, dnsHostsText, parseProfile, profileContent]);

  const loadProfile = React.useCallback(async () => {
    try {
      setProfileLoading(true);
      setProfileError(null);
      const [myProfile, effective] = await Promise.all([
        mockApi.getMyUnifiedProfile(),
        mockApi.getEffectiveUnifiedProfile(),
      ]);
      const myContent = myProfile.content || '{}';
      setProfileContent(myContent);
      hydrateVisualEditors(myContent);
      setEffectiveContent(effective.content || '{}');
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Failed to load profile.');
    } finally {
      setProfileLoading(false);
    }
  }, [hydrateVisualEditors]);

  React.useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const onSave = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError('Name is required.');
      setMessage(null);
      return;
    }
    try {
      setSaving(true);
      setError(null);
      setMessage(null);
      const updated = await mockApi.updateCurrentUserDisplayName(trimmed);
      const nextName = updated.displayName || trimmed;
      auth.updateDisplayName(nextName);
      setDisplayName(nextName);
      setMessage('Name updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update name.');
    } finally {
      setSaving(false);
    }
  };

  const onSaveProfile = async () => {
    try {
      setProfileSaving(true);
      setProfileError(null);
      setProfileMessage(null);
      JSON.parse(profileContent);
      await mockApi.saveMyUnifiedProfile({ content: profileContent });
      const effective = await mockApi.getEffectiveUnifiedProfile();
      setEffectiveContent(effective.content || '{}');
      setProfileMessage('Personal profile saved.');
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Failed to save personal profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center gap-2">
          <UserRound size={18} className="text-slate-600" />
          <h1 className="text-lg font-semibold text-slate-900">Account Settings</h1>
        </div>
        <p className="text-sm text-slate-500 mt-2">Update your display name.</p>

        <div className="mt-6 max-w-xl">
          <label className="block text-sm font-medium text-slate-700 mb-2" htmlFor="display-name">
            Name
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            placeholder="Enter your display name"
          />
          {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
          {message ? <p className="mt-2 text-sm text-emerald-600">{message}</p> : null}
        </div>

        <div className="mt-5">
          <button
            onClick={() => void onSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileJson size={18} className="text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900">My Personal Config (Server-side)</h2>
          </div>
          <button
            onClick={() => void loadProfile()}
            disabled={profileLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={14} className={profileLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        <p className="text-sm text-slate-500 mt-2">
          This JSON is stored on Harbor per user and merged with global config at subscribe time.
        </p>

        <div className="mt-4 border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">
              Domain Suffixes (one per line)
            </label>
            <textarea
              value={domainSuffixText}
              onChange={(e) => setDomainSuffixText(e.target.value)}
              className="w-full h-28 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono leading-5"
              placeholder="example.com"
              spellCheck={false}
            />
            <div className="mt-2">
              <label className="text-xs font-semibold text-slate-600 mr-2">Outbound:</label>
              <select
                value={domainOutbound}
                onChange={(e) => setDomainOutbound(e.target.value as 'proxy' | 'direct' | 'block')}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                <option value="proxy">proxy</option>
                <option value="direct">direct</option>
                <option value="block">block</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">
              DNS Hosts (one per line: `IP HOST`)
            </label>
            <textarea
              value={dnsHostsText}
              onChange={(e) => setDnsHostsText(e.target.value)}
              className="w-full h-24 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono leading-5"
              placeholder="192.168.1.123 chat-staging.beforeve.com"
              spellCheck={false}
            />
          </div>

          <div>
            <button
              onClick={() => applyVisualEditorsToProfile()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Apply to JSON
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">User Layer JSON</label>
            <textarea
              value={profileContent}
              onChange={(e) => setProfileContent(e.target.value)}
              className="w-full h-80 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono leading-5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Effective (Global + User)</label>
            <textarea
              value={effectiveContent}
              readOnly
              className="w-full h-80 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono leading-5 text-slate-700"
              spellCheck={false}
            />
          </div>
        </div>

        {profileError ? <p className="mt-3 text-sm text-rose-600">{profileError}</p> : null}
        {profileMessage ? <p className="mt-3 text-sm text-emerald-600">{profileMessage}</p> : null}

        <div className="mt-4">
          <button
            onClick={() => void onSaveProfile()}
            disabled={profileSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {profileSaving ? 'Saving...' : 'Save Personal Config'}
          </button>
        </div>
      </section>
    </div>
  );
};
