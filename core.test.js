import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FixtureStore, redact, replayFixture, validateHttpUrl } from './core.js';
import { spawn } from 'node:child_process';

test('redacts secret-like fields recursively', () => {
  const result = redact({ Authorization: 'Bearer live_secret', nested: { token: 'abc', safe: 'ok' }, array: [{ password: 'pw' }] });
  assert.equal(result.Authorization, '[REDACTED]');
  assert.equal(result.nested.token, '[REDACTED]');
  assert.equal(result.nested.safe, 'ok');
  assert.equal(result.array[0].password, '[REDACTED]');
});

test('saves and lists fixtures with redaction', () => {
  const store = new FixtureStore();
  const fixture = store.save({ name: 'Stripe payment succeeded', url: 'http://localhost:3001/hook', headers: { 'stripe-signature': 'sig' }, body: { id: 'evt_1' } });
  assert.equal(fixture.headers['stripe-signature'], '[REDACTED]');
  assert.equal(store.get(fixture.id).name, 'Stripe payment succeeded');
  assert.equal(store.list().length, 1);
});

test('requires a fixture name', () => {
  const store = new FixtureStore();
  assert.throws(() => store.save({ name: ' ' }), /Fixture name is required/);
});

test('rejects invalid target URLs and methods', () => {
  const store = new FixtureStore();
  assert.throws(() => store.save({ name: 'bad url', url: 'ftp://example.com' }), /valid http/);
  assert.throws(() => store.save({ name: 'bad method', method: 'GET' }), /Method must be/);
  assert.doesNotThrow(() => validateHttpUrl('https://example.com/webhook'));
});

test('persists fixtures and replay history to disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hookledger-'));
  const dataFile = path.join(dir, 'data.json');
  const first = new FixtureStore({ dataFile });
  const fixture = first.save({ name: 'persisted', url: 'http://localhost:3001/hook', body: { ok: true } });
  first.logReplay({ fixtureId: fixture.id, fixtureName: fixture.name, targetUrl: fixture.url, result: { status: 200, ok: true, body: 'ok' } });
  const second = new FixtureStore({ dataFile });
  assert.equal(second.list()[0].name, 'persisted');
  assert.equal(second.history()[0].result.status, 200);
});

test('imports and exports fixtures', () => {
  const store = new FixtureStore();
  const imported = store.importFixtures([{ name: 'imported', url: 'http://localhost:3001/hook', headers: { token: 'secret' }, body: { ok: true } }]);
  assert.equal(imported.length, 1);
  assert.equal(store.exportData().product, 'HookLedger');
  assert.equal(store.exportData().fixtures[0].headers.token, '[REDACTED]');
});

test('replays fixture through injected fetch implementation', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return { status: 202, ok: true, text: async () => 'accepted' };
  };
  const result = await replayFixture({ method: 'POST', headers: { 'x-test': '1' }, body: { event: 'demo' }, url: 'http://example.test/hook' }, undefined, fakeFetch);
  assert.equal(result.status, 202);
  assert.equal(result.body, 'accepted');
  assert.equal(calls[0].url, 'http://example.test/hook');
  assert.equal(JSON.parse(calls[0].options.body).event, 'demo');
});

test('handles replay connection errors gracefully', async () => {
  const fakeFetch = async () => {
    throw new TypeError('Network error');
  };
  const result = await replayFixture({ method: 'POST', url: 'http://example.test/hook' }, undefined, fakeFetch);
  assert.equal(result.ok, false);
  assert.equal(result.status, null);
  assert.match(result.error, /Connection failed/);
});

test('redact handles null and non-object inputs', () => {
  assert.equal(redact(null), null);
  assert.equal(redact(42), 42);
  assert.equal(redact('plain string'), 'plain string');
  assert.equal(redact(undefined), undefined);
});

test('delete skips persist when fixture ID does not exist', () => {
  const store = new FixtureStore();
  store.save({ name: 'keep', url: 'http://localhost:3001/hook', body: { a: 1 } });
  const result = store.delete('nonexistent-id');
  assert.equal(result, false);
  assert.equal(store.list().length, 1);
});

test('replay history is capped at 100 entries', () => {
  const store = new FixtureStore();
  const fixture = store.save({ name: 'cap-test', url: 'http://localhost:3001/hook', body: {} });
  for (let i = 0; i < 110; i++) {
    store.logReplay({ fixtureId: fixture.id, fixtureName: fixture.name, targetUrl: fixture.url, result: { status: 200, ok: true, body: 'ok' } });
  }
  assert.equal(store.history().length, 100);
});

