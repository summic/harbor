#!/usr/bin/env node

const { createRequire } = require('module');
const fs = require('fs');
const path = require('path');

const moduleRequire = createRequire(__filename);
const Database = moduleRequire('better-sqlite3');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [rawKey, rawValue] = arg.replace(/^--/, '').split('=');
    const key = rawKey;
    if (rawValue !== undefined) {
      args[key] = rawValue;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
      continue;
    }
    args[key] = true;
  }
  return args;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function usage() {
  console.log(`Usage:
  node scripts/seed-connect-logs.cjs [options]

Options:
  --user=<user_id>         User id to generate logs for (default: first user)
  --count=<number>         Number of log rows to insert (default: 240)
  --reset                  Delete existing logs for user before inserting (default: false)
  --db=<path>              SQLite database path
  --help                   Show this help

Examples:
  npm run seed:connect-logs
  npm run seed:connect-logs -- --user u1 --count 500 --reset
`);
}

const args = parseArgs(process.argv);

if (args.help) {
  usage();
  process.exit(0);
}

const dbPath = args.db || process.env.SAIL_DB_PATH || path.join(process.cwd(), '.local-data', 'sail.sqlite');
const count = Number.parseInt(args.count ?? '240', 10);
const shouldReset = args.reset === true;

if (!Number.isFinite(count) || count <= 0) {
  console.error('[seed] --count must be a positive number');
  process.exit(1);
}

if (!fs.existsSync(dbPath)) {
  console.error(`[seed] Database not found at: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);

try {
  const defaultUser = db.prepare('SELECT id FROM users ORDER BY rowid ASC LIMIT 1').get();
  if (!defaultUser) {
    throw new Error('No users found in database.');
  }

  const userId = args.user || defaultUser.id;
  const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!targetUser) {
    throw new Error(`User not found: ${userId}`);
  }

  if (shouldReset) {
    const reset = db.prepare('DELETE FROM client_connect_logs WHERE user_id = ?');
    const resetResult = reset.run(targetUser.id);
    console.log(`[seed] reset logs for user=${targetUser.id}, deleted=${resetResult.changes}`);
  }

  const targets = [
    'api.kuainiu.chat',
    'connect-api-prod.kuainiu.chat',
    'chat-staging.beforeve.com',
    'storage-staging.beforeve.com',
    'cdn-staging.beforeve.com',
    'tus-staging.beforeve.com',
    'sfu-staging.beforeve.com',
    'google.com',
    'twitter.com',
    'facebook.com',
    'cdn.jsdelivr.net',
    '8.8.8.8',
    '172.19.0.2:53',
    '17.188.170.199:443',
    '203.119.213.122:443',
    'api.whatsapp.com',
    'zoom.us',
    'signal.org'
  ];

  const outboundTypes = ['proxy', 'direct', 'block', 'dns'];
  const networks = ['wifi', '5G', '4G', '3G', '2G', 'cellular', 'unknown'];
  const deviceIds = ['device-macbook', 'device-iphone', 'device-ipad', 'device-android'];
  const ips = ['192.168.1.12', '10.0.0.45', '203.119.213.122', '17.188.170.199', '172.19.0.2'];

  const insert = db.prepare(`
    INSERT INTO client_connect_logs (
      user_id,
      device_id,
      connected,
      target,
      latency_ms,
      error_message,
      network_type,
      ip,
      request_count,
      success_count,
      blocked_count,
      upload_bytes,
      download_bytes,
      occurred_at,
      metadata_json,
      outbound_type
    ) VALUES (
      @user_id,
      @device_id,
      @connected,
      @target,
      @latency_ms,
      @error_message,
      @network_type,
      @ip,
      @request_count,
      @success_count,
      @blocked_count,
      @upload_bytes,
      @download_bytes,
      @occurred_at,
      @metadata_json,
      @outbound_type
    )
  `);

  const now = Date.now();
  const runSeed = db.transaction(() => {
    for (let i = 0; i < count; i += 1) {
      const outboundType = pick(outboundTypes);
      const requestCount = randInt(1, 120);
      let blockedCount = 0;
      let successCount = requestCount;
      let errorMessage = null;
      let connected = 1;

      if (outboundType === 'block') {
        blockedCount = randInt(Math.floor(requestCount * 0.25), requestCount);
        successCount = randInt(0, Math.max(0, requestCount - blockedCount));
        connected = 0;
        errorMessage = 'upstream timeout';
      } else if (outboundType === 'dns' && randInt(0, 9) === 0) {
        connected = 0;
        errorMessage = 'dns resolution failed';
      }

      const occurredAt = new Date(now - randInt(1, 10000000)).toISOString();
      const target = pick(targets);

      insert.run({
        user_id: targetUser.id,
        device_id: pick(deviceIds),
        connected,
        target,
        latency_ms: randInt(8, 1800),
        error_message: errorMessage,
        network_type: pick(networks),
        ip: pick(ips),
        request_count: requestCount,
        success_count: successCount,
        blocked_count: blockedCount,
        upload_bytes: randInt(1024, 8 * 1024 * 1024),
        download_bytes: randInt(1024, 12 * 1024 * 1024),
        occurred_at: occurredAt,
        metadata_json: JSON.stringify({
          generated_by: 'seed-connect-logs',
          target,
          outbound_type: outboundType,
          network_probe: true
        }),
        outbound_type: outboundType
      });
    }
  });

  const beforeCount = db.prepare('SELECT COUNT(*) AS cnt FROM client_connect_logs WHERE user_id = ?').get(targetUser.id).cnt;
  runSeed();
  const afterCount = db.prepare('SELECT COUNT(*) AS cnt FROM client_connect_logs WHERE user_id = ?').get(targetUser.id).cnt;

  console.log(`[seed] inserted ${count} rows for user=${targetUser.id} (from ${beforeCount} -> ${afterCount})`);

  const perOutbound = db
    .prepare(`
      SELECT outbound_type, COUNT(*) AS rows, SUM(request_count) AS requests
      FROM client_connect_logs
      WHERE user_id = ?
      GROUP BY outbound_type
      ORDER BY rows DESC
    `)
    .all(targetUser.id);
  console.log('[seed] outbound distribution:');
  console.table(perOutbound);

  const topTargets = db
    .prepare(`
      SELECT target, SUM(request_count) AS requests
      FROM client_connect_logs
      WHERE user_id = ?
      GROUP BY target
      ORDER BY requests DESC
      LIMIT 10
    `)
    .all(targetUser.id);
  console.log('[seed] top targets:');
  console.table(topTargets);

  console.log('[seed] done.');
} finally {
  db.close();
}
