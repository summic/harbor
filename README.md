<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/14HCbQHJ721okoEmtAiiUFJDtIuX4OwwT

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Release Auto Deploy (Branch: `release`)

This repository deploys automatically when code is pushed to the `release` branch.

- Release process doc: `RELEASE.md`
- Workflow file: `.github/workflows/deploy-release.yml`
- Server path: `/var/www/sail`
- Nginx service port: `8091`
- Active release symlink: `/var/www/sail/current`

### Required GitHub Secrets

- `SAIL_HOST` (example: `129.226.191.81`)
- `SAIL_USER` (example: `ubuntu`)
- `SAIL_SSH_PRIVATE_KEY` (private key content for SSH login)
- `VITE_SSO_ENABLED`
- `VITE_SSO_CLIENT_ID`
- `VITE_SSO_AUTHORIZE_URL`
- `VITE_SSO_TOKEN_URL`

## Kylith SSO

This app supports OIDC Authorization Code + PKCE for Kylith SSO.

### Required runtime env vars

- `VITE_SSO_ENABLED=true`
- `VITE_SSO_CLIENT_ID=<kylith_client_id>`
- `VITE_SSO_AUTHORIZE_URL=https://<kylith-sso>/oauth2/authorize`
- `VITE_SSO_TOKEN_URL=https://<kylith-sso>/oauth2/token`

### Optional runtime env vars

- `VITE_SSO_SCOPE=openid profile email`
- `VITE_SSO_REDIRECT_URI=https://sail.beforeve.com/auth/callback`
- `VITE_SSO_USERINFO_URL=https://<kylith-sso>/oauth2/userinfo`
- `VITE_SSO_LOGOUT_URL=https://<kylith-sso>/oauth2/logout`

If `VITE_SSO_ENABLED=false`, app login is bypassed.
