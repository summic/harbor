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
  updateSessionUser,
} from './auth';
import { mockApi } from './api';

type AuthContextValue = {
  loading: boolean;
  error: string | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  ssoEnabled: boolean;
  ssoConfigured: boolean;
  login: () => Promise<void>;
  logout: () => void;
  updateDisplayName: (displayName: string) => void;
};

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);
const ADMIN_SUB = 'deeed4b7-748b-4301-8c9e-dfe0893a80cf';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [session, setSession] = React.useState<AuthSession | null>(null);
  const ssoEnabled = oidcConfig.enabled;
  const ssoConfigured = isSsoConfigured();
  const isAdmin = (session?.user?.sub ?? '') === ADMIN_SUB;
  const invalidateSession = React.useCallback(() => {
    clearSession();
    setSession(null);
    setError('Session expired, please sign in again.');
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const handleAuthInvalidation = () => {
      if (!cancelled) {
        invalidateSession();
      }
    };
    window.addEventListener('harbor:auth-invalid', handleAuthInvalidation);
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
          try {
            await mockApi.syncCurrentUserFromSession();
          } catch {
            // keep auth flow resilient
          }
        } else if (!cancelled && (callbackSession || existing)) {
          try {
            await mockApi.syncCurrentUserFromSession();
          } catch {
            // keep auth flow resilient
          }
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
      window.removeEventListener('harbor:auth-invalid', handleAuthInvalidation);
    };
  }, [ssoEnabled, invalidateSession]);

  const login = React.useCallback(async () => {
    setError(null);
    await startLogin();
  }, []);

  const logout = React.useCallback(() => {
    setSession(null);
    oidcLogout();
  }, []);

  const updateDisplayName = React.useCallback((displayName: string) => {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    const next = updateSessionUser({ name: trimmed, preferred_username: trimmed });
    if (next) {
      setSession(next);
    } else if (session?.user) {
      setSession({
        ...session,
        user: {
          ...session.user,
          name: trimmed,
          preferred_username: trimmed,
        },
      });
    }
  }, [session]);

  const value: AuthContextValue = {
    loading,
    error,
    session,
    isAuthenticated: !!session?.accessToken,
    isAdmin,
    ssoEnabled,
    ssoConfigured,
    login,
    logout,
    updateDisplayName,
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
