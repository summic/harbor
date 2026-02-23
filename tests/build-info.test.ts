import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('build-info', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.APP_VERSION;
    delete process.env.BUILD_TIME;
  });

  it('exposes build metadata with stable shape', async () => {
    process.env.BUILD_TIME = '2026-02-23T10:00:00.000Z';

    const { buildInfo } = await import('../utils/build-info');
    expect(typeof buildInfo.appVersion).toBe('string');
    expect(buildInfo.appVersion.length).toBeGreaterThan(0);
    expect(buildInfo.buildTimeText).not.toBe('--');
    expect(typeof buildInfo.gitSha).toBe('string');
    expect(buildInfo.gitSha.length).toBeGreaterThan(0);
  });

  it('always includes copyright info', async () => {
    const { buildInfo } = await import('../utils/build-info');
    expect(typeof buildInfo.copyrightText).toBe('string');
    expect(buildInfo.copyrightText.includes('Beforeve')).toBe(true);
  });
});
