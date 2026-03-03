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

const ISO_STRING_TYPE = 'string';

type ProfileSection = Record<string, unknown>;

const asObject = (value: unknown): ProfileSection | null => {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as ProfileSection) : null;
};

const asArray = (value: unknown): unknown[] | null => {
  return Array.isArray(value) ? value : null;
};

const asTag = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const tag = value.trim();
  return tag.length > 0 ? tag : null;
};

const collectDnsTags = (dnsSection: ProfileSection): string[] => {
  const dnsServers = asArray(dnsSection.servers) ?? [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const server of dnsServers) {
    const serverObj = asObject(server);
    const tag = asTag(serverObj?.tag);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
};

const normalizeProfileDNSRefs = (profile: JsonObject): JsonObject => {
  const dns = asObject(profile.dns);
  if (!dns) {
    return profile;
  }

  const route = asObject(profile.route);
  const tags = collectDnsTags(dns);
  if (tags.length === 0) {
    delete dns.final;
    if (route) {
      delete route.default_domain_resolver;
      profile.route = route;
    }
    return profile;
  }

  const dnsTagSet = new Set(tags);
  const defaultTag = tags[0];

  const currentDnsFinal = asTag(dns.final);
  const currentRouteResolver = asTag(route?.default_domain_resolver);

  dns.final = dnsTagSet.has(currentDnsFinal ?? '') ? currentDnsFinal : defaultTag;
  if (route) {
    route.default_domain_resolver = dnsTagSet.has(currentRouteResolver ?? '')
      ? currentRouteResolver
      : (dns.final as string);
    profile.route = route;
  }
  profile.dns = dns;
  return profile;
};

const validateProfileSection = (name: string, section: unknown, requiredFields: Record<string, string>): void => {
  const obj = asObject(section);
  if (!obj) {
    throw new Error(`invalid_profile_section:${name}`);
  }
  for (const [field, expectedType] of Object.entries(requiredFields)) {
    const value = obj[field];
    if (value === undefined) continue;
    const actualType = typeof value;
    if (actualType !== expectedType) {
      throw new Error(`invalid_profile_section_type:${name}.${field}`);
    }
  }
};

const validateProfileShape = (profile: unknown): void => {
  const root = asObject(profile);
  if (!root) {
    throw new Error('invalid_profile_root');
  }

  if (Object.prototype.hasOwnProperty.call(root, 'log') && asObject(root.log) === null) {
    throw new Error('invalid_profile_log');
  }
  if (Object.prototype.hasOwnProperty.call(root, 'ntp') && asObject(root.ntp) === null) {
    throw new Error('invalid_profile_ntp');
  }
  if (Object.prototype.hasOwnProperty.call(root, 'inbounds') && asArray(root.inbounds) === null) {
    throw new Error('invalid_profile_inbounds');
  }
  if (Object.prototype.hasOwnProperty.call(root, 'outbounds') && asArray(root.outbounds) === null) {
    throw new Error('invalid_profile_outbounds');
  }

  const dns = asObject(root.dns) ?? null;
  if (dns) {
    if (Object.prototype.hasOwnProperty.call(dns, 'servers') && asArray(dns.servers) === null) {
      throw new Error('invalid_profile_dns_servers');
    }
    if (Object.prototype.hasOwnProperty.call(dns, 'rules') && asArray(dns.rules) === null) {
      throw new Error('invalid_profile_dns_rules');
    }
    validateProfileSection('dns', dns, {
      final: ISO_STRING_TYPE,
      strategy: ISO_STRING_TYPE,
      independent_cache: 'boolean',
      address: ISO_STRING_TYPE,
      detour: ISO_STRING_TYPE,
      server_port: 'number',
      type: ISO_STRING_TYPE,
    });
  }

  const route = asObject(root.route) ?? null;
  if (route) {
    validateProfileSection('route', route, {
      final: ISO_STRING_TYPE,
      auto_detect_interface: 'boolean',
      default_domain_resolver: ISO_STRING_TYPE,
    });
    if (Object.prototype.hasOwnProperty.call(route, 'rule_set') && asArray(route.rule_set) === null) {
      throw new Error('invalid_profile_route_rule_set');
    }
    if (Object.prototype.hasOwnProperty.call(route, 'rules') && asArray(route.rules) === null) {
      throw new Error('invalid_profile_route_rules');
    }
  }
};

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
  sourceIp?: string;
};

export type ClientConnectionLogInput = {
  occurredAt?: string;
  connected?: boolean;
  target?: string;
  outboundTag?: string;
  outboundType?: string;
  isDns?: boolean;
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
  sourceIp?: string;
};

export type UserProfileAuditItem = {
  id: number;
  timestamp: string;
  summary: string;
  contentSize: number;
};

