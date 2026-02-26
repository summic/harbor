import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigStore } from '../dev-server/config-store';

type TestStore = ConfigStore & {
  db: {
    prepare: (sql: string) => {
      run: (...args: unknown[]) => void;
      get: (...args: unknown[]) => unknown;
      all: (...args: unknown[]) => unknown[];
    };
  };
  replaceScopedProfile: (scope: 'global' | 'user', userId: string | null, profile: Record<string, unknown>, timestamp: string) => void;
};

const createStore = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-config-store-'));
  const dbPath = path.join(root, 'config.db');
  const legacyPath = path.join(root, 'legacy-profile.json');
  const store = new ConfigStore({
    dbPath,
    legacyProfilePath: legacyPath,
    seedProfile: {
      log: { disabled: false, level: 'info' },
      inbounds: [],
      outbounds: [
        {
          type: 'direct',
          tag: 'direct',
        },
      ],
      dns: {
        final: 'dns_direct',
        servers: [],
        rules: [],
      },
      route: {
        final: 'direct',
      },
    },
  }) as TestStore;

  return {
    root,
    store,
  };
};

const makeValidProfile = () => ({
  log: { disabled: false, level: 'info' },
  inbounds: [],
  outbounds: [
    {
      type: 'direct',
      tag: 'direct',
    },
    {
      type: 'direct',
      tag: 'direct-2',
    },
  ],
  dns: {
    final: 'dns_direct',
    servers: [],
    rules: [],
  },
  route: {
    final: 'direct',
    rules: [],
  },
});

describe('ConfigStore persistence hardening', () => {
  const fixtures = new Set<string>();

  afterEach(() => {
    fixtures.forEach((root) => {
      if (fs.existsSync(root)) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
    fixtures.clear();
  });

  it('uses UTC ISO timestamps for profile lifecycle fields', () => {
    const { store, root } = createStore();
    fixtures.add(root);

    const result = store.saveUnifiedProfile(JSON.stringify(makeValidProfile()));

    expect(result.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(typeof result.size).toBe('string');
  });

  it('ignores malformed row payload without breaking compile path', () => {
    const { store, root } = createStore();
    fixtures.add(root);

    store.saveUnifiedProfile(JSON.stringify(makeValidProfile()));
    store.db.prepare(`INSERT INTO rule_entries(scope, user_id, module, payload_json, priority, enabled) VALUES(?, ?, ?, ?, ?, ?)`).run(
      'global',
      null,
      'meta.log',
      '{broken-json',
      999,
      1,
    );

    const compiled = store.getUnifiedProfile('http://localhost');
    expect(compiled.content).toContain('"log":');
    expect(() => JSON.parse(compiled.content)).not.toThrow();
  });

  it('keeps old global rows when replacement fails halfway', () => {
    const { store, root } = createStore();
    fixtures.add(root);

    const goodProfile = makeValidProfile();
    store.saveUnifiedProfile(JSON.stringify(goodProfile));
    const beforeOutbounds = store.listRules('global', 'outbounds');
    expect(beforeOutbounds.length).toBeGreaterThan(0);

    const badRow = {};
    Object.defineProperty(badRow, 'type', {
      enumerable: true,
      get: () => {
        throw new Error('serialize_fail');
      },
    });

    const brokenProfile = {
      log: { disabled: false, level: 'info' },
      inbounds: [],
      outbounds: [
        { type: 'direct', tag: 'direct-before' },
        badRow as Record<string, unknown>,
      ],
      dns: {
        final: 'dns_direct',
        servers: [],
        rules: [],
      },
      route: {
        final: 'direct',
        rules: [],
      },
    };

    expect(() => {
      store.replaceScopedProfile('global', null, brokenProfile, new Date().toISOString());
    }).toThrow();

    const afterOutbounds = store.listRules('global', 'outbounds');
    expect(afterOutbounds.length).toBe(beforeOutbounds.length);
    expect(afterOutbounds[0]?.payload).toMatchObject({ tag: 'direct' });
  });

  it('rejects invalid global profile structure before writing', () => {
    const { store, root } = createStore();
    fixtures.add(root);

    expect(() => store.saveUnifiedProfile('not-json')).toThrow();
    expect(() => store.saveUnifiedProfile('[]')).toThrow('invalid_profile_root');
    expect(() => store.saveUnifiedProfile('{\"log\": \"invalid\"}')).toThrow('invalid_profile_log');
    expect(() => store.saveUnifiedProfile('{\"outbounds\": {\"tag\":1}}')).toThrow('invalid_profile_outbounds');
    expect(() => store.saveUnifiedProfile('{\"dns\":{\"servers\":\"bad\"}}')).toThrow('invalid_profile_dns_servers');
    expect(() => store.saveUnifiedProfile('{\"route\":{\"rules\":\"bad\"}}')).toThrow('invalid_profile_route_rules');
  });
});
