import { afterEach, describe, expect, it } from 'vitest';
import { ApiRateLimiter } from '../dev-server/api-rate-limit';

describe('ApiRateLimiter', () => {
  const baseNow = 1_700_000_000_000;

  it('enforces per-key route quota inside window', () => {
    const limiter = new ApiRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    const first = limiter.check({ key: 'ip-a', route: '/api/v1/health', now: baseNow });
    const second = limiter.check({ key: 'ip-a', route: '/api/v1/health', now: baseNow + 1_000 });
    const third = limiter.check({ key: 'ip-a', route: '/api/v1/health', now: baseNow + 2_000 });

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('isolates different paths and identifiers', () => {
    const limiter = new ApiRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    const apiPath = limiter.check({ key: 'ip-a', route: '/api/v1/p1', now: baseNow });
    const secondPath = limiter.check({ key: 'ip-a', route: '/api/v1/p2', now: baseNow + 1 });
    const secondSamePath = limiter.check({ key: 'ip-a', route: '/api/v1/p1', now: baseNow + 2 });
    const secondIp = limiter.check({ key: 'ip-b', route: '/api/v1/p1', now: baseNow + 3 });

    expect(apiPath.allowed).toBe(true);
    expect(secondPath.allowed).toBe(true);
    expect(secondSamePath.allowed).toBe(false);
    expect(secondIp.allowed).toBe(true);
  });

  it('cleanup stale buckets', () => {
    const limiter = new ApiRateLimiter({ windowMs: 10_000, maxRequests: 3 });
    limiter.check({ key: 'ip-a', route: '/api/v1/p', now: baseNow });
    limiter.check({ key: 'ip-b', route: '/api/v1/p', now: baseNow });

    limiter.cleanup(baseNow + 10_001);
    const refreshed = limiter.check({ key: 'ip-a', route: '/api/v1/p', now: baseNow + 10_002 });

    expect(refreshed.remaining).toBe(2);
    expect(refreshed.allowed).toBe(true);
  });
});
