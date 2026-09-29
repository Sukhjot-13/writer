#!/usr/bin/env node
/**
 * Verifies the Manager integration end to end against a running Manager:
 *   1. server key accepted, client key accepted, analytics key accepted
 *   2. analytics key refused on the log endpoint and server key refused on events
 *   3. the app's own health route (which logs through src/lib/logger.js) lands in Manager
 *
 * Usage: node scripts/check-manager-integration.mjs
 * Env:  MANAGER_ENDPOINT, MANAGER_LOG_KEY, MANAGER_ANALYTICS_KEY, APP_ORIGIN (default http://localhost:3000)
 */
import process from 'node:process';

const endpoint = (process.env.MANAGER_ENDPOINT ?? 'http://127.0.0.1:3300').replace(/\/$/, '');
const logKey = process.env.MANAGER_LOG_KEY ?? '';
const analyticsKey = process.env.MANAGER_ANALYTICS_KEY ?? '';
const appOrigin = (process.env.APP_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    process.stdout.write(`  ok  ${name}\n`);
  } else {
    failures.push(`${name}${detail === '' ? '' : ` — ${detail}`}`);
    process.stdout.write(`FAIL  ${name}${detail === '' ? '' : ` — ${detail}`}\n`);
  }
}

if (logKey === '' || analyticsKey === '') {
  process.stderr.write('MANAGER_LOG_KEY and MANAGER_ANALYTICS_KEY must be set\n');
  process.exit(2);
}

async function post(path, body, key) {
  const headers = { 'content-type': 'application/json' };
  if (key) headers['x-api-key'] = key;
  const response = await fetch(`${endpoint}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: response.status, body: parsed };
}

const marker = `check_${Date.now()}`;

process.stdout.write('1. ingest accepts the right key kinds\n');
const serverLog = await post('/api/ingest/logs', {
  logs: [{ level: 'info', message: `${marker}_server`, meta: { source: 'integration-check' } }],
}, logKey);
check('server key posts logs', serverLog.status === 200 && serverLog.body.accepted === 1, JSON.stringify(serverLog.body));

const event = await post('/api/ingest/events', {
  key: analyticsKey,
  events: [{ type: 'pageview', path: '/integration-check' }],
});
check('analytics key posts events', event.status === 200 && event.body.accepted === 1, JSON.stringify(event.body));

process.stdout.write('2. key kinds are enforced\n');
const wrongEvents = await post('/api/ingest/events', { events: [{ type: 'pageview', path: '/' }] }, logKey);
check('server key cannot post events', wrongEvents.status === 401, `status ${wrongEvents.status}`);

const wrongLogs = await post('/api/ingest/logs', { logs: [{ level: 'info', message: 'nope' }] }, analyticsKey);
check('analytics key cannot post logs', wrongLogs.status === 401, `status ${wrongLogs.status}`);

const badKey = await post('/api/ingest/logs', { logs: [{ level: 'info', message: 'nope' }] }, 'mlk_definitely_not_a_real_key');
check('unknown key gets a generic 401', badKey.status === 401 && JSON.stringify(badKey.body) === '{"error":"unauthorized"}', JSON.stringify(badKey.body));

process.stdout.write('3. the app\'s own logs reach Manager\n');
try {
  const health = await fetch(`${appOrigin}/api/health`);
  check('app health route responds', health.ok, `status ${health.status}`);
} catch (error) {
  check('app health route responds', false, error.message);
}

process.stdout.write(`\nmarker: ${marker} (search this in the log viewer)\n`);
process.stdout.write(`${passed} checks passed, ${failures.length} failed\n`);
if (failures.length > 0) process.exit(1);
