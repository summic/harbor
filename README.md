# Harbor

Harbor is an open-source Sing-box control plane for managing routing data, proxy nodes, DNS hosts, unified client profiles, and user-level access data from one place.

It is built for teams that want a simple control plane instead of editing `sing-box`-style configuration by hand across multiple files and environments.

## What Harbor Does

- Manage policy groups and domain rules with a structured UI.
- Maintain proxy nodes, DNS servers, and hosts overrides.
- Publish unified client profiles and keep version history.
- Inspect users, devices, targets, failures, and traffic trends.
- Protect the console with OIDC-based SSO using Authorization Code + PKCE.

## Stack

- React 19
- TypeScript
- Vite
- TanStack Query
- SQLite via `better-sqlite3` or `node:sqlite`

## Local Development

### Prerequisites

- Node.js 22+
- npm

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

The dev server starts with the built-in API and local SQLite storage.

## Environment

### Required for SSO

- `VITE_SSO_ENABLED=true`
- `VITE_SSO_CLIENT_ID=<client_id>`
- `VITE_SSO_AUTHORIZE_URL=https://<sso-host>/oauth2/authorize`
- `VITE_SSO_TOKEN_URL=https://<sso-host>/oauth2/token`

### Optional

- `VITE_SSO_SCOPE=openid profile email`
- `VITE_SSO_REDIRECT_URI=https://harbor.example.com/auth/callback`
- `VITE_SSO_USERINFO_URL=https://<sso-host>/oauth2/userinfo`
- `VITE_SSO_LOGOUT_URL=https://<sso-host>/oauth2/logout`
- `VITE_SSO_POST_LOGOUT_REDIRECT_URI=https://harbor.example.com/`
- `VITE_API_BASE_URL=`

### API Hardening

- `SAIL_RATE_LIMIT_WINDOW_MS=60000`
- `SAIL_RATE_LIMIT_MAX_REQUESTS=300`
- `SAIL_TRUST_PROXY_HEADERS=true|false`
- `SAIL_TRUSTED_ORIGINS=harbor.example.com,localhost,127.0.0.1`
- `SAIL_ALLOWED_USERINFO_HOSTS=login.example.com,id.example.com`

If the rate limit is exceeded, the API returns `429` with a `Retry-After` header.

## Scripts

- `npm run dev` starts the app in development mode.
- `npm run build` builds the production bundle.
- `npm run preview` previews the production build locally.
- `npm run test` runs unit tests.
- `npm run test:coverage` runs tests with coverage.
- `npm run test:e2e` runs Playwright end-to-end tests.

## Release

The repository deploys from the `release` branch.

- Release process: [`RELEASE.md`](./RELEASE.md)
- Workflow: `.github/workflows/deploy-release.yml`
- Server path: `/var/www/sail`
- Active symlink: `/var/www/sail/current`

### Required GitHub Secrets

- `SAIL_HOST`
- `SAIL_USER`
- `SAIL_SSH_PRIVATE_KEY`
- `VITE_SSO_ENABLED`
- `VITE_SSO_CLIENT_ID`
- `VITE_SSO_AUTHORIZE_URL`
- `VITE_SSO_TOKEN_URL`

## Open Source Notes

- Remove private infrastructure defaults before deploying publicly.
- Prefer environment variables over hard-coded tenant domains.
- Keep policy examples and seed data generic so the repository stays reusable.
