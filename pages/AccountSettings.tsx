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

  const loadProfile = React.useCallback(async () => {
    try {
      setProfileLoading(true);
      setProfileError(null);
      const [myProfile, effective] = await Promise.all([
        mockApi.getMyUnifiedProfile(),
        mockApi.getEffectiveUnifiedProfile(),
      ]);
      setProfileContent(myProfile.content || '{}');
      setEffectiveContent(effective.content || '{}');
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Failed to load profile.');
    } finally {
      setProfileLoading(false);
    }
  }, []);

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
