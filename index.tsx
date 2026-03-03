
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import { buildInfo } from './utils/build-info';

const SENTRY_DSN =
  'https://6cbe59d5a88a861d7b9e439e456d4080@o4504033821982720.ingest.us.sentry.io/4508000005193728';
const SHOULD_REPORT_TO_SENTRY =
  import.meta.env.PROD ||
  String(import.meta.env.VITE_SENTRY_ENABLED).toLowerCase() === 'true' ||
  String(import.meta.env.VITE_ENABLE_SENTRY).toLowerCase() === 'true' ||
  String(import.meta.env.VITE_RUNTIME_ENV).toLowerCase() === 'arctic';

if (SHOULD_REPORT_TO_SENTRY && SENTRY_DSN) {
  const environment =
    (typeof import.meta.env.VITE_RUNTIME_ENV === 'string' && import.meta.env.VITE_RUNTIME_ENV.trim()) ||
    (import.meta.env.PROD ? 'production' : 'staging');
  Sentry.init({
    dsn: SENTRY_DSN,
    release: `harbor@${buildInfo.appVersion}`,
    environment,
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<div>Something went wrong.</div>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
