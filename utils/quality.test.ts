import { describe, expect, it } from 'vitest';
import { normalizeObservabilityResponse, standardizeFailureReason } from './quality';

describe('standardizeFailureReason', () => {
  it('maps aliases to canonical codes', () => {
    const result = standardizeFailureReason('dns_query_timeout');
    expect(result.code).toBe('DNS_TIMEOUT');
  });

  it('normalizes separators and casing', () => {
    const result = standardizeFailureReason('Policy blocked');
    expect(result.code).toBe('BLOCKED_POLICY');
  });

  it('falls back to UNKNOWN for unmapped codes', () => {
    const result = standardizeFailureReason('mystery_error');
    expect(result.code).toBe('UNKNOWN');
  });
});

describe('normalizeObservabilityResponse', () => {
  it('normalizes wrapped payloads with alternative field names', () => {
    const payload = {
      data: {
        window: '24h',
        updated_at: '2026-02-18T00:00:00Z',
        stability: {
          series: [
            {
              ts: '2026-02-18T00:00:00Z',
              count: 120,
              success_rate: 98.5,
            },
          ],
          total_requests: 120,
        },
        top_domains: [{ host: 'example.com', hits: 90 }],
        failure_reasons: [{ reason: 'policy_blocked', total: 4, share: 0.2 }],
      },
    };

    const result = normalizeObservabilityResponse(payload);

    expect(result.window).toBe('24h');
    expect(result.updatedAt).toBe('2026-02-18T00:00:00Z');
    expect(result.stability.points).toHaveLength(1);
    expect(result.stability.points[0].successRate).toBe(98.5);
    expect(result.stability.totalRequests).toBe(120);
    expect(result.topDomains[0].domain).toBe('example.com');
    expect(result.failureReasons[0].code).toBe('policy_blocked');
    expect(result.failureReasons[0].ratio).toBe(0.2);
  });

  it('supports alternate root keys and filters empty entries', () => {
    const payload = {
      window: '24h',
      updatedAt: '2026-02-18T01:00:00Z',
      stability_view: {
        samples: [
          { time: '2026-02-18T01:00:00Z', requests: 50, ok_rate: 99.9 },
          { time: '', requests: 10, ok_rate: 50 },
        ],
      },
      key_domains: [
        { name: 'alpha.test', requests: 10 },
        { name: '', requests: 5 },
      ],
      failures: [
        { type: 'dns_timeout', total: 2 },
        { type: '', total: 1 },
      ],
    };

    const result = normalizeObservabilityResponse(payload);

    expect(result.stability.points).toHaveLength(1);
    expect(result.stability.points[0].total).toBe(50);
    expect(result.topDomains).toHaveLength(1);
    expect(result.topDomains[0].domain).toBe('alpha.test');
    expect(result.failureReasons).toHaveLength(1);
    expect(result.failureReasons[0].code).toBe('dns_timeout');
  });

  it('parses numeric strings for counts and ratios', () => {
    const payload = {
      window: '24h',
      updatedAt: '2026-02-18T02:00:00Z',
      stability: {
        points: [
          { timestamp: '2026-02-18T02:00:00Z', total: '12000', successRate: '99.2', errorRate: '0.8', p95LatencyMs: '180' },
        ],
        totalRequests: '12000',
        avgSuccessRate: '99.2',
      },
      topDomains: [{ domain: 'string.test', count: '900' }],
      failureReasons: [{ code: 'DNS_TIMEOUT', count: '4', ratio: '0.2' }],
    };

    const result = normalizeObservabilityResponse(payload);

    expect(result.stability.points[0].total).toBe(12000);
    expect(result.stability.points[0].successRate).toBe(99.2);
    expect(result.stability.points[0].errorRate).toBe(0.8);
    expect(result.stability.points[0].p95LatencyMs).toBe(180);
    expect(result.stability.totalRequests).toBe(12000);
    expect(result.stability.avgSuccessRate).toBe(99.2);
    expect(result.topDomains[0].count).toBe(900);
    expect(result.failureReasons[0].count).toBe(4);
    expect(result.failureReasons[0].ratio).toBe(0.2);
  });
});
