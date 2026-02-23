const STORAGE_KEY = 'kylith_sso_session_v1';
const PKCE_VERIFIER_KEY = 'kylith_sso_pkce_verifier';
const OAUTH_STATE_KEY = 'kylith_sso_state';
const RETURN_PATH_KEY = 'kylith_sso_return_path';

type Nullable<T> = T | null;

export type AuthUser = {
  sub?: string;
  name?: string;
  email?: string;
  role?: string;
  preferred_username?: string;
  [key: string]: unknown;
};

export type AuthSession = {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  tokenType: string;
  scope?: string;
  expiresAt?: number;
  user?: AuthUser;
};

type OidcConfig = {
  enabled: boolean;
  clientId: string;
  scope: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  logoutUrl?: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
};

const trim = (v: string | undefined) => (v ?? '').trim();

const redirectUriDefault = () => `${window.location.origin}${window.location.pathname}`;

export const oidcConfig: OidcConfig = {
  enabled: trim(import.meta.env.VITE_SSO_ENABLED) === 'true',
  clientId: trim(import.meta.env.VITE_SSO_CLIENT_ID),
  scope: trim(import.meta.env.VITE_SSO_SCOPE) || 'openid profile email',
  authorizeUrl: trim(import.meta.env.VITE_SSO_AUTHORIZE_URL),
  tokenUrl: trim(import.meta.env.VITE_SSO_TOKEN_URL),
  userInfoUrl: trim(import.meta.env.VITE_SSO_USERINFO_URL) || undefined,
  logoutUrl: trim(import.meta.env.VITE_SSO_LOGOUT_URL) || undefined,
  redirectUri: trim(import.meta.env.VITE_SSO_REDIRECT_URI) || redirectUriDefault(),
  postLogoutRedirectUri:
    trim(import.meta.env.VITE_SSO_POST_LOGOUT_REDIRECT_URI) || window.location.origin,
};

export const isSsoConfigured = () =>
  !!(oidcConfig.clientId && oidcConfig.authorizeUrl && oidcConfig.tokenUrl);

const base64Url = (bytes: Uint8Array) => {
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const randomString = (length = 32) => {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return base64Url(bytes);
};

const sha256Base64Url = async (value: string) => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64Url(new Uint8Array(digest));
};

const parseJwtPayload = (token?: string): AuthUser | undefined => {
  if (!token) return undefined;
  const parts = token.split('.');
  if (parts.length < 2) return undefined;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='));
    return JSON.parse(json) as AuthUser;
  } catch {
    return undefined;
  }
};

const pickUserInfo = async (accessToken: string, fallback: AuthUser | undefined): Promise<AuthUser | undefined> => {
  if (!oidcConfig.userInfoUrl) return fallback;
  try {
    const userRes = await fetch(oidcConfig.userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) return fallback;
    return (await userRes.json()) as AuthUser;
  } catch {
    return fallback;
  }
};

const saveSession = (session: AuthSession) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

const toSession = (
  raw: AuthSession & {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    token_type?: string;
    expires_at?: number;
  },
): AuthSession => {
  const accessToken = raw.accessToken || raw.access_token;
  if (!accessToken) {
    throw new Error('access_token is required');
  }
  return {
    accessToken,
    idToken: raw.idToken || raw.id_token,
    refreshToken: raw.refreshToken || raw.refresh_token,
    tokenType: raw.tokenType || raw.token_type || 'Bearer',
    scope: raw.scope,
    expiresAt: raw.expiresAt ?? raw.expires_at,
    user: raw.user,
  };
};

export const updateSessionUser = (patch: Partial<AuthUser>): AuthSession | null => {
  const existing = loadSession();
  if (!existing) return null;
  const next: AuthSession = {
    ...existing,
    user: {
      ...(existing.user ?? {}),
      ...patch,
    },
  };
  saveSession(next);
  return next;
};

export const loadSession = (): Nullable<AuthSession> => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession & {
      access_token?: string;
      id_token?: string;
      refresh_token?: string;
      token_type?: string;
      expires_at?: number;
    };
    const normalized: AuthSession = toSession(parsed);
    if (parsed.accessToken !== normalized.accessToken || parsed.tokenType !== normalized.tokenType) {
      saveSession(normalized);
    }
    return normalized;
  } catch {
    return null;
  }
};

export const isSessionExpired = (session: Nullable<AuthSession>): boolean => {
  if (!session?.expiresAt) return false;
  return session.expiresAt <= Date.now();
};

