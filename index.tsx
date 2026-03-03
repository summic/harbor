
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';

const SENTRY_DSN =
  'https://6cbe59d5a88a861d7b9e439e456d4080@o4504033821982720.ingest.us.sentry.io/4508000005193728';

if (import.meta.env.PROD) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: 'production',
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
