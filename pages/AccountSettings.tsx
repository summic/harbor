import React from 'react';
import { UserRound, Save } from 'lucide-react';
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
    </div>
  );
};