export type UserTargetAggregateItem = {
  target: string;
  policy?: string;
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
    outboundTag: string;
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

export type FailedDomainItem = {
  domain: string;
  failures: number;
  requests: number;
  successRate: number;
  lastError: string | null;
  lastSeen: string;
  outboundType: string;
};

type QualityObservabilityPoint = {
  timestamp: string;
  total: number;
  successRate: number;
  errorRate: number;
  p95LatencyMs?: number;
};

type QualityObservabilityPayload = {
  window: string;
  updatedAt: string;
  stability: {
    points: QualityObservabilityPoint[];
    totalRequests: number;
    avgSuccessRate: number;
  };
  topDomains: Array<{ domain: string; count: number; category?: 'dns' | 'app'; policy?: string }>;
  failureReasons: Array<{ code: string; count: number; ratio: number }>;
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
        updated_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CHECK ((scope = 'global' AND user_id IS NULL) OR (scope = 'user' AND user_id IS NOT NULL)),
        CHECK (LENGTH(TRIM(module)) > 0)
      );
      CREATE INDEX IF NOT EXISTS idx_rule_entries_scope_user_module
        ON rule_entries(scope, user_id, module);
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
        applied_at TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
    const now = this.now();
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
    this.migrateClientConnectTelemetryV3();
    this.migrateClientConnectTelemetryV4();
    this.migrateClientConnectTelemetryV5();
    this.migrateUserProfileAuditsV1();
    this.migrateApiRequestLogsV1();
    this.migrateImportSingboxConfigFromFile();
    this.migrateRuleEntryIndexes();
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
        outbound_tag TEXT,
        outbound_type TEXT,
        is_dns INTEGER,
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

  private migrateClientConnectTelemetryV3() {
    const migrationId = '20260302_client_connect_telemetry_v3_outbound_tag';
    if (this.isMigrationApplied(migrationId)) return;
    const columns = this.db.prepare(`PRAGMA table_info(client_connect_logs)`).all() as Array<{ name: string }>;
    const names = new Set(columns.map((item) => item.name));
    if (!names.has('outbound_tag')) {
      this.db.exec(`ALTER TABLE client_connect_logs ADD COLUMN outbound_tag TEXT`);
    }
    this.db.exec(`
      UPDATE client_connect_logs
      SET outbound_tag = COALESCE(
        NULLIF(outbound_tag, ''),
        NULLIF(json_extract(metadata_json, '$.outbound'), ''),
        NULLIF(json_extract(metadata_json, '$.outbound_tag'), '')
      )
      WHERE (outbound_tag IS NULL OR outbound_tag = '')
        AND metadata_json IS NOT NULL
    `);
    this.markMigrationApplied(migrationId);
  }

  private migrateClientConnectTelemetryV4() {
    const migrationId = '20260303_client_connect_telemetry_v4_is_dns';
    if (this.isMigrationApplied(migrationId)) return;
    const columns = this.db.prepare(`PRAGMA table_info(client_connect_logs)`).all() as Array<{ name: string }>;
    const names = new Set(columns.map((item) => item.name));
    if (!names.has('is_dns')) {
      this.db.exec(`ALTER TABLE client_connect_logs ADD COLUMN is_dns INTEGER`);
    }
    this.db.exec(`
      UPDATE client_connect_logs
      SET is_dns = CASE
        WHEN lower(COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), '')) = 'dns' THEN 1
        WHEN lower(COALESCE(outbound_tag, json_extract(metadata_json, '$.outbound'), json_extract(metadata_json, '$.outbound_tag'), '')) = 'dns-out' THEN 1
        WHEN lower(COALESCE(json_extract(metadata_json, '$.is_dns'), '')) IN ('1', 'true', 'yes') THEN 1
        ELSE NULL
      END
      WHERE is_dns IS NULL
    `);
    this.markMigrationApplied(migrationId);
  }

  private migrateClientConnectTelemetryV5() {
    const migrationId = '20260303_client_connect_telemetry_v5_is_dns_cleanup';
    if (this.isMigrationApplied(migrationId)) return;
    this.db.exec(`
      UPDATE client_connect_logs
      SET is_dns = NULL
      WHERE is_dns = 0
        AND (
          metadata_json IS NULL
          OR json_extract(metadata_json, '$.is_dns') IS NULL
        )
    `);
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

  private migrateRuleEntryIndexes() {
    const migrationId = '20260301_rule_entries_constraints_indexes';
    if (this.isMigrationApplied(migrationId)) return;
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_rule_entries_scope_module
        ON rule_entries(scope, module);
      CREATE INDEX IF NOT EXISTS idx_rule_entries_user_module
        ON rule_entries(user_id, module);
      CREATE INDEX IF NOT EXISTS idx_rule_entries_updated_at
        ON rule_entries(updated_at DESC);
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

      const timestamp = this.now();
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

  private now(): string {
    return new Date().toISOString();
  }

  private withTransaction<T>(action: () => T): T {
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const result = action();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // best effort rollback
      }
      throw error;
    }
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
        lastUpdated: this.now(),
      };
    }
    try {
      const raw = fs.readFileSync(this.storePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StoredProfile> & { content?: string };
      if (parsed.profile && typeof parsed.profile === 'object') {
        return {
          profile: parsed.profile as Record<string, unknown>,
          token: parsed.token || DEFAULT_SUBSCRIPTION_TOKEN,
          lastUpdated: parsed.lastUpdated || this.now(),
        };
      }
      if (typeof parsed.content === 'string') {
        return {
          profile: JSON.parse(parsed.content) as Record<string, unknown>,
          token: parsed.token || DEFAULT_SUBSCRIPTION_TOKEN,
          lastUpdated: parsed.lastUpdated || this.now(),
        };
      }
    } catch {
      // fall through
    }
    return {
      profile: seedProfile,
      token: DEFAULT_SUBSCRIPTION_TOKEN,
      lastUpdated: this.now(),
    };
  }

  private seedIfNeeded(seedProfile: Record<string, unknown>) {
    const seeded = this.getState('seeded_v1');
    if (seeded === '1') return;

    const ts = this.now();
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
    this.setState('last_updated', legacy.lastUpdated || this.now());
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
    const ts = timestamp ?? this.now();
    const content = JSON.stringify(currentProfile, null, 2);
    this.db
      .prepare(`INSERT INTO revisions(version, timestamp, author, summary, content) VALUES(?, ?, ?, ?, ?)`)
      .run(version, ts, author, summary, content);
    this.db.exec(`
      DELETE FROM revisions
      WHERE id NOT IN (
        SELECT id FROM revisions ORDER BY id DESC LIMIT 50
      );
    `);
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
    void timestamp;
    validateProfileShape(profile);
    const normalizedProfile = normalizeProfileDNSRefs(profile as JsonObject);
    this.withTransaction(() => {
      if (scope == 'global') {
        this.db.prepare(`DELETE FROM rule_entries WHERE scope = 'global'`).run();
      } else {
        this.db.prepare(`DELETE FROM rule_entries WHERE scope = 'user' AND user_id = ?`).run(userId);
      }

      const p = normalizedProfile;
      const dns = (p.dns ?? {}) as JsonObject;
      const route = (p.route ?? {}) as JsonObject;
      let priority = 0;

      this.insertRule(scope, userId, 'meta.log', p.log ?? {}, priority++);
      this.insertRule(scope, userId, 'meta.ntp', p.ntp ?? {}, priority++);
      this.insertRule(scope, userId, 'meta.dns', {
        final: dns.final,
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
    });
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
    try {
      const parsed = JSON.parse(row.payload_json);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('payload_json must be object');
      }
      return parsed as JsonObject;
    } catch (error) {
      console.warn('[config-store] invalid payload_json', {
        rowId: row.id,
        scope: row.scope,
        module: row.module,
        error: String(error),
      });
      return {};
    }
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

    return normalizeProfileDNSRefs(profile);
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
    const lastUpdated = this.getState('last_updated') || this.now();
    return {
      content,
      publicUrl: `${origin}/api/v1/client/subscribe`,
      lastUpdated,
      size: `${(Buffer.byteLength(JSON.stringify(profile), 'utf8') / 1024).toFixed(1)} KB`,
    };
  }

  saveUnifiedProfile(content: string, publicUrl?: string): UnifiedProfilePayload {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const lastUpdated = this.now();
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
    const lastUpdated = this.now();
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

  listVersions(limit = 50): ConfigVersionItem[] {
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
      this.now(),
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
    const lastUpdated = this.now();
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
           SET scope=?, user_id=?, module=?, rule_key=?, priority=?, enabled=?, payload_json=?, updated_at=(STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
    const lastUpdated = this.now();
    this.setState('last_updated', lastUpdated);
    this.persistLegacySnapshot(lastUpdated);
  }

  deleteRule(id: number) {
    this.db.prepare(`DELETE FROM rule_entries WHERE id = ?`).run(id);
    const lastUpdated = this.now();
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
    const now = this.now();
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
           target,
           outbound_tag,
           outbound_type,
           request_count,
           upload_bytes,
           download_bytes,
           success_count,
           error_message,
           metadata_json,
           occurred_at
         FROM client_connect_logs
         WHERE user_id = ?`,
      )
      .all(userId) as Array<{
      target: string | null;
      outbound_tag: string | null;
      outbound_type: string | null;
      request_count: number | null;
      upload_bytes: number | null;
      download_bytes: number | null;
      success_count: number | null;
      error_message: string | null;
      metadata_json: string | null;
      occurred_at: string | null;
    }>;
    const normalizeOutboundType = (row: (typeof rows)[number]) => {
      const explicit = (row.outbound_type || '').trim().toLowerCase();
      if (explicit) return explicit;
      if (!row.metadata_json) return 'unknown';
      try {
        const metadata = JSON.parse(row.metadata_json) as { outbound_type?: unknown };
        const metadataOutbound = typeof metadata?.outbound_type === 'string' ? metadata.outbound_type.trim().toLowerCase() : '';
        if (metadataOutbound) return metadataOutbound;
      } catch {
        // malformed metadata_json
      }
      return 'unknown';
    };
    const normalizeOutboundTag = (row: (typeof rows)[number]) => {
      const explicit = this.normalizeOutboundTag(row.outbound_tag);
      if (explicit) return explicit;
      if (!row.metadata_json) return '';
      try {
        const metadata = JSON.parse(row.metadata_json) as { outbound?: unknown; outbound_tag?: unknown };
        const metadataTag = typeof metadata?.outbound === 'string'
          ? this.normalizeOutboundTag(metadata.outbound)
          : typeof metadata?.outbound_tag === 'string'
            ? this.normalizeOutboundTag(metadata.outbound_tag)
            : '';
        if (metadataTag) return metadataTag;
      } catch {
        // malformed metadata_json
      }
      return '';
    };
    const normalizeTarget = (value: string | null) => {
      const target = (value || '').trim();
      return target ? target : '(unknown)';
    };
    const aggregates = new Map<string, {
      target: string;
      requests: number;
      uploadBytes: number;
      downloadBytes: number;
      blockedRequests: number;
      successfulRequests: number;
      lastSeen: string;
      outboundCounts: Record<string, number>;
    }>();
    for (const row of rows) {
      const normalizedTarget = normalizeTarget(row.target);
      const outboundType = normalizeOutboundType(row);
      const outboundTag = normalizeOutboundTag(row);
      const outboundPolicy = outboundTag || outboundType;
      const requestCount = Number(row.request_count && row.request_count > 0 ? row.request_count : 1);
      const existing = aggregates.get(normalizedTarget) ?? {
        target: normalizedTarget,
        requests: 0,
        uploadBytes: 0,
        downloadBytes: 0,
        blockedRequests: 0,
        successfulRequests: 0,
        lastSeen: row.occurred_at || '-',
        outboundCounts: {},
      };
      const outboundIsBlocked = outboundType === 'block' || outboundType === 'reject';
      const successCount = Number(row.success_count || 0);
      const hasError = Boolean((row.error_message || '').trim());
      const successful = successCount > 0 ? successCount : outboundIsBlocked ? 0 : hasError ? 0 : requestCount;
      existing.requests += requestCount;
      existing.uploadBytes += Number(row.upload_bytes || 0);
      existing.downloadBytes += Number(row.download_bytes || 0);
      existing.blockedRequests += outboundIsBlocked ? requestCount : 0;
      existing.successfulRequests += successful;
      existing.outboundCounts[outboundPolicy] = (existing.outboundCounts[outboundPolicy] || 0) + requestCount;
      if (row.occurred_at && (existing.lastSeen === '-' || row.occurred_at > existing.lastSeen)) {
        existing.lastSeen = row.occurred_at;
      }
      aggregates.set(normalizedTarget, existing);
    }
    const aggregated = [...aggregates.values()].map((entry) => {
      let policy = 'unknown';
      let policyCount = -1;
      for (const [outboundType, count] of Object.entries(entry.outboundCounts)) {
        if (count > policyCount || (count === policyCount && outboundType < policy)) {
          policyCount = count;
          policy = outboundType;
        }
      }
      const requests = Number(entry.requests || 0);
      const successful = Number(entry.successfulRequests || 0);
      return {
        target: entry.target,
        policy,
        requests,
        uploadBytes: Number(entry.uploadBytes || 0),
        downloadBytes: Number(entry.downloadBytes || 0),
        blockedRequests: Number(entry.blockedRequests || 0),
        successRate: requests > 0 ? Number(((successful / requests) * 100).toFixed(2)) : 100,
        lastSeen: entry.lastSeen || '-',
      };
    });
    aggregated.sort((a, b) => {
      if (b.requests !== a.requests) return b.requests - a.requests;
      if (a.lastSeen === '-') return 1;
      if (b.lastSeen === '-') return -1;
      return b.lastSeen.localeCompare(a.lastSeen);
    });
    return aggregated.slice(0, limit);
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
           COALESCE(
             NULLIF(outbound_tag, ''),
             NULLIF(json_extract(metadata_json, '$.outbound'), ''),
             NULLIF(json_extract(metadata_json, '$.outbound_tag'), ''),
             lower(COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), 'unknown'))
           ) AS outbound_policy,
           COUNT(*) AS count
         FROM client_connect_logs
         WHERE user_id = ?
           AND COALESCE(NULLIF(target, ''), '(unknown)') = ?
         GROUP BY COALESCE(
           NULLIF(outbound_tag, ''),
           NULLIF(json_extract(metadata_json, '$.outbound'), ''),
           NULLIF(json_extract(metadata_json, '$.outbound_tag'), ''),
           lower(COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), 'unknown'))
         )
         ORDER BY count DESC, outbound_policy ASC`,
      )
      .all(userId, target) as Array<{ outbound_policy: string; count: number }>;

    const recent = this.db
      .prepare(
        `SELECT
           occurred_at,
           outbound_tag,
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
      outbound_tag: string | null;
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
        type: item.outbound_policy || 'unknown',
        count: Number(item.count || 0),
      })),
      recent: recent.map((item) => ({
        occurredAt: item.occurred_at,
        outboundTag: this.normalizeOutboundTag(item.outbound_tag) || this.normalizeOutboundType(item.outbound_type),
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

    const now = this.now();
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
    const now = new Date().toISOString();
    const occurredAt = input.occurredAt?.trim() || now;

    this.ensureUserExists(userId, now);
    this.upsertClientDevice(
      userId,
      input.device,
      input.networkType,
      input.connected === true ? occurredAt : null,
      input.metadata,
      input.sourceIp,
      now,
    );
    return this.getUser(userId);
  }

  ingestClientConnectionLog(userIdRaw: string, input: ClientConnectionLogInput) {
    const userId = userIdRaw.trim();
    if (!userId) throw new Error('missing_user_id');
    const now = new Date().toISOString();
    const occurredAt = input.occurredAt?.trim() || now;

    this.ensureUserExists(userId, now);
    this.upsertClientDevice(
      userId,
      input.device,
      input.networkType,
      input.connected === true ? occurredAt : null,
      input.metadata,
      input.sourceIp,
      now,
    );

    this.db
      .prepare(
        `INSERT INTO client_connect_logs(
          user_id, device_id, connected, target, outbound_tag, outbound_type, is_dns, latency_ms, error_message, network_type, ip,
          request_count, success_count, blocked_count, upload_bytes, download_bytes, occurred_at, metadata_json
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        input.device?.id?.trim() || null,
        input.connected === true ? 1 : 0,
        this.targetFromConnectionInput(input),
        input.outboundTag?.trim() || null,
        input.outboundType?.trim() || null,
        this.normalizeIsDnsFromInput(input),
        Number.isFinite(input.latencyMs) ? Number(input.latencyMs) : null,
        input.error?.trim() || null,
        input.networkType?.trim() || null,
        this.resolveReportedIp(input.device?.ip, input.sourceIp),
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

  private parseDurationToMs(raw: string | undefined, fallbackMs: number): number {
    if (!raw) return fallbackMs;
    const value = raw.trim().toLowerCase();
    const match = value.match(/^(\d+)\s*([smhd])$/);
    if (!match) return fallbackMs;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return fallbackMs;
    const unit = match[2];
    if (unit === 's') return amount * 1000;
    if (unit === 'm') return amount * 60 * 1000;
    if (unit === 'h') return amount * 60 * 60 * 1000;
    if (unit === 'd') return amount * 24 * 60 * 60 * 1000;
    return fallbackMs;
  }

  private normalizeOutboundType(value: string | null | undefined): string {
    const type = (value || '').trim().toLowerCase();
    return type || 'unknown';
  }

  private normalizeOutboundTag(value: string | null | undefined): string {
    const tag = (value || '').trim();
    return tag || '';
  }

  private normalizeTargetDomain(target: string | null | undefined): string {
    const raw = (target || '').trim();
    if (!raw) return '(unknown)';
    const candidate = raw.includes('://') ? raw : `https://${raw}`;
    try {
      const url = new URL(candidate);
      return (url.hostname || raw).toLowerCase();
    } catch {
      const first = raw.split('/')[0];
      const hostPort = first.startsWith('[') ? first : first.split(':')[0];
      return (hostPort || raw).toLowerCase();
    }
  }

  private isIpAddressLike(value: string): boolean {
    const v = value.trim();
    if (!v) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return true;
    if (v.includes(':') && /^[0-9a-fA-F:]+$/.test(v)) return true;
    return false;
  }

  private parseEndpointPort(value: string | null | undefined): number | undefined {
    const raw = (value || '').trim();
    if (!raw) return undefined;
    if (raw.startsWith('[')) {
      const bracketEnd = raw.indexOf(']');
      if (bracketEnd > -1 && raw.length > bracketEnd + 2 && raw[bracketEnd + 1] === ':') {
        const port = Number(raw.slice(bracketEnd + 2));
        return Number.isFinite(port) ? port : undefined;
      }
      return undefined;
    }
    const idx = raw.lastIndexOf(':');
    if (idx <= 0 || idx >= raw.length - 1) return undefined;
    const port = Number(raw.slice(idx + 1));
    return Number.isFinite(port) ? port : undefined;
  }

  private extractHost(value: string | null | undefined): string {
    const normalized = this.normalizeTargetDomain(value || '');
    return normalized.toLowerCase();
  }

  private collectDnsResolverHosts(): Set<string> {
    const profile = this.compileProfile(DEFAULT_USER_ID) as JsonObject;
    const dns = (profile.dns || {}) as JsonObject;
    const servers = Array.isArray(dns.servers) ? dns.servers : [];
    const hosts = new Set<string>();
    for (const server of servers) {
      const item = (server || {}) as JsonObject;
      const address = String(item.address || item.server || '').trim();
      if (!address) continue;
      try {
        if (address.includes('://')) {
          const url = new URL(address);
          if (url.hostname) hosts.add(url.hostname.toLowerCase());
        } else if (address.includes(':')) {
          const host = address.split(':')[0]?.trim().toLowerCase();
          if (host) hosts.add(host);
        } else {
          hosts.add(address.toLowerCase());
        }
      } catch {
        hosts.add(address.toLowerCase());
      }
    }
    return hosts;
  }

  private isDnsConnectionRow(input: {
    target: string | null;
    outboundType: string;
    outboundTag: string;
    isDns: number | null;
    metadataJson: string | null;
  }, dnsResolverHosts: Set<string>): boolean {
    if (input.isDns === 1) return true;
    if (input.isDns === 0) return false;
    if (input.outboundType === 'dns') return true;
    if (input.outboundTag.toLowerCase() === 'dns-out') return true;
    const targetPort = this.parseEndpointPort(input.target);
    if (targetPort === 53 || targetPort === 853) return true;
    const targetHost = this.extractHost(input.target);
    if (dnsResolverHosts.has(targetHost)) return true;
    if (!input.metadataJson) return false;
    try {
      const metadata = JSON.parse(input.metadataJson) as Record<string, unknown>;
      const isDnsFlag = String(metadata.is_dns || '').trim().toLowerCase();
      if (isDnsFlag === '1' || isDnsFlag === 'true' || isDnsFlag === 'yes') return true;
      const protocol = String(metadata.protocol || '').trim().toLowerCase();
      if (protocol === 'dns') return true;
      const mdOutboundType = this.normalizeOutboundType(String(metadata.outbound_type || ''));
      if (mdOutboundType === 'dns') return true;
      const mdOutbound = this.normalizeOutboundTag(String(metadata.outbound || metadata.outbound_tag || ''));
      if (mdOutbound.toLowerCase() === 'dns-out') return true;
      const destination = String(metadata.destination || '').trim();
      const source = String(metadata.source || '').trim();
      const destinationPort = this.parseEndpointPort(destination);
      const sourcePort = this.parseEndpointPort(source);
      if (destinationPort === 53 || destinationPort === 853 || sourcePort === 53) return true;
      const destinationHost = this.extractHost(destination);
      if (dnsResolverHosts.has(destinationHost)) return true;
      const rule = String(metadata.rule || '').toLowerCase();
      if (rule.includes('dns') || rule.includes('hijack-dns')) return true;
    } catch {
      // ignore malformed metadata
    }
    return false;
  }

  private targetFromConnectionInput(input: ClientConnectionLogInput): string {
    const direct = input.target?.trim();
    const metadata = input.metadata as Record<string, unknown> | undefined;
    const mdDomain = typeof metadata?.domain === 'string' ? metadata.domain.trim() : '';
    const mdHost = typeof metadata?.host === 'string' ? metadata.host.trim() : '';
    const mdSni = typeof metadata?.sni === 'string' ? metadata.sni.trim() : '';
    const metadataTarget = mdDomain || mdHost || mdSni;
    if (!direct) return metadataTarget || '(unknown)';
    const normalized = this.normalizeTargetDomain(direct);
    if (this.isIpAddressLike(normalized) && metadataTarget) return metadataTarget;
    return direct;
  }

  private normalizeIsDnsFromInput(input: ClientConnectionLogInput): number | null {
    if (typeof input.isDns === 'boolean') return input.isDns ? 1 : 0;
    const metadata = input.metadata as Record<string, unknown> | undefined;
    const raw = metadata?.is_dns;
    if (typeof raw === 'boolean') return raw ? 1 : 0;
    if (typeof raw === 'number') return raw > 0 ? 1 : 0;
    if (typeof raw === 'string') {
      const normalized = raw.trim().toLowerCase();
      if (normalized === '1' || normalized === 'true' || normalized === 'yes') return 1;
      if (normalized === '0' || normalized === 'false' || normalized === 'no') return 0;
    }
    return null;
  }

  private isBlockedOutbound(outboundType: string): boolean {
    return outboundType === 'block' || outboundType === 'reject';
  }

  private classifyFailureReason(outboundType: string, errorMessage: string | null | undefined): string {
    if (this.isBlockedOutbound(outboundType)) return 'BLOCKED_POLICY';
    const message = (errorMessage || '').trim().toLowerCase();
    if (!message) return 'UNKNOWN';
    if (/(dns).*(timeout|timed out)|resolve timeout/.test(message)) return 'DNS_TIMEOUT';
    if (/(dns).*(refused|denied|forbidden)/.test(message)) return 'DNS_REFUSED';
    if (/tls|handshake|certificate/.test(message)) return 'TLS_HANDSHAKE';
    if (/auth|unauthorized|forbidden|invalid token/.test(message)) return 'AUTH_FAILED';
    if (/too many requests|rate limit|429/.test(message)) return 'RATE_LIMITED';
    if (/\b5\d\d\b/.test(message)) return 'UPSTREAM_5XX';
    if (/\b4\d\d\b/.test(message)) return 'UPSTREAM_4XX';
    if (/reset|broken pipe|econnreset/.test(message)) return 'CONNECTION_RESET';
    if (/timeout|timed out|i\/o timeout/.test(message)) return 'CONNECT_TIMEOUT';
    return 'UNKNOWN';
  }

  private weightedP95(samples: Array<{ latency: number; weight: number }>): number | undefined {
    if (!samples.length) return undefined;
    const sorted = [...samples].sort((a, b) => a.latency - b.latency);
    const totalWeight = sorted.reduce((sum, item) => sum + Math.max(1, item.weight), 0);
    if (totalWeight <= 0) return undefined;
    const threshold = totalWeight * 0.95;
    let accumulated = 0;
    for (const item of sorted) {
      accumulated += Math.max(1, item.weight);
      if (accumulated >= threshold) return Math.round(item.latency);
    }
    return Math.round(sorted[sorted.length - 1].latency);
  }

  getQualityObservability(input: {
    window?: string;
    topN?: number;
    bucket?: string;
  }): QualityObservabilityPayload {
    const windowMs = this.parseDurationToMs(input.window, 24 * 60 * 60 * 1000);
    const bucketMs = Math.max(60 * 1000, this.parseDurationToMs(input.bucket, 60 * 60 * 1000));
    const topN = Number.isFinite(input.topN) ? Math.max(1, Math.min(100, Math.trunc(input.topN || 10))) : 10;
    const now = Date.now();
    const start = now - windowMs;
    const bucketCount = Math.max(1, Math.ceil(windowMs / bucketMs));
    const points: Array<{
      ts: number;
      total: number;
      success: number;
      latency: Array<{ latency: number; weight: number }>;
    }> = Array.from({ length: bucketCount }, (_, index) => ({
      ts: start + index * bucketMs,
      total: 0,
      success: 0,
      latency: [],
    }));

    const rows = this.db
      .prepare(
        `SELECT
           occurred_at,
           target,
           outbound_tag,
           COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), '') AS outbound_type,
           is_dns,
           error_message,
           latency_ms,
           request_count,
           success_count,
           blocked_count,
           metadata_json
         FROM client_connect_logs
         WHERE occurred_at >= ?
         ORDER BY occurred_at ASC`,
      )
      .all(new Date(start).toISOString()) as Array<{
      occurred_at: string;
      target: string | null;
      outbound_tag: string | null;
      outbound_type: string | null;
      is_dns: number | null;
      error_message: string | null;
      latency_ms: number | null;
      request_count: number | null;
      success_count: number | null;
      blocked_count: number | null;
      metadata_json: string | null;
    }>;

    const dnsResolverHosts = this.collectDnsResolverHosts();
    const topDomainMap = new Map<string, {
      count: number;
      outboundCounts: Map<string, number>;
      dnsCount: number;
      appCount: number;
    }>();
    const failureMap = new Map<string, number>();
    let totalRequests = 0;
    let totalSuccess = 0;

    for (const row of rows) {
      const ts = Date.parse(row.occurred_at);
      if (!Number.isFinite(ts) || ts < start || ts > now + bucketMs) continue;
      const index = Math.floor((ts - start) / bucketMs);
      if (index < 0 || index >= points.length) continue;
      const point = points[index];
      const outboundType = this.normalizeOutboundType(row.outbound_type);
      const outboundTag = this.normalizeOutboundTag(row.outbound_tag);
      const outboundPolicy = outboundTag || outboundType;
      const isDns = this.isDnsConnectionRow({
        target: row.target,
        outboundType,
        outboundTag,
        isDns: row.is_dns,
        metadataJson: row.metadata_json,
      }, dnsResolverHosts);
      const target = (row.target || '').trim();
      const hasTarget = !!target && target !== '(unknown)';
      const explicitRequestCount = Number(row.request_count || 0);
      let requestCount = explicitRequestCount > 0 ? explicitRequestCount : 0;
      if (requestCount === 0) {
        const hasSignal = Number(row.success_count || 0) > 0 ||
          Number(row.blocked_count || 0) > 0 ||
          !!row.error_message?.trim() ||
          Number.isFinite(row.latency_ms);
        if (hasTarget && hasSignal) {
          requestCount = 1;
        }
      }
      if (requestCount <= 0) continue;
      const blockedCount = Number(row.blocked_count || 0);
      const blockedByType = this.isBlockedOutbound(outboundType);
      const hasError = !!row.error_message?.trim();
      const successCount = Number(row.success_count || 0) > 0
        ? Number(row.success_count || 0)
        : blockedByType
          ? 0
          : hasError
            ? 0
            : requestCount;

      point.total += requestCount;
      point.success += Math.min(successCount, requestCount);
      totalRequests += requestCount;
      totalSuccess += Math.min(successCount, requestCount);

      if (Number.isFinite(row.latency_ms) && Number(row.latency_ms) >= 0) {
        point.latency.push({
          latency: Number(row.latency_ms),
          weight: Math.max(1, requestCount),
        });
      }

      const normalizedTarget = hasTarget ? target : '(unknown)';
      const targetEntry = topDomainMap.get(normalizedTarget) ?? {
        count: 0,
        outboundCounts: new Map<string, number>(),
        dnsCount: 0,
        appCount: 0,
      };
      targetEntry.count += requestCount;
      if (isDns) {
        targetEntry.dnsCount += requestCount;
      } else {
        targetEntry.appCount += requestCount;
      }
      targetEntry.outboundCounts.set(
        outboundPolicy,
        (targetEntry.outboundCounts.get(outboundPolicy) || 0) + requestCount,
      );
      topDomainMap.set(normalizedTarget, targetEntry);

      const failCount = Math.max(
        0,
        requestCount - Math.min(successCount, requestCount),
        blockedCount,
        hasError ? 1 : 0,
      );
      if (failCount > 0) {
        const code = this.classifyFailureReason(outboundType, row.error_message);
        failureMap.set(code, (failureMap.get(code) || 0) + failCount);
      }
    }

    const stabilityPoints: QualityObservabilityPoint[] = points.map((point) => {
      const successRate = point.total > 0 ? Number(((point.success / point.total) * 100).toFixed(2)) : 100;
      const errorRate = Number((100 - successRate).toFixed(2));
      const p95LatencyMs = this.weightedP95(point.latency);
      return {
        timestamp: new Date(point.ts).toISOString(),
        total: point.total,
        successRate,
        errorRate,
        ...(typeof p95LatencyMs === 'number' ? { p95LatencyMs } : {}),
      };
    });

    const topDomains = [...topDomainMap.entries()]
      .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
      .slice(0, topN)
      .map(([domain, payload]) => {
        let dominantOutbound = 'unknown';
        let dominantCount = -1;
        for (const [outbound, count] of payload.outboundCounts.entries()) {
          if (count > dominantCount) {
            dominantCount = count;
            dominantOutbound = outbound;
          }
        }
        return {
          domain,
          count: payload.count,
          category: payload.dnsCount >= payload.appCount ? 'dns' : 'app',
          policy: dominantOutbound,
        };
      });

    const failureTotal = [...failureMap.values()].reduce((sum, count) => sum + count, 0);
    const failureReasons = [...failureMap.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, topN)
      .map(([code, count]) => ({
        code,
        count,
        ratio: failureTotal > 0 ? Number(((count / failureTotal) * 100).toFixed(2)) : 0,
      }));

    return {
      window: input.window?.trim() || '24h',
      updatedAt: new Date().toISOString(),
      stability: {
        points: stabilityPoints,
        totalRequests,
        avgSuccessRate: totalRequests > 0 ? Number(((totalSuccess / totalRequests) * 100).toFixed(2)) : 100,
      },
      topDomains,
      failureReasons,
    };
  }

  listFailedDomains(input: { window?: string; limit?: number; userId?: string; outboundType?: string }): FailedDomainItem[] {
    const windowMs = this.parseDurationToMs(input.window, 24 * 60 * 60 * 1000);
    const sinceIso = new Date(Date.now() - windowMs).toISOString();
    const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(100, Math.trunc(input.limit || 20))) : 20;

    const rows = this.db
      .prepare(
        `SELECT
           user_id,
           target,
           outbound_tag,
           COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), '') AS outbound_type,
           error_message,
           request_count,
           success_count,
           occurred_at,
           metadata_json
         FROM client_connect_logs
         WHERE occurred_at >= ?
         ORDER BY occurred_at DESC`,
      )
      .all(sinceIso) as Array<{
      user_id: string | null;
      target: string | null;
      outbound_tag: string | null;
      outbound_type: string | null;
      error_message: string | null;
      request_count: number | null;
      success_count: number | null;
      occurred_at: string;
      metadata_json: string | null;
    }>;

    const aggregate = new Map<string, {
      failures: number;
      requests: number;
      success: number;
      lastError: string | null;
      lastSeen: string;
      outboundType: string;
    }>();

    for (const row of rows) {
      if (input.userId?.trim() && row.user_id !== input.userId.trim()) continue;
      const rowOutboundType = this.normalizeOutboundType(row.outbound_type);
      const rowOutboundTag = this.normalizeOutboundTag(row.outbound_tag);
      if (input.outboundType?.trim() && rowOutboundType !== this.normalizeOutboundType(input.outboundType)) continue;

      const requestCount = Number(row.request_count || 0) > 0 ? Number(row.request_count || 0) : 1;
      const successCount = Number(row.success_count || 0) > 0
        ? Math.min(Number(row.success_count || 0), requestCount)
        : row.error_message?.trim()
          ? 0
          : requestCount;
      const failCount = Math.max(0, requestCount - successCount, row.error_message?.trim() ? 1 : 0);
      if (failCount <= 0) continue;

      let domain = this.normalizeTargetDomain(row.target);
      if (this.isIpAddressLike(domain)) {
        try {
          const metadata = row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : null;
          const mdDomain = typeof metadata?.domain === 'string' ? metadata.domain.trim() : '';
          const mdHost = typeof metadata?.host === 'string' ? metadata.host.trim() : '';
          const mdSni = typeof metadata?.sni === 'string' ? metadata.sni.trim() : '';
          if (mdDomain || mdHost || mdSni) {
            domain = this.normalizeTargetDomain(mdDomain || mdHost || mdSni);
          }
        } catch {
          // ignore malformed metadata
        }
      }
      const outboundType = rowOutboundTag || rowOutboundType;
      const existing = aggregate.get(domain) ?? {
        failures: 0,
        requests: 0,
        success: 0,
        lastError: null,
        lastSeen: row.occurred_at,
        outboundType,
      };
      existing.failures += failCount;
      existing.requests += requestCount;
      existing.success += successCount;
      if (row.error_message?.trim() && !existing.lastError) {
        existing.lastError = row.error_message.trim();
      }
      if (row.occurred_at > existing.lastSeen) {
        existing.lastSeen = row.occurred_at;
      }
      existing.outboundType = outboundType;
      aggregate.set(domain, existing);
    }

    return [...aggregate.entries()]
      .sort((a, b) => b[1].failures - a[1].failures || b[1].requests - a[1].requests || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([domain, item]) => ({
        domain,
        failures: item.failures,
        requests: item.requests,
        successRate: item.requests > 0 ? Number(((item.success / item.requests) * 100).toFixed(2)) : 0,
        lastError: item.lastError,
        lastSeen: item.lastSeen,
        outboundType: item.outboundType,
      }));
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
        `SELECT
           device_id,
           upload_bytes,
           download_bytes,
           occurred_at,
           outbound_tag,
           COALESCE(outbound_type, json_extract(metadata_json, '$.outbound_type'), '') AS outbound_type
         FROM client_connect_logs
         ORDER BY id DESC
         LIMIT 20000`,
      )
      .all() as Array<{
      device_id: string | null;
      upload_bytes: number;
      download_bytes: number;
      occurred_at: string;
      outbound_tag: string | null;
      outbound_type: string | null;
    }>;

    for (const row of logs) {
      const ts = Date.parse(row.occurred_at);
      if (!Number.isFinite(ts)) continue;
      const offset = Math.floor((ts - bucketStarts[0]) / hourMs);
      if (offset < 0 || offset >= 24) continue;
      const outboundType = this.normalizeOutboundType(row.outbound_type);
      const outboundTag = this.normalizeOutboundTag(row.outbound_tag);
      const outboundPolicy = (outboundTag || outboundType).toLowerCase();
      if (outboundPolicy !== 'direct') {
        uploadSeries[offset] += Number(row.upload_bytes || 0);
        downloadSeries[offset] += Number(row.download_bytes || 0);
      }
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
    sourceIp: string | undefined,
    now: string,
  ) {
    if (device?.id?.trim()) {
      const deviceId = device.id.trim();
      const resolvedIp = this.resolveReportedIp(device.ip, sourceIp);
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
            resolvedIp,
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
            resolvedIp,
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

  private resolveReportedIp(reportedIp: string | undefined, sourceIp: string | undefined): string | null {
    const normalize = (value: string | undefined): string => (value || '').trim();
    const isInvalid = (value: string): boolean =>
      value === '' ||
      value === '0.0.0.0' ||
      value === '::' ||
      value.toLowerCase() === 'unknown';
    const reported = normalize(reportedIp);
    const source = normalize(sourceIp);
    if (!isInvalid(reported)) return reported;
    if (!isInvalid(source)) return source;
    return null;
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

  const dnsSection = asObject(profile.dns) ?? {};
  const dnsTags = collectDnsTags(dnsSection);
  const dnsTagSet = new Set(dnsTags);
  const dnsFinalCandidate = typeof profile.dns?.final === 'string' ? profile.dns.final : '';
  const selectedDnsServer =
    dnsTagSet.has(dnsFinalCandidate) ? dnsFinalCandidate : dnsTags.length > 0 ? dnsTags[0] : '';
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