const getRefreshPayload = async (session: AuthSession): Promise<AuthSession | null> => {
  if (!session.refreshToken || !oidcConfig.tokenUrl || !oidcConfig.clientId) return null;
  const tokenRes = await fetch(oidcConfig.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'refresh_token',
      client_id: oidcConfig.clientId,
      refresh_token: session.refreshToken,
    }),
  });
  if (!tokenRes.ok) return null;

  const tokenPayload = (await tokenRes.json()) as {
    access_token: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };
  const user = await pickUserInfo(
    tokenPayload.access_token,
    parseJwtPayload(tokenPayload.id_token) || parseJwtPayload(tokenPayload.access_token) || session.user,
  );

  const refreshed: AuthSession = {
    accessToken: tokenPayload.access_token,
    idToken: tokenPayload.id_token || session.idToken,
    refreshToken: tokenPayload.refresh_token || session.refreshToken,
    tokenType: tokenPayload.token_type || session.tokenType,
    scope: tokenPayload.scope || session.scope,
    expiresAt: tokenPayload.expires_in
      ? Date.now() + tokenPayload.expires_in * 1000
      : session.expiresAt,
    user,
  };

  saveSession(refreshed);
  return refreshed;
};

export const resolveActiveSession = async (): Promise<Nullable<AuthSession>> => {
  const session = loadSession();
  if (!session) return null;
  if (!isSessionExpired(session)) return session;
  if (!session.refreshToken) {
    clearSession();
    return null;
  }
  const refreshed = await getRefreshPayload(session);
  if (refreshed) return refreshed;
  clearSession();
  return null;
};

export const clearSession = () => {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(RETURN_PATH_KEY);
};

const formBody = (values: Record<string, string>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => params.set(k, v));
  return params.toString();
};

const cleanupAuthQuery = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
};

export const startLogin = async () => {
  if (!isSsoConfigured()) {
    throw new Error('SSO is not configured');
  }
  const verifier = randomString(64);
  const state = randomString(24);
  const challenge = await sha256Base64Url(verifier);
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}` || '/';
  sessionStorage.setItem(RETURN_PATH_KEY, returnPath);

  const url = new URL(oidcConfig.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', oidcConfig.clientId);
  url.searchParams.set('redirect_uri', oidcConfig.redirectUri);
  url.searchParams.set('scope', oidcConfig.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  window.location.assign(url.toString());
};

export const handleAuthCallbackIfPresent = async (): Promise<Nullable<AuthSession>> => {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);

  if (!code && !error) return null;
  if (error) {
    cleanupAuthQuery();
    throw new Error(`SSO login failed: ${error}`);
  }
  if (!code || !state || !verifier || !expectedState || state !== expectedState) {
    cleanupAuthQuery();
    throw new Error('Invalid SSO callback state');
  }

  const tokenRes = await fetch(oidcConfig.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'authorization_code',
      client_id: oidcConfig.clientId,
      redirect_uri: oidcConfig.redirectUri,
      code,
      code_verifier: verifier,
    }),
  });

  if (!tokenRes.ok) {
    let detail = '';
    try {
      const payload = (await tokenRes.json()) as {
        error?: string;
        error_description?: string;
        message?: string;
      };
      detail = payload.error_description || payload.error || payload.message || '';
    } catch {
      try {
        detail = await tokenRes.text();
      } catch {
        detail = '';
      }
    }
    cleanupAuthQuery();
    throw new Error(
      detail
        ? `Token exchange failed (${tokenRes.status}): ${detail}`
        : `Token exchange failed (${tokenRes.status})`,
    );
  }

  const tokenPayload = (await tokenRes.json()) as {
    access_token: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };

  if (!tokenPayload.access_token) {
    cleanupAuthQuery();
    throw new Error('Token exchange failed: missing access_token');
  }
  const user = await pickUserInfo(
    tokenPayload.access_token,
    parseJwtPayload(tokenPayload.id_token) || parseJwtPayload(tokenPayload.access_token),
  );

  const session: AuthSession = {
    accessToken: tokenPayload.access_token,
    idToken: tokenPayload.id_token,
    refreshToken: tokenPayload.refresh_token,
    tokenType: tokenPayload.token_type || 'Bearer',
    scope: tokenPayload.scope,
    expiresAt: tokenPayload.expires_in
      ? Date.now() + tokenPayload.expires_in * 1000
      : undefined,
    user,
  };

  saveSession(session);
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);

  const returnPath = sessionStorage.getItem(RETURN_PATH_KEY) || '/';
  sessionStorage.removeItem(RETURN_PATH_KEY);
  cleanupAuthQuery();
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentPath !== returnPath) {
    window.location.assign(returnPath);
  }
  return session;
};

export const logout = () => {
  const idToken = loadSession()?.idToken;
  clearSession();
  if (!oidcConfig.logoutUrl) return;
  const url = new URL(oidcConfig.logoutUrl);
  url.searchParams.set('post_logout_redirect_uri', oidcConfig.postLogoutRedirectUri);
  url.searchParams.set('client_id', oidcConfig.clientId);
  if (idToken) {
    url.searchParams.set('id_token_hint', idToken);
  }
  window.location.assign(url.toString());
};
