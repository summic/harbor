import React from 'react';
import {
  AuthSession,
  clearSession,
  handleAuthCallbackIfPresent,
  isSsoConfigured,
  loadSession,
  logout as oidcLogout,
  oidcConfig,
  startLogin,
} from './auth';

type AuthContextValue = {
  loading: boolean;
  error: string | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  ssoEnabled: boolean;
  ssoConfigured: boolean;
  login: () => Promise<void>;
  logout: () => void;
};

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [session, setSession] = React.useState<AuthSession | null>(null);
  const ssoEnabled = oidcConfig.enabled;
  const ssoConfigured = isSsoConfigured();

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (!ssoEnabled) {
          if (!cancelled) {
            setSession(null);
            setLoading(false);
          }
          return;
        }

        const existing = loadSession();
        if (existing?.expiresAt && existing.expiresAt <= Date.now()) {
          clearSession();
        } else if (existing && !cancelled) {
          setSession(existing);
        }

        const callbackSession = await handleAuthCallbackIfPresent();
        if (!cancelled && callbackSession) {
          setSession(callbackSession);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'SSO callback failed');
          clearSession();
          setSession(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [ssoEnabled]);

  const login = React.useCallback(async () => {
    setError(null);
    await startLogin();
  }, []);

  const logout = React.useCallback(() => {
    setSession(null);
    oidcLogout();
  }, []);

  const value: AuthContextValue = {
    loading,
    error,
    session,
    isAuthenticated: !!session?.accessToken,
    ssoEnabled,
    ssoConfigured,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};

