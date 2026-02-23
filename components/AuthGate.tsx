import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth-context';

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();
  const [autoLoginPending, setAutoLoginPending] = React.useState(false);

  const shouldAutoLogin = React.useMemo(() => {
    if (!auth.error) return false;
    const message = auth.error.toLowerCase();
    return message.includes('token') || message.includes('令牌') || message.includes('session expired');
  }, [auth.error]);

  React.useEffect(() => {
    if (
      !auth.ssoEnabled ||
      auth.loading ||
      !auth.ssoConfigured ||
      auth.isAuthenticated ||
      !shouldAutoLogin
    ) {
      setAutoLoginPending(false);
      return;
    }
    setAutoLoginPending(true);
    const timer = window.setTimeout(() => {
      void auth.login();
    }, 800);
    return () => {
      window.clearTimeout(timer);
    };
  }, [auth.ssoEnabled, auth.loading, auth.ssoConfigured, auth.isAuthenticated, auth.login, shouldAutoLogin]);

  if (!auth.ssoEnabled) {
    return <>{children}</>;
  }

  if (auth.loading) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <ShieldCheck className="h-10 w-10 text-blue-600 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-slate-900">Connecting to Kylith SSO</h1>
          <p className="text-sm text-slate-500 mt-2">Completing secure sign-in flow.</p>
        </div>
      </div>
    );
  }

  if (!auth.ssoConfigured) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl bg-white border border-rose-200 rounded-2xl shadow-sm p-8">
          <h1 className="text-xl font-semibold text-rose-700">Kylith SSO is not configured</h1>
          <p className="text-sm text-slate-600 mt-3">
            Set these environment variables and redeploy:
            <code className="block mt-2 text-xs bg-slate-100 p-3 rounded-lg">
              VITE_SSO_CLIENT_ID{'\n'}
              VITE_SSO_AUTHORIZE_URL{'\n'}
              VITE_SSO_TOKEN_URL
            </code>
          </p>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-dvh bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <ShieldCheck className="h-10 w-10 text-blue-600 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-slate-900">Sign in with Kylith SSO</h1>
          <p className="text-sm text-slate-500 mt-2">You must sign in to access Sail Console.</p>
          {auth.error ? <p className="text-sm text-rose-600 mt-3">{auth.error}</p> : null}
          {autoLoginPending ? (
            <p className="text-xs text-slate-500 mt-2">Token invalid or expired. Redirecting to SSO sign-in...</p>
          ) : null}
          <button
            onClick={() => {
              void auth.login();
            }}
            className="mt-6 inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Continue with Kylith
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

