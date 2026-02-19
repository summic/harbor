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
  }

  private isMigrationApplied(id: string): boolean {
    const row = this.db.prepare(`SELECT id FROM schema_migrations WHERE id = ?`).get(id) as { id: string } | undefined;
    return !!row;
  }

  private markMigrationApplied(id: string) {
    this.db.prepare(`INSERT OR IGNORE INTO schema_migrations(id) VALUES(?)`).run(id);
  }

  private runMigrations() {
    this.migrateImportSingboxConfigFromFile();
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

    this.db.prepare(`INSERT OR IGNORE INTO users(id, username) VALUES(?, ?)`).run(DEFAULT_USER_ID, 'alice');
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

  private replaceGlobalProfile(profile: Record<string, unknown>, timestamp: string) {
    this.db.prepare(`DELETE FROM rule_entries WHERE scope = 'global'`).run();

    const p = profile as JsonObject;
    const dns = (p.dns ?? {}) as JsonObject;
    const route = (p.route ?? {}) as JsonObject;
    let priority = 0;

    this.insertRule('global', null, 'meta.log', p.log ?? {}, priority++);
    this.insertRule('global', null, 'meta.ntp', p.ntp ?? {}, priority++);
    this.insertRule('global', null, 'meta.dns', {
      final: dns.final ?? 'dns_direct',
      independent_cache: dns.independent_cache ?? false,
      strategy: dns.strategy ?? 'prefer_ipv4',
    }, priority++);
    this.insertRule('global', null, 'meta.route', {
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
        this.insertRule('global', null, item.module, row, priority++, key);
      }
    }

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

  compileProfile(userId: string = DEFAULT_USER_ID): Record<string, unknown> {
    const rows = this.listCompiledRows(userId);
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

  getUnifiedProfile(origin: string): UnifiedProfilePayload {
    const profile = this.compileProfile(DEFAULT_USER_ID);
    const content = JSON.stringify(profile, null, 2);
    const token = this.getToken();
    const lastUpdated = this.getState('last_updated') || new Date().toLocaleString();
    return {
      content,
      publicUrl: `${origin}/api/v1/client/subscribe?token=${token}`,
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
