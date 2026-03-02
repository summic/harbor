# Sail Quality Monitoring (Console)

This page describes how the console-side quality observability view integrates backend data and applies standardization rules.

## API Endpoints

The console uses the following API to get 24h stability, top domains and failure reason distribution.

```
GET /api/quality/observability?window=24h&bucket=1h&topN=10
```

- `window`: time window, currently fixed to `24h`.
- `bucket`: sample granularity, currently fixed to `1h`.
- `topN`: TopN count, currently fixed to `10`. 

### Response shape (recommended)

```
{
  "window": "24h",
  "updatedAt": "2026-02-18T06:30:00Z",
  "stability": {
    "points": [
      {
        "timestamp": "2026-02-18T00:00:00Z",
        "total": 12000,
        "successRate": 99.2,
        "errorRate": 0.8,
        "p95LatencyMs": 180
      }
    ],
    "totalRequests": 288000,
    "avgSuccessRate": 99.1
  },
  "topDomains": [
    { "domain": "example.com", "count": 12000, "category": "allowed" }
  ],
  "failureReasons": [
    { "code": "DNS_TIMEOUT", "count": 40, "ratio": 0.18 }
  ]
}
```

## Failure reason standardization

The frontend normalizes failure reasons to standard codes:

- `DNS_TIMEOUT`: DNS query timeout
- `DNS_REFUSED`: DNS refused
- `TLS_HANDSHAKE`: TLS handshake failed
- `CONNECT_TIMEOUT`: connection timeout
- `CONNECTION_RESET`: connection reset
- `BLOCKED_POLICY`: policy blocked
- `AUTH_FAILED`: authentication failed
- `UPSTREAM_5XX`: upstream 5xx
- `UPSTREAM_4XX`: upstream 4xx
- `RATE_LIMITED`: rate limited
- `UNKNOWN`: other/unknown

The backend can return standard `code` directly. The frontend also auto-normalizes common aliases, for example:

- `dns_query_timeout` → `DNS_TIMEOUT`
- `policy_blocked` → `BLOCKED_POLICY`
- `too_many_requests` → `RATE_LIMITED`

## Compatibility policy

If backend returns wrapped data (such as `{ data: ... }`), the frontend automatically unwraps it.
Field name variations (like `top_domains`, `failure_reasons`) are handled by compatibility logic.
Numeric fields may return as strings (e.g. `"99.2"`, `"12000"`) and the frontend parses them automatically.

Local development variables:

- `VITE_API_BASE_URL`: Backend API base URL (defaults to empty, which means same-origin)
- `VITE_QUALITY_MOCK_FALLBACK`: Whether to fall back to built-in mock data on API errors (default is `true`, set to `false` to disable)
