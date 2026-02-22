import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

type CompatibleDb = {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    run: (...args: any[]) => any;
    get: (...args: any[]) => any;
    all: (...args: any[]) => any[];
  };
};

const createDatabase = (dbPath: string): CompatibleDb => {
  try {
    const sqlite = require('node:sqlite') as { DatabaseSync: new (path: string) => CompatibleDb };
    return new sqlite.DatabaseSync(dbPath);
  } catch {
    const BetterSqlite = require('better-sqlite3') as new (path: string) => CompatibleDb;
    return new BetterSqlite(dbPath);
  }
};

export const DEFAULT_SUBSCRIPTION_TOKEN = 'u1-alice-7f8a9d2b';
const DEFAULT_USER_ID = 'u1';

type JsonObject = Record<string, any>;

type RuleRow = {
  id: number;
  scope: 'global' | 'user';
  user_id: string | null;
  module: string;
  rule_key: string | null;
  priority: number;
  enabled: number;
  payload_json: string;
};

type StoredProfile = {
  profile: Record<string, unknown>;
  token: string;
  lastUpdated: string;
};

export type UnifiedProfilePayload = {
  content: string;
  publicUrl: string;
  lastUpdated: string;
  size: string;
};

export type ConfigVersionItem = {
  id: string;
  version: string;
  timestamp: string;
  author: string;
  summary: string;
  content: string;
};

export type SimulationInput = {
  target: string;
  protocol?: string;
  port?: number;
};

type StoredUserRow = {
  id: string;
  username: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  status: 'active' | 'disabled' | 'expired';
  created_at: string;
  last_seen: string;
};

export type ClientDeviceReportInput = {
  occurredAt?: string;
  connected?: boolean;
  networkType?: string;
  device?: {
    id: string;
    name?: string;
    model?: string;
    osName?: string;
    osVersion?: string;
    appVersion?: string;
    ip?: string;
    location?: string;
  };
  metadata?: Record<string, unknown>;
};

export type ClientConnectionLogInput = {
  occurredAt?: string;
  connected?: boolean;
  target?: string;
  outboundType?: string;
  latencyMs?: number;
  error?: string;
  networkType?: string;
  requestCount?: number;
  successCount?: number;
  blockedCount?: number;
  uploadBytes?: number;
  downloadBytes?: number;
  device?: {
    id: string;
    name?: string;
    model?: string;
    osName?: string;
    osVersion?: string;
    appVersion?: string;
    ip?: string;
    location?: string;
  };
  metadata?: Record<string, unknown>;
};

export type UserProfileAuditItem = {
  id: number;
  timestamp: string;
  summary: string;
  contentSize: number;
};

export type UserTargetAggregateItem = {
  target: string;
  requests: number;
  uploadBytes: number;
  downloadBytes: number;
  blockedRequests: number;
  successRate: number;
  lastSeen: string;
};

export type UserTargetDetailItem = {
  target: string;
  requests: number;
  uploadBytes: number;
  downloadBytes: number;
  blockedRequests: number;
  successRate: number;
  lastSeen: string;
  outboundTypes: Array<{ type: string; count: number }>;
  recent: Array<{
    occurredAt: string;
    outboundType: string;
    networkType: string | null;
    requestCount: number;
    successCount: number;
    blockedCount: number;
    uploadBytes: number;
    downloadBytes: number;
    error: string | null;
  }>;
};

export type DashboardSummaryItem = {
  stats: {
    activeUsers: number;
    activeNodes: number;
    systemLoadPercent: number;
    configVersion: string;
  };
  traffic: {
    uploadSeries: number[];
    downloadSeries: number[];
  };
  devices: {
    series: number[];
  };
  syncRequests: {
    series: number[];
  };
  auditLogs: Array<{
    event: string;
    admin: string;
    time: string;
    target: string;
  }>;
};

export class ConfigStore {
  private db: CompatibleDb;
  private readonly storePath: string;
  private readonly dbPath: string;
  private readonly importProfilePath?: string;

  constructor(opts: {
    dbPath: string;
    legacyProfilePath: string;
    seedProfile: Record<string, unknown>;
    importProfilePath?: string;
  }) {
    this.storePath = opts.legacyProfilePath;
    this.dbPath = opts.dbPath;
    this.importProfilePath = opts.importProfilePath;
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = createDatabase(this.dbPath);
    this.initSchema();
    this.seedIfNeeded(opts.seedProfile);
    this.runMigrations();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS config_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rule_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL CHECK(scope IN ('global','user')),
        user_id TEXT,
        module TEXT NOT NULL,
        rule_key TEXT,
        priority INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        author TEXT NOT NULL,
        summary TEXT NOT NULL,
        content TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    this.ensureUsersSchema();
  }

  private ensureUsersSchema() {
    const columns = this.db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
    const names = new Set(columns.map((item) => item.name));
    const alter = (sql: string, name: string) => {
      if (!names.has(name)) this.db.exec(sql);
    };
    alter(`ALTER TABLE users ADD COLUMN display_name TEXT`, 'display_name');
    alter(`ALTER TABLE users ADD COLUMN email TEXT`, 'email');
    alter(`ALTER TABLE users ADD COLUMN avatar_url TEXT`, 'avatar_url');
    alter(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`, 'status');
    alter(`ALTER TABLE users ADD COLUMN created_at TEXT`, 'created_at');
    alter(`ALTER TABLE users ADD COLUMN last_seen TEXT`, 'last_seen');
    const now = new Date().toLocaleString();
    this.db.prepare(`UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''`).run();
    this.db.prepare(`UPDATE users SET created_at = ? WHERE created_at IS NULL OR created_at = ''`).run(now);
    this.db.prepare(`UPDATE users SET last_seen = ? WHERE last_seen IS NULL OR last_seen = ''`).run(now);
  }

  private isMigrationApplied(id: string): boolean {
    const row = this.db.prepare(`SELECT id FROM schema_migrations WHERE id = ?`).get(id) as { id: string } | undefined;
    return !!row;
  }

  private markMigrationApplied(id: string) {
    this.db.prepare(`INSERT OR IGNORE INTO schema_migrations(id) VALUES(?)`).run(id);
  }

  private runMigrations() {
    this.migrateClientConnectTelemetryV1();
    this.migrateClientConnectTelemetryV2();
    this.migrateUserProfileAuditsV1();
    this.migrateApiRequestLogsV1();
    this.migrateImportSingboxConfigFromFile();
  }

  private migrateClientConnectTelemetryV1() {
    const migrationId = '20260220_client_connect_telemetry_v1';
    if (this.isMigrationApplied(migrationId)) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS client_devices (
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        device_name TEXT,
        device_model TEXT,
        os_name TEXT,
        os_version TEXT,
        app_version TEXT,
        ip TEXT,
        network_type TEXT,
        location TEXT,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        last_connected_at TEXT,
        extra_json TEXT,
        PRIMARY KEY (user_id, device_id)
      );
      CREATE TABLE IF NOT EXISTS client_connect_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        device_id TEXT,
        connected INTEGER NOT NULL DEFAULT 0,
        target TEXT,
        outbound_type TEXT,
        latency_ms INTEGER,
        error_message TEXT,
        network_type TEXT,
        ip TEXT,
        request_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        blocked_count INTEGER NOT NULL DEFAULT 0,
        upload_bytes INTEGER NOT NULL DEFAULT 0,
        download_bytes INTEGER NOT NULL DEFAULT 0,
        occurred_at TEXT NOT NULL,
        metadata_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_client_connect_logs_user_time
        ON client_connect_logs(user_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS idx_client_connect_logs_user_target
        ON client_connect_logs(user_id, target);
      CREATE INDEX IF NOT EXISTS idx_client_devices_user_last_seen
        ON client_devices(user_id, last_seen DESC);
    `);
    this.markMigrationApplied(migrationId);
  }