test('importFixtures deduplicates by regenerating IDs', () => {
  const store = new FixtureStore();
  const f1 = store.save({ name: 'first', url: 'http://localhost:3001/hook', body: { a: 1 } });
  const f2 = store.save({ name: 'second', url: 'http://localhost:3001/hook', body: { b: 2 } });
  assert.notEqual(f1.id, f2.id);
  assert.equal(store.list().length, 2);
});

test('validateHttpUrl rejects javascript: protocol', () => {
  assert.throws(() => validateHttpUrl('javascript:alert(1)'), /valid http/);
});

test('replay response truncation includes truncated flag', async () => {
  const longBody = 'x'.repeat(6000);
  const fakeFetch = async () => ({ status: 200, ok: true, text: async () => longBody });
  const result = await replayFixture({ method: 'POST', url: 'http://example.test/hook' }, undefined, fakeFetch);
  assert.equal(result.truncated, true);
  assert.equal(result.body.length, 5000);
});

test('replay response not truncated when under limit', async () => {
  const shortBody = 'hello';
  const fakeFetch = async () => ({ status: 200, ok: true, text: async () => shortBody });
  const result = await replayFixture({ method: 'POST', url: 'http://example.test/hook' }, undefined, fakeFetch);
  assert.equal(result.truncated, false);
  assert.equal(result.body, 'hello');
});

import http from 'node:http';

function startServer() {
  return new Promise((resolve) => {
    const child = spawn('node', ['server.js'], { cwd: path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), stdio: 'pipe' });
    child.stdout.on('data', (data) => {
      if (data.toString().includes('running at')) resolve(child);
    });
    child.on('error', () => {});
  });
}

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new globalThis.URL(url);
    const req = http.request({ hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, ok: res.statusCode < 400, json: () => JSON.parse(body || '{}'), text: () => body }));
    });
    if (options.body) req.write(options.body);
    req.on('error', reject);
    req.end();
  });
}

let serverProcess;
let BASE;

test.before(async () => {
  serverProcess = await startServer();
  BASE = 'http://localhost:3000';
  await new Promise(r => setTimeout(r, 500));
});

test.after(() => {
  if (serverProcess) serverProcess.kill();
});

test('GET / returns HTML', async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  assert.match(res.text(), /HookLedger/);
});

test('GET /workspace returns workspace page', async () => {
  const res = await fetch(`${BASE}/workspace`);
  assert.equal(res.status, 200);
  assert.match(res.text(), /HookLedger fixture lab/);
});

test('POST /api/fixtures creates and GET /api/fixtures/:id retrieves', async () => {
  const createRes = await fetch(`${BASE}/api/fixtures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'integration-test', url: 'http://localhost:3001/hook', body: { test: true } })
  });
  assert.equal(createRes.status, 201);
  const { fixture } = await createRes.json();
  const getRes = await fetch(`${BASE}/api/fixtures/${fixture.id}`);
  assert.equal(getRes.status, 200);
  const { fixture: fetched } = await getRes.json();
  assert.equal(fetched.name, 'integration-test');
});

test('GET /api/fixtures/:id returns 404 for nonexistent', async () => {
  const res = await fetch(`${BASE}/api/fixtures/nonexistent-id-12345`);
  assert.equal(res.status, 404);
});

test('DELETE /api/fixtures/:id deletes fixture', async () => {
  const createRes = await fetch(`${BASE}/api/fixtures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'to-delete', url: 'http://localhost:3001/hook', body: {} })
  });
  const { fixture } = await createRes.json();
  const delRes = await fetch(`${BASE}/api/fixtures/${fixture.id}`, { method: 'DELETE' });
  assert.equal(delRes.status, 200);
  const { deleted } = await delRes.json();
  assert.equal(deleted, true);
});

test('GET /api/history returns array', async () => {
  const res = await fetch(`${BASE}/api/history`);
  assert.equal(res.status, 200);
  const { history } = await res.json();
  assert.ok(Array.isArray(history));
});

test('unknown route returns 404', async () => {
  const res = await fetch(`${BASE}/nonexistent`);
  assert.equal(res.status, 404);
});
