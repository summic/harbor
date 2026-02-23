export type ApiRateLimitInput = {
  key: string;
  route: string;
  now?: number;
};

export type ApiRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds?: number;
};

type ApiRateBucket = {
  windowStart: number;
  count: number;
};

type ApiRateOptions = {
  windowMs?: number;
  maxRequests?: number;
};

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 300;

const normalizeRateValue = (value: number | undefined, fallback: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.round(value);
};

export class ApiRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly buckets = new Map<string, ApiRateBucket>();

  constructor(options: ApiRateOptions = {}) {
    this.windowMs = normalizeRateValue(options.windowMs, DEFAULT_WINDOW_MS);
    this.maxRequests = normalizeRateValue(options.maxRequests, DEFAULT_MAX_REQUESTS);
  }

  private getBucketKey(input: ApiRateLimitInput) {
    return `${input.key}:${input.route}`;
  }

  check(input: ApiRateLimitInput): ApiRateLimitResult {
    const now = input.now ?? Date.now();
    const bucketKey = this.getBucketKey(input);
    const bucket = this.buckets.get(bucketKey);
    const windowStart = now - this.windowMs;

    if (!bucket || bucket.windowStart <= windowStart) {
      this.buckets.set(bucketKey, { windowStart: now, count: 1 });
      return {
        allowed: true,
        limit: this.maxRequests,
        remaining: this.maxRequests - 1,
        resetAt: now + this.windowMs,
      };
    }

    if (bucket.count >= this.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.windowStart + this.windowMs - now) / 1000));
      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetAt: bucket.windowStart + this.windowMs,
        retryAfterSeconds,
      };
    }

    bucket.count += 1;
    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - bucket.count),
      resetAt: bucket.windowStart + this.windowMs,
    };
  }

  setBucket(bucket: ApiRateLimitInput, payload: ApiRateLimitResult) {
    const key = this.getBucketKey(bucket);
    this.buckets.set(key, { windowStart: payload.resetAt - this.windowMs, count: this.maxRequests - payload.remaining });
  }

  cleanup(now = Date.now()) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.windowStart + this.windowMs <= now) {
        this.buckets.delete(key);
      }
    }
  }
}

export const createDefaultRateLimiter = () =>
  new ApiRateLimiter({
    windowMs: normalizeRateValue(Number(process.env.SAIL_RATE_LIMIT_WINDOW_MS), DEFAULT_WINDOW_MS),
    maxRequests: normalizeRateValue(Number(process.env.SAIL_RATE_LIMIT_MAX_REQUESTS), DEFAULT_MAX_REQUESTS),
  });