  private migrateClientConnectTelemetryV2() {
    const migrationId = '20260220_client_connect_telemetry_v2_outbound_type';
    if (this.isMigrationApplied(migrationId)) return;
    const columns = this.db.prepare(`PRAGMA table_info(client_connect_logs)`).all() as Array<{ name: string }>;
    const names = new Set(columns.map((item) => item.name));
    if (!names.has('outbound_type')) {
      this.db.exec(`ALTER TABLE client_connect_logs ADD COLUMN outbound_type TEXT`);
    }
    this.markMigrationApplied(migrationId);
  }

  private migrateUserProfileAuditsV1() {
    const migrationId = '20260222_user_profile_audits_v1';
    if (this.isMigrationApplied(migrationId)) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_profile_audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        summary TEXT NOT NULL,
        content_size INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_user_profile_audits_user_time
        ON user_profile_audits(user_id, id DESC);
    `);
    this.markMigrationApplied(migrationId);
  }

  private migrateApiRequestLogsV1() {
    const migrationId = '20260223_api_request_logs_v1';
    if (this.isMigrationApplied(migrationId)) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        user_id TEXT,
        ip TEXT,
        user_agent TEXT,
        occurred_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_api_request_logs_path_time
        ON api_request_logs(path, occurred_at DESC);
    `);
    this.markMigrationApplied(migrationId);
  }

  private migrateImportSingboxConfigFromFile() {
    const migrationId = '20260219_import_singbox_config_json';
    if (this.isMigrationApplied(migrationId)) return;
    if (!this.importProfilePath || !fs.existsSync(this.importProfilePath)) return;

    try {
      const raw = fs.readFileSync(this.importProfilePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return;

      const timestamp = new Date().toLocaleString();
      this.replaceGlobalProfile(parsed, timestamp);
      this.appendRevision(
        `Migration import from ${path.basename(this.importProfilePath)}`,
        'migration',
        parsed,
        timestamp,
      );
      this.setState('last_updated', timestamp);
      this.markMigrationApplied(migrationId);
    } catch (error) {
      console.warn('[config-store] migration failed:', migrationId, error);
    }
  }

  private setState(key: string, value: string) {
    this.db
      .prepare(`INSERT INTO config_state(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .run(key, value);
  }

  private getState(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM config_state WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private readLegacyProfile(seedProfile: Record<string, unknown>): StoredProfile {
    if (!fs.existsSync(this.storePath)) {
      return {
        profile: seedProfile,
        token: DEFAULT_SUBSCRIPTION_TOKEN,
        lastUpdated: new Date().toLocaleString(),
      };
    }
    try {
      const raw = fs.readFileSync(this.storePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StoredProfile> & { content?: string };
      if (parsed.profile && typeof parsed.profile === 'object') {
        return {
          profile: parsed.profile as Record<string, unknown>,
          token: parsed.token || DEFAULT_SUBSCRIPTION_TOKEN,
          lastUpdated: parsed.lastUpdated || new Date().toLocaleString(),
        };
      }
      if (typeof parsed.content === 'string') {
        return {
          profile: JSON.parse(parsed.content) as Record<string, unknown>,
          token: parsed.token || DEFAULT_SUBSCRIPTION_TOKEN,
          lastUpdated: parsed.lastUpdated || new Date().toLocaleString(),
        };
      }
    } catch {
      // fall through
    }
    return {
      profile: seedProfile,
      token: DEFAULT_SUBSCRIPTION_TOKEN,
      lastUpdated: new Date().toLocaleString(),
    };
  }

  private seedIfNeeded(seedProfile: Record<string, unknown>) {
    const seeded = this.getState('seeded_v1');
    if (seeded === '1') return;

    const ts = new Date().toLocaleString();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO users(id, username, display_name, email, status, created_at, last_seen)
         VALUES(?, ?, ?, ?, 'active', ?, ?)`,
      )
      .run(DEFAULT_USER_ID, 'alice', 'Alice', 'alice@example.com', ts, ts);
    const legacy = this.readLegacyProfile(seedProfile);
    this.replaceGlobalProfile(legacy.profile, legacy.lastUpdated);
    if (this.listVersions().length === 0) {
      this.appendRevision('Initial profile import', 'system', legacy.profile, legacy.lastUpdated);
    }
    this.setState('subscription_token', legacy.token || DEFAULT_SUBSCRIPTION_TOKEN);
    this.setState('last_updated', legacy.lastUpdated || new Date().toLocaleString());
    this.setState('seeded_v1', '1');
  }

  private nextVersionLabel(): string {
    const raw = this.getState('revision_counter');
    const current = raw ? Number(raw) : 0;
    const next = Number.isFinite(current) ? current + 1 : 1;
    this.setState('revision_counter', String(next));
    return `v1.0.${next}`;
  }

  private appendRevision(
    summary: string,
    author: string,
    profile?: Record<string, unknown>,
    timestamp?: string,
  ): ConfigVersionItem {
    const currentProfile = profile ?? this.compileProfile(DEFAULT_USER_ID);
    const version = this.nextVersionLabel();
    const ts = timestamp ?? new Date().toLocaleString();
    const content = JSON.stringify(currentProfile, null, 2);
    this.db
      .prepare(`INSERT INTO revisions(version, timestamp, author, summary, content) VALUES(?, ?, ?, ?, ?)`)
      .run(version, ts, author, summary, content);
    const row = this.db.prepare(`SELECT id FROM revisions ORDER BY id DESC LIMIT 1`).get() as { id: number };
    return {
      id: `v${row.id}`,
      version,
      timestamp: ts,
      author,
      summary,
      content,
    };
  }

  private insertRule(scope: 'global' | 'user', userId: string | null, module: string, payload: unknown, priority: number, ruleKey?: string | null) {
    this.db
      .prepare(
        `INSERT INTO rule_entries(scope, user_id, module, rule_key, priority, enabled, payload_json)
         VALUES(?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(scope, userId, module, ruleKey ?? null, priority, JSON.stringify(payload));
  }

  private replaceScopedProfile(
    scope: 'global' | 'user',
    userId: string | null,
    profile: Record<string, unknown>,
    timestamp: string,
  ) {
    if (scope == 'global') {
      this.db.prepare(`DELETE FROM rule_entries WHERE scope = 'global'`).run();
    } else {
      this.db.prepare(`DELETE FROM rule_entries WHERE scope = 'user' AND user_id = ?`).run(userId);
    }

    const p = profile as JsonObject;
    const dns = (p.dns ?? {}) as JsonObject;
    const route = (p.route ?? {}) as JsonObject;
    let priority = 0;

    this.insertRule(scope, userId, 'meta.log', p.log ?? {}, priority++);
    this.insertRule(scope, userId, 'meta.ntp', p.ntp ?? {}, priority++);
    this.insertRule(scope, userId, 'meta.dns', {
      final: dns.final ?? 'dns_direct',
      independent_cache: dns.independent_cache ?? false,
      strategy: dns.strategy ?? 'prefer_ipv4',
    }, priority++);
    this.insertRule(scope, userId, 'meta.route', {
      auto_detect_interface: route.auto_detect_interface ?? false,
      final: route.final ?? 'direct',
      default_domain_resolver: route.default_domain_resolver,
    }, priority++);

    const arrayModules: Array<{ module: string; data: unknown[]; tagKey?: string }> = [
      { module: 'inbounds', data: Array.isArray(p.inbounds) ? p.inbounds : [], tagKey: 'tag' },
      { module: 'outbounds', data: Array.isArray(p.outbounds) ? p.outbounds : [], tagKey: 'tag' },
      { module: 'dns.servers', data: Array.isArray(dns.servers) ? dns.servers : [], tagKey: 'tag' },
      { module: 'dns.rules', data: Array.isArray(dns.rules) ? dns.rules : [] },
      { module: 'route.rule_set', data: Array.isArray(route.rule_set) ? route.rule_set : [], tagKey: 'tag' },
      { module: 'route.rules', data: Array.isArray(route.rules) ? route.rules : [] },
    ];

    for (const item of arrayModules) {
      for (const row of item.data) {
        const asObject = (row ?? {}) as JsonObject;
        const key = item.tagKey && typeof asObject[item.tagKey] === 'string' ? String(asObject[item.tagKey]) : null;
        this.insertRule(scope, userId, item.module, row, priority++, key);
      }
    }
  }

  private replaceGlobalProfile(profile: Record<string, unknown>, timestamp: string) {
    this.replaceScopedProfile('global', null, profile, timestamp);
    this.setState('last_updated', timestamp);
    this.persistLegacySnapshot(timestamp);
  }

  private replaceUserProfile(userId: string, profile: Record<string, unknown>, timestamp: string) {
    this.replaceScopedProfile('user', userId, profile, timestamp);
    this.setState('last_updated', timestamp);
    this.persistLegacySnapshot(timestamp);
  }

  private listCompiledRows(userId: string): RuleRow[] {
    return this.db
      .prepare(
        `SELECT id, scope, user_id, module, rule_key, priority, enabled, payload_json
         FROM rule_entries
         WHERE enabled = 1 AND (scope = 'global' OR (scope = 'user' AND user_id = ?))
         ORDER BY CASE scope WHEN 'global' THEN 0 ELSE 1 END, priority ASC, id ASC`,
      )
      .all(userId) as RuleRow[];
  }

  private listScopedRows(scope: 'global' | 'user', userId?: string): RuleRow[] {
    if (scope === 'global') {
      return this.db
        .prepare(
          `SELECT id, scope, user_id, module, rule_key, priority, enabled, payload_json
           FROM rule_entries
           WHERE enabled = 1 AND scope = 'global'
           ORDER BY priority ASC, id ASC`,
        )
        .all() as RuleRow[];
    }
    return this.db
      .prepare(
        `SELECT id, scope, user_id, module, rule_key, priority, enabled, payload_json
         FROM rule_entries
         WHERE enabled = 1 AND scope = 'user' AND user_id = ?
         ORDER BY priority ASC, id ASC`,
      )
      .all(userId || DEFAULT_USER_ID) as RuleRow[];
  }

  private parseRowPayload(row: RuleRow): JsonObject {
    return JSON.parse(row.payload_json) as JsonObject;
  }

  private mergeByTag(rows: RuleRow[]): JsonObject[] {
    const map = new Map<string, JsonObject>();
    const list: JsonObject[] = [];
    for (const row of rows) {
      const payload = this.parseRowPayload(row);
      if (row.rule_key) {
        map.set(row.rule_key, payload);
      } else {
        list.push(payload);
      }
    }
    return [...map.values(), ...list];
  }

  private compileProfileFromRows(rows: RuleRow[]): Record<string, unknown> {
    const byModule = new Map<string, RuleRow[]>();
    for (const row of rows) {
      const group = byModule.get(row.module) ?? [];
      group.push(row);
      byModule.set(row.module, group);
    }

    const getMeta = (module: string): JsonObject => {
      const items = byModule.get(module) ?? [];
      return items.reduce<JsonObject>((acc, row) => ({ ...acc, ...this.parseRowPayload(row) }), {});
    };

    const profile: JsonObject = {};
    profile.log = getMeta('meta.log');
    profile.ntp = getMeta('meta.ntp');
    profile.inbounds = this.mergeByTag(byModule.get('inbounds') ?? []);
    profile.outbounds = this.mergeByTag(byModule.get('outbounds') ?? []);
    profile.dns = {
      ...getMeta('meta.dns'),
      servers: this.mergeByTag(byModule.get('dns.servers') ?? []),
      rules: (byModule.get('dns.rules') ?? []).map((row) => this.parseRowPayload(row)),
    };
    profile.route = {
      ...getMeta('meta.route'),
      rule_set: this.mergeByTag(byModule.get('route.rule_set') ?? []),
      rules: (byModule.get('route.rules') ?? []).map((row) => this.parseRowPayload(row)),
    };

    return profile;
  }

  compileProfile(userId: string = DEFAULT_USER_ID): Record<string, unknown> {
    return this.compileProfileFromRows(this.listCompiledRows(userId));
  }

  compileScopedProfile(scope: 'global' | 'user', userId?: string): Record<string, unknown> {
    return this.compileProfileFromRows(this.listScopedRows(scope, userId));
  }

  private persistLegacySnapshot(lastUpdated: string) {
    const profile = this.compileProfile(DEFAULT_USER_ID);
    const token = this.getState('subscription_token') || DEFAULT_SUBSCRIPTION_TOKEN;
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(
      this.storePath,
      JSON.stringify({ profile, token, lastUpdated }, null, 2),
      'utf-8',
    );
  }

  private getToken() {
    return this.getState('subscription_token') || DEFAULT_SUBSCRIPTION_TOKEN;
  }

  getUnifiedProfile(
    origin: string,
    userId: string = DEFAULT_USER_ID,
    scope: 'effective' | 'global' | 'user' = 'effective',
  ): UnifiedProfilePayload {
    const profile =
      scope === 'global'
        ? this.compileScopedProfile('global')
        : scope === 'user'
          ? this.compileScopedProfile('user', userId)
          : this.compileProfile(userId);
    const content = JSON.stringify(profile, null, 2);
    const lastUpdated = this.getState('last_updated') || new Date().toLocaleString();
    return {
      content,
      publicUrl: `${origin}/api/v1/client/subscribe`,
      lastUpdated,
      size: `${(Buffer.byteLength(JSON.stringify(profile), 'utf8') / 1024).toFixed(1)} KB`,
    };
  }

  saveUnifiedProfile(content: string, publicUrl?: string): UnifiedProfilePayload {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const lastUpdated = new Date().toLocaleString();
    this.replaceGlobalProfile(parsed, lastUpdated);
    this.appendRevision('Update global profile', 'console', parsed, lastUpdated);
    if (publicUrl) {
      try {
        const token = new URL(publicUrl).searchParams.get('token');
        if (token) this.setState('subscription_token', token);
      } catch {
        // ignore invalid URL
      }
    }
    this.setState('last_updated', lastUpdated);
    return this.getUnifiedProfile('http://localhost');
  }

  getSubscriptionProfile(token: string): Record<string, unknown> | null {
    if (token !== this.getToken()) return null;
    return this.compileProfile(DEFAULT_USER_ID);
  }

  getSubscriptionProfileByUser(userId: string): Record<string, unknown> {
    return this.compileProfile(userId);
  }

  private appendUserProfileAudit(userId: string, summary: string, contentSize: number, timestamp: string) {
    this.db
      .prepare(
        `INSERT INTO user_profile_audits(user_id, timestamp, summary, content_size)
         VALUES(?, ?, ?, ?)`,
      )
      .run(userId, timestamp, summary, contentSize);
  }

  saveUserUnifiedProfile(userIdRaw: string, content: string): UnifiedProfilePayload {
    const userId = userIdRaw.trim();
    if (!userId) {
      throw new Error('missing_user_id');
    }
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const lastUpdated = new Date().toLocaleString();
    this.replaceUserProfile(userId, parsed, lastUpdated);
    this.setState('last_updated', lastUpdated);
    this.appendUserProfileAudit(
      userId,
      'Updated personal profile',
      Buffer.byteLength(JSON.stringify(parsed), 'utf8'),
      lastUpdated,
    );
    return this.getUnifiedProfile('http://localhost', userId, 'user');
  }

  listUserProfileAudits(userIdRaw: string, limitRaw = 20): UserProfileAuditItem[] {
    const userId = userIdRaw.trim();
    if (!userId) throw new Error('missing_user_id');
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 20;
    const rows = this.db
      .prepare(
        `SELECT id, timestamp, summary, content_size
         FROM user_profile_audits
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(userId, limit) as Array<{
      id: number;
      timestamp: string;
      summary: string;
      content_size: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      summary: row.summary,
      contentSize: Number(row.content_size || 0),
    }));
  }

  listVersions(limit = 30): ConfigVersionItem[] {
    const rows = this.db
      .prepare(`SELECT id, version, timestamp, author, summary, content FROM revisions ORDER BY id DESC LIMIT ?`)
      .all(limit) as Array<{
      id: number;
      version: string;
      timestamp: string;
      author: string;
      summary: string;
      content: string;
    }>;
    return rows.map((row) => ({
      id: `v${row.id}`,
      version: row.version,
      timestamp: row.timestamp,
      author: row.author,
      summary: row.summary,
      content: row.content,
    }));
  }

  publishCurrentProfile(summary?: string, author?: string): ConfigVersionItem {
    return this.appendRevision(
      summary?.trim() || 'Publish current profile',
      author?.trim() || 'console',
      this.compileProfile(DEFAULT_USER_ID),
      new Date().toLocaleString(),
    );
  }

  rollbackVersion(versionId: string): UnifiedProfilePayload {
    const numericId = Number(versionId.replace(/^v/, ''));
    if (!Number.isFinite(numericId)) {
      throw new Error('invalid version id');
    }
    const row = this.db
      .prepare(`SELECT content, version FROM revisions WHERE id = ?`)
      .get(numericId) as { content: string; version: string } | undefined;
    if (!row) {
      throw new Error('version not found');
    }
    const parsed = JSON.parse(row.content) as Record<string, unknown>;
    const lastUpdated = new Date().toLocaleString();
    this.replaceGlobalProfile(parsed, lastUpdated);
    this.appendRevision(`Rollback to ${row.version}`, 'console', parsed, lastUpdated);
    this.setState('last_updated', lastUpdated);
    return this.getUnifiedProfile('http://localhost');
  }

  listRules(scope?: 'global' | 'user', module?: string, userId?: string) {
    const where: string[] = [];
    const args: Array<string> = [];
    if (scope) {
      where.push(`scope = ?`);
      args.push(scope);
    }
    if (module) {
      where.push(`module = ?`);
      args.push(module);
    }
    if (scope === 'user') {
      where.push(`user_id = ?`);
      args.push(userId || DEFAULT_USER_ID);
    }
    const query = `
      SELECT id, scope, user_id, module, rule_key, priority, enabled, payload_json
      FROM rule_entries
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY scope, priority, id
    `;
    return (this.db.prepare(query).all(...args) as RuleRow[]).map((row) => ({
      id: row.id,
      scope: row.scope,
      user_id: row.user_id,
      module: row.module,
      rule_key: row.rule_key,
      priority: row.priority,
      enabled: !!row.enabled,
      payload: this.parseRowPayload(row),
    }));
  }

  saveRule(input: {
    id?: number;
    scope: 'global' | 'user';
    module: string;
    payload: Record<string, unknown>;
    user_id?: string;
    rule_key?: string;
    priority?: number;
    enabled?: boolean;
  }) {
    const userId = input.scope === 'user' ? (input.user_id || DEFAULT_USER_ID) : null;
    const payload = JSON.stringify(input.payload);
    const priority = Number.isFinite(input.priority) ? Number(input.priority) : 1000;
    const enabled = input.enabled === false ? 0 : 1;
    if (input.id) {
      this.db
        .prepare(
          `UPDATE rule_entries
           SET scope=?, user_id=?, module=?, rule_key=?, priority=?, enabled=?, payload_json=?, updated_at=CURRENT_TIMESTAMP
           WHERE id=?`,
        )
        .run(input.scope, userId, input.module, input.rule_key ?? null, priority, enabled, payload, input.id);
    } else {
      this.db
        .prepare(
          `INSERT INTO rule_entries(scope, user_id, module, rule_key, priority, enabled, payload_json)
           VALUES(?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(input.scope, userId, input.module, input.rule_key ?? null, priority, enabled, payload);
    }
    const lastUpdated = new Date().toLocaleString();
    this.setState('last_updated', lastUpdated);
    this.persistLegacySnapshot(lastUpdated);
  }

  deleteRule(id: number) {
    this.db.prepare(`DELETE FROM rule_entries WHERE id = ?`).run(id);
    const lastUpdated = new Date().toLocaleString();
    this.setState('last_updated', lastUpdated);
    this.persistLegacySnapshot(lastUpdated);
  }

  simulateTraffic(input: SimulationInput) {
    const profile = this.compileProfile(DEFAULT_USER_ID);
    return simulateTrafficInternal(profile, input);
  }

  upsertOAuthUser(input: {
    sub: string;
    name?: string;
    email?: string;
    preferred_username?: string;
    picture?: string;
  }) {
    const sub = input.sub.trim();
    if (!sub) throw new Error('missing sub');
    const displayName =
      input.name?.trim() ||
      input.preferred_username?.trim() ||
      input.email?.trim() ||
      sub;
    const username =
      input.preferred_username?.trim() ||
      input.email?.split('@')[0]?.trim() ||
      displayName;
    const now = new Date().toLocaleString();
    const existing = this.db.prepare(`SELECT id FROM users WHERE id = ?`).get(sub) as { id: string } | undefined;
    if (existing) {
      this.db
        .prepare(
          `UPDATE users
           SET username = ?, display_name = ?, email = ?, avatar_url = ?, status = 'active', last_seen = ?
           WHERE id = ?`,
        )
        .run(username, displayName, input.email?.trim() || null, input.picture?.trim() || null, now, sub);
    } else {
      this.db
        .prepare(
          `INSERT INTO users(id, username, display_name, email, avatar_url, status, created_at, last_seen)
           VALUES(?, ?, ?, ?, ?, 'active', ?, ?)`,
        )
        .run(sub, username, displayName, input.email?.trim() || null, input.picture?.trim() || null, now, now);
    }
  }

  private getUserDevices(userId: string) {
    const rows = this.db
      .prepare(
        `SELECT device_id, device_name, device_model, os_name, os_version, app_version, ip, location, last_seen
         FROM client_devices
         WHERE user_id = ?
         ORDER BY last_seen DESC`,
      )
      .all(userId) as Array<{
      device_id: string;
      device_name: string | null;
      device_model: string | null;
      os_name: string | null;
      os_version: string | null;
      app_version: string | null;
      ip: string | null;
      location: string | null;
      last_seen: string;
    }>;
    return rows.map((row) => {
      const osName = row.os_name?.trim() || 'Unknown OS';
      const osVersion = row.os_version?.trim();
      return {
        id: row.device_id,
        name: row.device_name?.trim() || row.device_model?.trim() || row.device_id,
        ip: row.ip?.trim() || '0.0.0.0',
        os: osVersion ? `${osName} ${osVersion}` : osName,
        appVersion: row.app_version?.trim() || 'unknown',
        lastSeen: row.last_seen,
        location: row.location?.trim() || undefined,
      };
    });
  }

  private getUserTraffic(userId: string) {
    const row = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(upload_bytes), 0) AS upload,
           COALESCE(SUM(download_bytes), 0) AS download
         FROM client_connect_logs
         WHERE user_id = ?`,
      )
      .get(userId) as { upload: number; download: number } | undefined;
    const upload = Number(row?.upload ?? 0);
    const download = Number(row?.download ?? 0);
    return {
      upload,
      download,
      total: upload + download,
    };
  }

  private getUserLogSummary(userId: string) {
    const aggregate = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE
             WHEN COALESCE(request_count, 0) > 0 THEN request_count
             ELSE 1 END), 0) AS total_requests,
           COALESCE(SUM(CASE
             WHEN lower(COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), '')) IN ('block', 'reject')
               THEN CASE WHEN COALESCE(request_count, 0) > 0 THEN request_count ELSE 1 END
             ELSE 0 END), 0) AS blocked_requests,
           COALESCE(SUM(CASE
             WHEN COALESCE(success_count, 0) > 0 THEN success_count
             WHEN lower(COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), '')) IN ('block', 'reject') THEN 0
             WHEN error_message IS NULL OR trim(error_message) = '' THEN CASE WHEN COALESCE(request_count, 0) > 0 THEN request_count ELSE 1 END
             ELSE 0 END), 0) AS successful_requests
         FROM client_connect_logs
         WHERE user_id = ?`,
      )
      .get(userId) as
      | {
          total_requests: number;
          blocked_requests: number;
          successful_requests: number;
        }
      | undefined;
    const effectiveTotal = Number(aggregate?.total_requests ?? 0);
    const successful = Number(aggregate?.successful_requests ?? 0);
    const successRate = effectiveTotal > 0 ? Number(((successful / effectiveTotal) * 100).toFixed(2)) : 100;

    const topAllowed = this.db
      .prepare(
        `SELECT target, COUNT(*) AS count
         FROM client_connect_logs
         WHERE user_id = ?
           AND target IS NOT NULL AND target != ''
         GROUP BY target
         ORDER BY count DESC
         LIMIT 5`,
      )
      .all(userId) as Array<{ target: string; count: number }>;
    const topDirect = this.db
      .prepare(
        `SELECT target, COUNT(*) AS count
         FROM client_connect_logs
         WHERE user_id = ?
           AND target IS NOT NULL AND target != ''
           AND lower(COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), '')) = 'direct'
         GROUP BY target
         ORDER BY count DESC
         LIMIT 5`,
      )
      .all(userId) as Array<{ target: string; count: number }>;

    const topBlocked = this.db
      .prepare(
        `SELECT target, COUNT(*) AS count
         FROM client_connect_logs
         WHERE user_id = ?
           AND target IS NOT NULL AND target != ''
           AND lower(COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), '')) IN ('block', 'reject')
         GROUP BY target
         ORDER BY count DESC
         LIMIT 5`,
      )
      .all(userId) as Array<{ target: string; count: number }>;

    return {
      totalRequests: effectiveTotal,
      successRate,
      topAllowed: topAllowed.map((item) => ({ domain: item.target, count: Number(item.count || 0) })),
      topDirect: topDirect.map((item) => ({ domain: item.target, count: Number(item.count || 0) })),
      topBlocked: topBlocked.map((item) => ({ domain: item.target, count: Number(item.count || 0) })),
    };
  }

  private mapUser(row: StoredUserRow) {
    const traffic = this.getUserTraffic(row.id);
    const devices = this.getUserDevices(row.id);
    const logs = this.getUserLogSummary(row.id);
    return {
      id: row.id,
      username: row.username || row.display_name || row.email || row.id,
      displayName: row.display_name || undefined,
      email: row.email || '',
      avatarUrl: row.avatar_url || undefined,
      status: row.status || 'active',
      traffic,
      devices,
      lastOnline: row.last_seen,
      created: row.created_at,
      logs,
    };
  }

  listUsers() {
    const rows = this.db
      .prepare(
        `SELECT id, username, display_name, email, avatar_url, status, created_at, last_seen
         FROM users
         ORDER BY last_seen DESC`,
      )
      .all() as StoredUserRow[];
    return rows.map((row) => this.mapUser(row));
  }

  getUser(id: string) {
    const row = this.db
      .prepare(
        `SELECT id, username, display_name, email, avatar_url, status, created_at, last_seen
         FROM users
         WHERE id = ?`,
      )
      .get(id) as StoredUserRow | undefined;
    if (!row) return undefined;
    return this.mapUser(row);
  }

  listUserTargetAggregates(userIdRaw: string, limitRaw = 100): UserTargetAggregateItem[] {
    const userId = userIdRaw.trim();
    if (!userId) throw new Error('missing_user_id');
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 100;
    const rows = this.db
      .prepare(
        `SELECT
           COALESCE(NULLIF(target, ''), '(unknown)') AS target,
           COALESCE(SUM(CASE WHEN COALESCE(request_count, 0) > 0 THEN request_count ELSE 1 END), 0) AS requests,
           COALESCE(SUM(upload_bytes), 0) AS upload_bytes,
           COALESCE(SUM(download_bytes), 0) AS download_bytes,
           COALESCE(SUM(CASE
             WHEN lower(COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), '')) IN ('block', 'reject')
               THEN CASE WHEN COALESCE(request_count, 0) > 0 THEN request_count ELSE 1 END
             ELSE 0 END), 0) AS blocked_requests,
           COALESCE(SUM(CASE
             WHEN COALESCE(success_count, 0) > 0 THEN success_count
             WHEN lower(COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), '')) IN ('block', 'reject') THEN 0
             WHEN error_message IS NULL OR trim(error_message) = '' THEN CASE WHEN COALESCE(request_count, 0) > 0 THEN request_count ELSE 1 END
             ELSE 0 END), 0) AS successful_requests,
           MAX(occurred_at) AS last_seen
         FROM client_connect_logs
         WHERE user_id = ?
         GROUP BY COALESCE(NULLIF(target, ''), '(unknown)')
         ORDER BY requests DESC, last_seen DESC
         LIMIT ?`,
      )
      .all(userId, limit) as Array<{
      target: string;
      requests: number;
      upload_bytes: number;
      download_bytes: number;
      blocked_requests: number;
      successful_requests: number;
      last_seen: string | null;
    }>;
    return rows.map((row) => {
      const requests = Number(row.requests || 0);
      const successful = Number(row.successful_requests || 0);
      return {
        target: row.target,
        requests,
        uploadBytes: Number(row.upload_bytes || 0),
        downloadBytes: Number(row.download_bytes || 0),
        blockedRequests: Number(row.blocked_requests || 0),
        successRate: requests > 0 ? Number(((successful / requests) * 100).toFixed(2)) : 100,
        lastSeen: row.last_seen || '-',
      };
    });
  }

  getUserTargetDetail(userIdRaw: string, targetRaw: string): UserTargetDetailItem | undefined {
    const userId = userIdRaw.trim();
    const target = targetRaw.trim() || '(unknown)';
    if (!userId) throw new Error('missing_user_id');
    const aggregate = this.db
      .prepare(
        `SELECT
           COALESCE(NULLIF(target, ''), '(unknown)') AS target,
           COALESCE(SUM(CASE WHEN COALESCE(request_count, 0) > 0 THEN request_count ELSE 1 END), 0) AS requests,
           COALESCE(SUM(upload_bytes), 0) AS upload_bytes,
           COALESCE(SUM(download_bytes), 0) AS download_bytes,
           COALESCE(SUM(CASE
             WHEN lower(COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), '')) IN ('block', 'reject')
               THEN CASE WHEN COALESCE(request_count, 0) > 0 THEN request_count ELSE 1 END
             ELSE 0 END), 0) AS blocked_requests,
           COALESCE(SUM(CASE
             WHEN COALESCE(success_count, 0) > 0 THEN success_count
             WHEN lower(COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), '')) IN ('block', 'reject') THEN 0
             WHEN error_message IS NULL OR trim(error_message) = '' THEN CASE WHEN COALESCE(request_count, 0) > 0 THEN request_count ELSE 1 END
             ELSE 0 END), 0) AS successful_requests,
           MAX(occurred_at) AS last_seen
         FROM client_connect_logs
         WHERE user_id = ?
           AND COALESCE(NULLIF(target, ''), '(unknown)') = ?`,
      )
      .get(userId, target) as
      | {
          target: string;
          requests: number;
          upload_bytes: number;
          download_bytes: number;
          blocked_requests: number;
          successful_requests: number;
          last_seen: string | null;
        }
      | undefined;
    if (!aggregate || Number(aggregate.requests || 0) <= 0) return undefined;

    const outboundRows = this.db
      .prepare(
        `SELECT
           lower(COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), 'unknown')) AS outbound_type,
           COUNT(*) AS count
         FROM client_connect_logs
         WHERE user_id = ?
           AND COALESCE(NULLIF(target, ''), '(unknown)') = ?
         GROUP BY lower(COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), 'unknown'))
         ORDER BY count DESC, outbound_type ASC`,
      )
      .all(userId, target) as Array<{ outbound_type: string; count: number }>;

    const recent = this.db
      .prepare(
        `SELECT
           occurred_at,
           COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), 'unknown') AS outbound_type,
           network_type,
           request_count,
           success_count,
           blocked_count,
           upload_bytes,
           download_bytes,
           error_message
         FROM client_connect_logs
         WHERE user_id = ?
           AND COALESCE(NULLIF(target, ''), '(unknown)') = ?
         ORDER BY occurred_at DESC
         LIMIT 100`,
      )
      .all(userId, target) as Array<{
      occurred_at: string;
      outbound_type: string;
      network_type: string | null;
      request_count: number;
      success_count: number;
      blocked_count: number;
      upload_bytes: number;
      download_bytes: number;
      error_message: string | null;
    }>;

    const requests = Number(aggregate.requests || 0);
    const successful = Number(aggregate.successful_requests || 0);
    return {
      target: aggregate.target,
      requests,
      uploadBytes: Number(aggregate.upload_bytes || 0),
      downloadBytes: Number(aggregate.download_bytes || 0),
      blockedRequests: Number(aggregate.blocked_requests || 0),
      successRate: requests > 0 ? Number(((successful / requests) * 100).toFixed(2)) : 100,
      lastSeen: aggregate.last_seen || '-',
      outboundTypes: outboundRows.map((item) => ({
        type: item.outbound_type || 'unknown',
        count: Number(item.count || 0),
      })),
      recent: recent.map((item) => ({
        occurredAt: item.occurred_at,
        outboundType: item.outbound_type || 'unknown',
        networkType: item.network_type,
        requestCount: Number(item.request_count || 0),
        successCount: Number(item.success_count || 0),
        blockedCount: Number(item.blocked_count || 0),
        uploadBytes: Number(item.upload_bytes || 0),
        downloadBytes: Number(item.download_bytes || 0),
        error: item.error_message,
      })),
    };
  }

  updateUserDisplayName(id: string, displayName: string) {
    const userId = id.trim();
    const name = displayName.trim();
    if (!userId) throw new Error('missing_user_id');
    if (!name) throw new Error('missing_display_name');

    const now = new Date().toLocaleString();
    const existing = this.db
      .prepare(
        `SELECT id, username, display_name, email, avatar_url, status, created_at, last_seen
         FROM users
         WHERE id = ?`,
      )
      .get(userId) as StoredUserRow | undefined;

    if (existing) {
      const nextUsername = existing.username?.trim() || name;
      this.db
        .prepare(
          `UPDATE users
           SET username = ?, display_name = ?, last_seen = ?
           WHERE id = ?`,
        )
        .run(nextUsername, name, now, userId);
    } else {
      this.db
        .prepare(
          `INSERT INTO users(id, username, display_name, email, avatar_url, status, created_at, last_seen)
           VALUES(?, ?, ?, ?, ?, 'active', ?, ?)`,
        )
        .run(userId, name, name, null, null, now, now);
    }

    const updated = this.getUser(userId);
    if (!updated) throw new Error('update_failed');
    return updated;
  }

  ingestClientDeviceReport(userIdRaw: string, input: ClientDeviceReportInput) {
    const userId = userIdRaw.trim();
    if (!userId) throw new Error('missing_user_id');
    const now = new Date().toLocaleString();
    const occurredAt = input.occurredAt?.trim() || now;

    this.ensureUserExists(userId, now);
    this.upsertClientDevice(
      userId,
      input.device,
      input.networkType,
      input.connected === true ? occurredAt : null,
      input.metadata,
      now,
    );
    return this.getUser(userId);
  }

  ingestClientConnectionLog(userIdRaw: string, input: ClientConnectionLogInput) {
    const userId = userIdRaw.trim();
    if (!userId) throw new Error('missing_user_id');
    const now = new Date().toLocaleString();
    const occurredAt = input.occurredAt?.trim() || now;

    this.ensureUserExists(userId, now);
    this.upsertClientDevice(
      userId,
      input.device,
      input.networkType,
      input.connected === true ? occurredAt : null,
      input.metadata,
      now,
    );

    this.db
      .prepare(
        `INSERT INTO client_connect_logs(
          user_id, device_id, connected, target, outbound_type, latency_ms, error_message, network_type, ip,
          request_count, success_count, blocked_count, upload_bytes, download_bytes, occurred_at, metadata_json
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        input.device?.id?.trim() || null,
        input.connected === true ? 1 : 0,
        input.target?.trim() || '(unknown)',
        input.outboundType?.trim() || null,
        Number.isFinite(input.latencyMs) ? Number(input.latencyMs) : null,
        input.error?.trim() || null,
        input.networkType?.trim() || null,
        input.device?.ip?.trim() || null,
        Number.isFinite(input.requestCount) ? Number(input.requestCount) : 0,
        Number.isFinite(input.successCount) ? Number(input.successCount) : 0,
        Number.isFinite(input.blockedCount) ? Number(input.blockedCount) : 0,
        Number.isFinite(input.uploadBytes) ? Number(input.uploadBytes) : 0,
        Number.isFinite(input.downloadBytes) ? Number(input.downloadBytes) : 0,
        occurredAt,
        input.metadata ? JSON.stringify(input.metadata) : null,
      );

    return this.getUser(userId);
  }

  ingestApiRequestLog(input: {
    path: string;
    method: string;
    statusCode: number;
    userId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    occurredAt?: string;
  }) {
    const path = input.path.trim();
    const method = input.method.trim() || 'GET';
    if (!path) return;
    this.db
      .prepare(
        `INSERT INTO api_request_logs(path, method, status_code, user_id, ip, user_agent, occurred_at)
         VALUES(?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        path,
        method,
        Number.isFinite(input.statusCode) ? input.statusCode : 0,
        input.userId?.trim() || null,
        input.ip?.trim() || null,
        input.userAgent?.trim() || null,
        input.occurredAt?.trim() || new Date().toISOString(),
      );
  }

  getDashboardSummary(): DashboardSummaryItem {
    const users = this.listUsers();
    const profile = this.compileProfile(DEFAULT_USER_ID) as JsonObject;
    const outbounds = Array.isArray(profile.outbounds) ? profile.outbounds : [];
    const activeNodes = outbounds.filter((item) => {
      const type = String(item?.type ?? '').toLowerCase();
      const tag = String(item?.tag ?? '').toLowerCase();
      return !['direct', 'block', 'dns', 'selector', 'urltest', 'fallback'].includes(type) &&
        !['direct', 'reject', 'dns-out', 'dns', 'auto', 'proxy'].includes(tag);
    }).length;

    const latestRevision = this.db
      .prepare(`SELECT version FROM revisions ORDER BY id DESC LIMIT 1`)
      .get() as { version: string } | undefined;

    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    const bucketStarts = Array.from({ length: 24 }, (_, idx) => now - (23 - idx) * hourMs);
    const uploadSeries = Array.from({ length: 24 }, () => 0);
    const downloadSeries = Array.from({ length: 24 }, () => 0);
    const syncSeries = Array.from({ length: 24 }, () => 0);
    const deviceSets = Array.from({ length: 24 }, () => new Set<string>());

    const logs = this.db
      .prepare(
        `SELECT device_id, upload_bytes, download_bytes, occurred_at
         FROM client_connect_logs
         ORDER BY id DESC
         LIMIT 20000`,
      )
      .all() as Array<{
      device_id: string | null;
      upload_bytes: number;
      download_bytes: number;
      occurred_at: string;
    }>;

    for (const row of logs) {
      const ts = Date.parse(row.occurred_at);
      if (!Number.isFinite(ts)) continue;
      const offset = Math.floor((ts - bucketStarts[0]) / hourMs);
      if (offset < 0 || offset >= 24) continue;
      uploadSeries[offset] += Number(row.upload_bytes || 0);
      downloadSeries[offset] += Number(row.download_bytes || 0);
      if (row.device_id?.trim()) {
        deviceSets[offset].add(row.device_id.trim());
      }
    }

    const syncRows = this.db
      .prepare(
        `SELECT occurred_at
         FROM api_request_logs
         WHERE path = '/api/v1/client/subscribe'
         ORDER BY id DESC
         LIMIT 20000`,
      )
      .all() as Array<{ occurred_at: string }>;
    for (const row of syncRows) {
      const ts = Date.parse(row.occurred_at);
      if (!Number.isFinite(ts)) continue;
      const offset = Math.floor((ts - bucketStarts[0]) / hourMs);
      if (offset < 0 || offset >= 24) continue;
      syncSeries[offset] += 1;
    }

    const recentLogRows = this.db
      .prepare(
        `SELECT summary, author, timestamp
         FROM revisions
         ORDER BY id DESC
         LIMIT 8`,
      )
      .all() as Array<{ summary: string; author: string; timestamp: string }>;
    const auditLogs = recentLogRows.map((item) => ({
      event: item.summary || 'Profile updated',
      admin: item.author || 'console',
      time: item.timestamp || '-',
      target: latestRevision?.version || '-',
    }));

    const lastHourIndex = 23;
    const lastHourUpload = uploadSeries[lastHourIndex] || 0;
    const lastHourDownload = downloadSeries[lastHourIndex] || 0;
    const lastHourTotal = lastHourUpload + lastHourDownload;
    const systemLoadPercent = Math.max(1, Math.min(100, Math.round(lastHourTotal / (1024 * 1024))));

    return {
      stats: {
        activeUsers: users.filter((user) => user.status === 'active').length,
        activeNodes,
        systemLoadPercent,
        configVersion: latestRevision?.version || 'v0.0.0',
      },
      traffic: {
        uploadSeries,
        downloadSeries,
      },
      devices: {
        series: deviceSets.map((set) => set.size),
      },
      syncRequests: {
        series: syncSeries,
      },
      auditLogs,
    };
  }

  private ensureUserExists(userId: string, now: string) {
    const existing = this.db.prepare(`SELECT id FROM users WHERE id = ?`).get(userId) as { id: string } | undefined;
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO users(id, username, display_name, email, avatar_url, status, created_at, last_seen)
           VALUES(?, ?, ?, ?, ?, 'active', ?, ?)`,
        )
        .run(userId, userId, userId, null, null, now, now);
    } else {
      this.db.prepare(`UPDATE users SET last_seen = ? WHERE id = ?`).run(now, userId);
    }
  }

  private upsertClientDevice(
    userId: string,
    device:
      | {
          id: string;
          name?: string;
          model?: string;
          osName?: string;
          osVersion?: string;
          appVersion?: string;
          ip?: string;
          location?: string;
        }
      | undefined,
    networkType: string | undefined,
    lastConnectedAt: string | null,
    metadata: Record<string, unknown> | undefined,
    now: string,
  ) {
    if (device?.id?.trim()) {
      const deviceId = device.id.trim();
      const existingDevice = this.db
        .prepare(`SELECT user_id FROM client_devices WHERE user_id = ? AND device_id = ?`)
        .get(userId, deviceId) as { user_id: string } | undefined;
      if (existingDevice) {
        this.db
          .prepare(
            `UPDATE client_devices
             SET device_name = ?, device_model = ?, os_name = ?, os_version = ?, app_version = ?,
                 ip = ?, network_type = ?, location = ?, last_seen = ?, last_connected_at = ?,
                 extra_json = ?
             WHERE user_id = ? AND device_id = ?`,
          )
          .run(
            device.name?.trim() || null,
            device.model?.trim() || null,
            device.osName?.trim() || null,
            device.osVersion?.trim() || null,
            device.appVersion?.trim() || null,
            device.ip?.trim() || null,
            networkType?.trim() || null,
            device.location?.trim() || null,
            now,
            lastConnectedAt,
            metadata ? JSON.stringify(metadata) : null,
            userId,
            deviceId,
          );
      } else {
        this.db
          .prepare(
            `INSERT INTO client_devices(
              user_id, device_id, device_name, device_model, os_name, os_version, app_version,
              ip, network_type, location, first_seen, last_seen, last_connected_at, extra_json
            ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            userId,
            deviceId,
            device.name?.trim() || null,
            device.model?.trim() || null,
            device.osName?.trim() || null,
            device.osVersion?.trim() || null,
            device.appVersion?.trim() || null,
            device.ip?.trim() || null,
            networkType?.trim() || null,
            device.location?.trim() || null,
            now,
            now,
            lastConnectedAt,
            metadata ? JSON.stringify(metadata) : null,
          );
      }
    }
  }
}

type SimCtx = {
  domain?: string;
  ip?: string;
  protocol?: string;
  port?: number;
};

const isIPv4 = (value: string): boolean =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(value) &&
  value.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);

const extractHost = (target: string): string => {
  try {
    const parsed = new URL(target.includes('://') ? target : `https://${target}`);
    return parsed.hostname;
  } catch {
    return target.split('/')[0].split(':')[0];
  }
};

const ipToInt = (ip: string): number =>
  ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;

const matchIpCidr = (ip: string, cidr: string): boolean => {
  if (!cidr.includes('/')) return ip === cidr;
  const [network, maskBitsRaw] = cidr.split('/');
  const maskBits = Number(maskBitsRaw);
  if (!isIPv4(network) || !isIPv4(ip) || !Number.isFinite(maskBits)) return false;
  const mask = maskBits === 0 ? 0 : (~((1 << (32 - maskBits)) - 1)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
};

const isPrivateIPv4 = (ip: string): boolean => {
  const parts = ip.split('.').map((item) => Number(item));
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 127) return true;
  return false;
};

const toArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') return [value];
  return [];
};

const matchRule = (rule: Record<string, any>, ctx: SimCtx): boolean => {
  const checks: boolean[] = [];
  const domains = toArray(rule.domain);
  if (domains.length) checks.push(!!ctx.domain && domains.includes(ctx.domain));
  const suffixes = toArray(rule.domain_suffix);
  if (suffixes.length) checks.push(!!ctx.domain && suffixes.some((item) => ctx.domain === item || ctx.domain!.endsWith(`.${item}`)));
  const keywords = toArray(rule.domain_keyword);
  if (keywords.length) checks.push(!!ctx.domain && keywords.some((item) => ctx.domain!.includes(item)));
  const regexList = toArray(rule.domain_regex);
  if (regexList.length) {
    checks.push(
      !!ctx.domain &&
        regexList.some((expr) => {
          try {
            return new RegExp(expr).test(ctx.domain!);
          } catch {
            return false;
          }
        }),
    );
  }
  const ipCidrs = toArray(rule.ip_cidr);
  if (ipCidrs.length) checks.push(!!ctx.ip && ipCidrs.some((item) => matchIpCidr(ctx.ip!, item)));
  const protocols = toArray(rule.protocol).map((item) => item.toLowerCase());
  if (protocols.length) checks.push(!!ctx.protocol && protocols.includes(ctx.protocol.toLowerCase()));
  if (rule.ip_is_private === true) checks.push(!!ctx.ip && isPrivateIPv4(ctx.ip));
  if (checks.length === 0) return false;
  return checks.every(Boolean);
};

const buildInlineRuleSetMatcher = (profile: Record<string, any>) => {
  const result = new Map<string, (ctx: SimCtx) => boolean>();
  const ruleSets = Array.isArray(profile.route?.rule_set) ? profile.route.rule_set : [];
  for (const set of ruleSets) {
    const tag = typeof set?.tag === 'string' ? set.tag : '';
    if (!tag || set?.type !== 'inline' || !Array.isArray(set?.rules)) continue;
    result.set(tag, (ctx: SimCtx) => set.rules.some((rule: Record<string, any>) => matchRule(rule, ctx)));
  }
  return result;
};

const matchRouteRule = (rule: Record<string, any>, ctx: SimCtx, inlineSet: Map<string, (ctx: SimCtx) => boolean>): boolean => {
  const checks: boolean[] = [];
  const tags = toArray(rule.rule_set);
  if (tags.length) checks.push(tags.some((tag) => inlineSet.get(tag)?.(ctx) === true));
  const selfRuleMatch = matchRule(rule, ctx);
  if (selfRuleMatch) checks.push(true);
  if (checks.length === 0) return false;
  return checks.every(Boolean);
};

const simulateTrafficInternal = (profile: Record<string, any>, input: SimulationInput) => {
  const host = extractHost(input.target.trim());
  const ctx: SimCtx = {
    domain: isIPv4(host) ? undefined : host.toLowerCase(),
    ip: isIPv4(host) ? host : undefined,
    protocol: (input.protocol || 'tcp').toLowerCase(),
    port: input.port,
  };

  const inlineSet = buildInlineRuleSetMatcher(profile);
  const routeRules = Array.isArray(profile.route?.rules) ? profile.route.rules : [];
  const dnsRules = Array.isArray(profile.dns?.rules) ? profile.dns.rules : [];

  const matchedRules: Array<{ index: number; summary: string; outbound?: string; action?: string }> = [];
  const actions: Array<{ index: number; summary: string; outbound?: string; action?: string }> = [];
  let finalOutbound = typeof profile.route?.final === 'string' ? profile.route.final : 'direct';
  let usedFinalFallback = true;

  for (let i = 0; i < routeRules.length; i += 1) {
    const rule = routeRules[i] as Record<string, any>;
    if (!matchRouteRule(rule, ctx, inlineSet)) continue;
    const summary = JSON.stringify(rule);
    if (typeof rule.action === 'string') {
      const hit = { index: i + 1, summary, action: rule.action };
      actions.push(hit);
      matchedRules.push(hit);
      if (rule.action === 'hijack-dns' && ctx.protocol === 'dns') {
        finalOutbound = 'dns-out';
        usedFinalFallback = false;
        break;
      }
      continue;
    }
    if (typeof rule.outbound === 'string') {
      const hit = { index: i + 1, summary, outbound: rule.outbound };
      matchedRules.push(hit);
      finalOutbound = rule.outbound;
      usedFinalFallback = false;
      break;
    }
  }

  let selectedDnsServer = typeof profile.dns?.final === 'string' ? profile.dns.final : 'dns_direct';
  let matchedDnsRule: string | undefined;
  for (let i = 0; i < dnsRules.length; i += 1) {
    const rule = dnsRules[i] as Record<string, any>;
    let match = false;
    const domains = toArray(rule.domain).map((item) => item.toLowerCase());
    if (domains.length && ctx.domain) match = domains.includes(ctx.domain);
    const tags = toArray(rule.rule_set);
    if (!match && tags.length) match = tags.some((tag) => inlineSet.get(tag)?.(ctx) === true);
    if (match && typeof rule.server === 'string') {
      selectedDnsServer = rule.server;
      matchedDnsRule = `rule #${i + 1}`;
      break;
    }
  }

  return {
    input: {
      target: input.target,
      protocol: ctx.protocol || 'tcp',
      port: input.port,
    },
    normalized: {
      domain: ctx.domain,
      ip: ctx.ip,
    },
    dns: {
      selectedServer: selectedDnsServer,
      matchedRule: matchedDnsRule,
    },
    route: {
      finalOutbound,
      matchedRules,
      actions,
      usedFinalFallback,
    },
  };
};
