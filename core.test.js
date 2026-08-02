import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FixtureStore, RecordingSession, jsonPathGet, preserveSecrets, redact, redactedFixture, replayFixture, replaySequence, runAssertion, validateHttpUrl, validateReplayTarget } from './core.js';
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
  assert.equal(fixture.headers['stripe-signature'], 'sig');
  assert.equal(store.get(fixture.id).headers['stripe-signature'], 'sig');
  assert.equal(store.list()[0].headers['stripe-signature'], '[REDACTED]');
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
  const { imported, warnings } = store.importFixtures([{ name: 'imported', url: 'http://localhost:3001/hook', headers: { token: 'secret' }, body: { ok: true } }]);
  assert.equal(imported.length, 1);
  assert.ok(Array.isArray(warnings));
  assert.equal(store.exportData().product, 'HookLedger');
  assert.equal(store.exportData().fixtures[0].headers.token, '[REDACTED]');
});

test('importFixtures returns warnings for duplicate IDs', () => {
  const store = new FixtureStore();
  store.save({ name: 'original', url: 'http://localhost:3001/hook', body: {} });
  const fixture = store.list()[0];
  const { warnings } = store.importFixtures([{ id: fixture.id, name: 'dupe', url: 'http://localhost:3001/hook', body: {} }]);
  assert.ok(warnings.length > 0);
  assert.match(warnings[0], /overwrites existing/);
});

test('importFixtures counts only first-wins for intra-batch duplicate ids', () => {
  const store = new FixtureStore();
  const { imported, warnings } = store.importFixtures([
    { id: 'dupX', name: 'first', url: 'http://localhost:3001/hook', body: {} },
    { id: 'dupX', name: 'second', url: 'http://localhost:3001/hook', body: {} }
  ]);
  assert.equal(imported.length, 1, 'should report exactly 1 fixture imported');
  assert.equal(imported[0].name, 'first', 'should keep the first entry');
  assert.equal(store.list().length, 1, 'should have exactly 1 fixture in store');
  assert.equal(store.list()[0].name, 'first');
  assert.ok(warnings.some(w => w.includes('duplicate')), 'should warn about duplicate');
});

test('replays fixture through injected fetch implementation', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return { status: 202, ok: true, text: async () => 'accepted' };
  };
  const result = await replayFixture({ method: 'POST', headers: { 'x-test': '1' }, body: { event: 'demo' }, url: 'http://127.0.0.1:4000/hook' }, undefined, fakeFetch);
  assert.equal(result.status, 202);
  assert.equal(result.body, 'accepted');
  assert.equal(typeof result.durationMs, 'number');
  assert.ok(result.durationMs >= 0);
  assert.equal(calls[0].url, 'http://127.0.0.1:4000/hook');
  assert.equal(JSON.parse(calls[0].options.body).event, 'demo');
});

test('handles replay connection errors gracefully', async () => {
  const fakeFetch = async () => {
    throw new TypeError('Network error');
  };
  const result = await replayFixture({ method: 'POST', url: 'http://127.0.0.1:4000/hook' }, undefined, fakeFetch);
  assert.equal(result.ok, false);
  assert.equal(result.status, null);
  assert.equal(typeof result.durationMs, 'number');
  assert.match(result.error, /Connection failed/);
});

test('redact handles null and non-object inputs', () => {
  assert.equal(redact(null), null);
  assert.equal(redact(42), 42);
  assert.equal(redact('plain string'), 'plain string');
  assert.equal(redact(undefined), undefined);
});

test('redact uses substring matching for common token variants', () => {
  const result = redact({ access_token: 'abc', refresh_token: 'xyz', 'x-api-key': 'key123', 'x-hub-signature-256': 'sig', 'x-shopify-hmac-sha256': 'hmac' });
  assert.equal(result.access_token, '[REDACTED]');
  assert.equal(result.refresh_token, '[REDACTED]');
  assert.equal(result['x-api-key'], '[REDACTED]');
  assert.equal(result['x-hub-signature-256'], '[REDACTED]');
  assert.equal(result['x-shopify-hmac-sha256'], '[REDACTED]');
});

test('redact does not over-match short or unrelated field names', () => {
  const result = redact({ at: 'value', key: 'value', secretary: 'value', status: 'ok', created_at: '2024-01-01', total: '100' });
  assert.equal(result.at, 'value');
  assert.equal(result.key, 'value');
  assert.equal(result.secretary, 'value');
  assert.equal(result.status, 'ok');
  assert.equal(result.created_at, '2024-01-01');
  assert.equal(result.total, '100');
});

test('redact redacts prefixed secret-key fields like secret_key, token_value, api_key_2', () => {
  const result = redact({ secret_key: 's', token_value: 't', api_key_2: 'k', my_secret: 'm' });
  assert.equal(result.secret_key, '[REDACTED]');
  assert.equal(result.token_value, '[REDACTED]');
  assert.equal(result.api_key_2, '[REDACTED]');
  assert.equal(result.my_secret, '[REDACTED]');
});

test('redact does not redact known-safe compound fields like token_type, cookie_settings', () => {
  const result = redact({ token_type: 'Bearer', cookie_settings: 'lax', cookie_name: 'session', cookie_path: '/', cookie_domain: 'example.com', cookie_secure: 'true', cookie_httponly: 'true', cookie_samesite: 'lax', cookie_maxage: '3600', token_use: 'access' });
  assert.equal(result.token_type, 'Bearer');
  assert.equal(result.cookie_settings, 'lax');
  assert.equal(result.cookie_name, 'session');
  assert.equal(result.cookie_path, '/');
  assert.equal(result.cookie_domain, 'example.com');
  assert.equal(result.cookie_secure, 'true');
  assert.equal(result.cookie_httponly, 'true');
  assert.equal(result.cookie_samesite, 'lax');
  assert.equal(result.cookie_maxage, '3600');
  assert.equal(result.token_use, 'access');
});

test('save stores real values, list returns redacted copies', () => {
  const store = new FixtureStore();
  store.save({ name: 'test', url: 'http://localhost:3001/hook', headers: { 'authorization': 'Bearer real-token', 'content-type': 'application/json' }, body: { secret: 'abc', public: 'xyz' } });
  const real = store.get(store.list()[0].id);
  assert.equal(real.headers.authorization, 'Bearer real-token');
  assert.equal(real.body.secret, 'abc');
  const listed = store.list()[0];
  assert.equal(listed.headers.authorization, '[REDACTED]');
  assert.equal(listed.body.secret, '[REDACTED]');
  assert.equal(listed.body.public, 'xyz');
});

test('exportData returns redacted fixtures', () => {
  const store = new FixtureStore();
  store.save({ name: 'export-test', url: 'http://localhost:3001/hook', headers: { 'stripe-signature': 'real-sig' }, body: { data: 'ok' } });
  const exported = store.exportData();
  assert.equal(exported.fixtures[0].headers['stripe-signature'], '[REDACTED]');
  const real = store.get(store.list()[0].id);
  assert.equal(real.headers['stripe-signature'], 'real-sig');
});

test('replay sends real values, not redacted placeholders', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return { status: 200, ok: true, text: async () => 'ok' };
  };
  const store = new FixtureStore();
  const fixture = store.save({ name: 'replay-test', url: 'http://127.0.0.1:4000/hook', headers: { 'stripe-signature': 'whsec_real123' }, body: { event: 'payment.succeeded' } });
  await replayFixture(store.get(fixture.id), undefined, fakeFetch);
  const sentHeaders = calls[0].options.headers;
  assert.equal(sentHeaders['stripe-signature'], 'whsec_real123');
  const sentBody = JSON.parse(calls[0].options.body);
  assert.equal(sentBody.event, 'payment.succeeded');
});

test('redactedFixture helper strips secrets', () => {
  const fixture = { id: '1', name: 'test', headers: { 'authorization': 'Bearer tok', 'content-type': 'application/json' }, body: { secret: 's', data: 'd' } };
  const redacted = redactedFixture(fixture);
  assert.equal(redacted.headers.authorization, '[REDACTED]');
  assert.equal(redacted.headers['content-type'], 'application/json');
  assert.equal(redacted.body.secret, '[REDACTED]');
  assert.equal(redacted.body.data, 'd');
  assert.equal(redacted.id, '1');
});

test('POST /api/fixtures ignores client-supplied id', async () => {
  const createRes = await fetch(`${BASE}/api/fixtures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'id-test', id: 'custom-id-123', body: {} })
  });
  assert.equal(createRes.status, 201);
  const { fixture } = await createRes.json();
  assert.notEqual(fixture.id, 'custom-id-123');
  assert.ok(fixture.id.length > 0);
});

test('POST /api/fixtures does not overwrite existing fixture', async () => {
  const first = await fetch(`${BASE}/api/fixtures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'original', body: { a: 1 } })
  });
  const { fixture: f1 } = await first.json();
  const second = await fetch(`${BASE}/api/fixtures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'overwrite-attempt', id: f1.id, body: { b: 2 } })
  });
  assert.equal(second.status, 201);
  const { fixture: f2 } = await second.json();
  assert.notEqual(f2.id, f1.id);
  const getRes = await fetch(`${BASE}/api/fixtures/${f1.id}`);
  const { fixture: original } = await getRes.json();
  assert.equal(original.name, 'original');
});

test('load() recovers gracefully from corrupted data file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hookledger-'));
  const dataFile = path.join(dir, 'data.json');
  fs.writeFileSync(dataFile, '{invalid json!!!');
  const store = new FixtureStore({ dataFile });
  assert.equal(store.list().length, 0);
  const backups = fs.readdirSync(dir).filter(f => f.startsWith(path.basename(dataFile) + '.bak.'));
  assert.ok(backups.length > 0, 'backup file should exist after corrupted load');
});

test('validateReplayTarget rejects non-loopback URLs', () => {
  assert.throws(() => validateReplayTarget('http://evil.com/hook'), /loopback/);
  assert.throws(() => validateReplayTarget('http://192.168.1.1/hook'), /loopback/);
  assert.doesNotThrow(() => validateReplayTarget('http://127.0.0.1:4000/hook'));
  assert.doesNotThrow(() => validateReplayTarget('http://localhost:4000/hook'));
  assert.doesNotThrow(() => validateReplayTarget('http://[::1]:4000/hook'));
});

test('importFixtures rolls back on validation error mid-batch', () => {
  const store = new FixtureStore();
  store.save({ name: 'existing', url: 'http://localhost:3001/hook', body: {} });
  assert.throws(() => store.importFixtures([
    { name: 'valid', url: 'http://localhost:3001/hook', body: {} },
    { name: '', url: 'http://localhost:3001/hook', body: {} }
  ]), /name is required/i);
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].name, 'existing');
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
  const result = await replayFixture({ method: 'POST', url: 'http://127.0.0.1:4000/hook' }, undefined, fakeFetch);
  assert.equal(result.truncated, true);
  assert.equal(result.body.length, 5000);
});

test('replay response not truncated when under limit', async () => {
  const shortBody = 'hello';
  const fakeFetch = async () => ({ status: 200, ok: true, text: async () => shortBody });
  const result = await replayFixture({ method: 'POST', url: 'http://127.0.0.1:4000/hook' }, undefined, fakeFetch);
  assert.equal(result.truncated, false);
  assert.equal(result.body, 'hello');
});

test('validateReplayTarget rejects loopback-bypass hostnames', () => {
  assert.throws(() => validateReplayTarget('http://127.0.0.1.evil.com/hook'), /loopback/);
  assert.throws(() => validateReplayTarget('http://127.1.2.3.evil.com/hook'), /loopback/);
  assert.throws(() => validateReplayTarget('http://localhost.evil.com/hook'), /loopback/);
  assert.throws(() => validateReplayTarget('http://127.0.0.1:4000@evil.com/hook'), /loopback/);
  assert.doesNotThrow(() => validateReplayTarget('http://127.0.0.1:4000/hook'));
  assert.doesNotThrow(() => validateReplayTarget('http://127.8.8.8:4000/hook'));
  assert.doesNotThrow(() => validateReplayTarget('http://localhost:4000/hook'));
  assert.doesNotThrow(() => validateReplayTarget('http://[::1]:4000/hook'));
});

test('preserveSecrets restores stored values for [REDACTED] placeholders', () => {
  const headers = preserveSecrets(
    { authorization: 'Bearer real-token', 'content-type': 'application/json' },
    { authorization: '[REDACTED]', 'content-type': 'text/plain' }
  );
  assert.equal(headers.authorization, 'Bearer real-token');
  assert.equal(headers['content-type'], 'text/plain');
  const body = preserveSecrets({ data: { token: 'abc' }, id: 1 }, { data: { token: '[REDACTED]', new: true }, id: 9 });
  assert.equal(body.data.token, 'abc');
  assert.equal(body.data.new, true);
  assert.equal(body.id, 9);
});

test('save with preserveRedacted keeps real secrets on edit', () => {
  const store = new FixtureStore();
  const fixture = store.save({ name: 'original', url: 'http://localhost:3001/hook', headers: { authorization: 'Bearer real-secret' }, body: { token: 'abc', event: 'created' } });
  store.save({ id: fixture.id, name: 'renamed', url: 'http://localhost:3001/hook', headers: { authorization: '[REDACTED]' }, body: { token: '[REDACTED]', event: 'updated' } }, { preserveRedacted: true });
  const stored = store.get(fixture.id);
  assert.equal(stored.name, 'renamed');
  assert.equal(stored.headers.authorization, 'Bearer real-secret');
  assert.equal(stored.body.token, 'abc');
  assert.equal(stored.body.event, 'updated');
});

test('jsonPathGet resolves dot and bracket paths', () => {
  const obj = { a: { b: [{ id: 1 }, { id: 2 }] }, x: 5, 'hyphen-key': 'v' };
  assert.equal(jsonPathGet(obj, 'a.b[1].id'), 2);
  assert.equal(jsonPathGet(obj, 'a.b.0.id'), 1);
  assert.equal(jsonPathGet(obj, 'x'), 5);
  assert.equal(jsonPathGet(obj, 'missing'), undefined);
  assert.equal(jsonPathGet(obj, 'a.b[9]'), undefined);
});

test('saveSequence validates steps and references', () => {
  const store = new FixtureStore();
  const fx = store.save({ name: 'fx', url: 'http://localhost:3001/hook', body: {} });
  assert.throws(() => store.saveSequence({ name: '' }), /Sequence name is required/);
  assert.throws(() => store.saveSequence({ name: 's', steps: [{ fixtureId: 'missing-id' }] }), /missing fixture/);
  assert.throws(() => store.saveSequence({ name: 's', steps: [{ fixtureId: fx.id, delayMs: -1 }] }), /non-negative/);
  assert.throws(() => store.saveSequence({ name: 's', steps: 'nope' }), /array/);
  assert.throws(() => store.saveSequence({ name: 's', steps: [{ fixtureId: fx.id, assertion: { url: 'http://localhost:3001/state', jsonPath: 'x', timeoutMs: -1 } }] }), /timeout/);
  assert.throws(() => store.saveSequence({ name: 's', steps: [{ fixtureId: fx.id, assertion: { url: 'not a url', jsonPath: 'x' } }] }), /valid http/);
  const seq = store.saveSequence({ name: 'Flow', targetUrl: 'http://localhost:4000/webhook', steps: [{ fixtureId: fx.id, delayMs: 25, assertion: { url: 'http://localhost:3001/state', jsonPath: 'ok', expectedValue: true } }] });
  assert.equal(seq.name, 'Flow');
  assert.equal(seq.targetUrl, 'http://localhost:4000/webhook');
  assert.equal(seq.steps[0].delayMs, 25);
  assert.equal(seq.steps[0].assertion.expectedValue, true);
  assert.equal(store.listSequences().length, 1);
  assert.equal(store.getSequence(seq.id).steps.length, 1);
  assert.equal(store.deleteSequence(seq.id), true);
  assert.throws(() => store.getSequence(seq.id), /not found/);
});

test('sequences and sequence runs persist to disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hookledger-'));
  const dataFile = path.join(dir, 'data.json');
  const first = new FixtureStore({ dataFile });
  const fx = first.save({ name: 'fx', url: 'http://localhost:3001/hook', body: {} });
  const seq = first.saveSequence({ name: 'persist-seq', steps: [{ fixtureId: fx.id, delayMs: 40 }] });
  first.logSequenceRun({ id: 'run-1', sequenceId: seq.id, timingMode: 'as-recorded', startedAt: new Date().toISOString(), durationMs: 10, steps: [], overallStatus: 'ok' });
  const second = new FixtureStore({ dataFile });
  assert.equal(second.listSequences()[0].name, 'persist-seq');
  assert.equal(second.listSequences()[0].steps[0].delayMs, 40);
  assert.equal(second.listSequenceRuns()[0].id, 'run-1');
  const exported = second.exportData();
  assert.equal(exported.sequences.length, 1);
  assert.equal(exported.sequenceRuns.length, 1);
});

test('runAssertion polls until the expected value appears', async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls++;
    return { status: 200, ok: true, text: async () => JSON.stringify({ status: calls < 3 ? 'pending' : 'ready' }) };
  };
  const result = await runAssertion({ url: 'http://127.0.0.1:4000/state', jsonPath: 'status', expectedValue: 'ready', timeoutMs: 2000, pollIntervalMs: 10 }, fakeFetch);
  assert.equal(result.passed, true);
  assert.equal(result.attempts, 3);
  assert.equal(result.value, 'ready');
  assert.equal(result.error, null);
});

test('runAssertion times out when value never matches', async () => {
  const fakeFetch = async () => ({ status: 200, ok: true, text: async () => JSON.stringify({ status: 'pending' }) });
  const result = await runAssertion({ url: 'http://127.0.0.1:4000/state', jsonPath: 'status', expectedValue: 'ready', timeoutMs: 100, pollIntervalMs: 10 }, fakeFetch);
  assert.equal(result.passed, false);
  assert.match(result.error, /timed out/);
  assert.equal(result.value, 'pending');
});

test('runAssertion rejects non-loopback targets', async () => {
  await assert.rejects(runAssertion({ url: 'http://evil.com/state', jsonPath: 'ok', expectedValue: true }), /loopback/);
});

test('replaySequence runs compressed steps in order', async () => {
  const store = new FixtureStore();
  const f1 = store.save({ name: 'one', url: 'http://127.0.0.1:4000/a', body: {} });
  const f2 = store.save({ name: 'two', url: 'http://127.0.0.1:4000/b', body: {} });
  const order = [];
  const fakeFetch = async (url) => {
    order.push(url);
    return { status: 200, ok: true, text: async () => 'ok' };
  };
  const run = await replaySequence({ id: 'seq-1', steps: [{ fixtureId: f1.id, delayMs: 0 }, { fixtureId: f2.id, delayMs: 0 }] }, { timingMode: 'compressed', store, fetchImpl: fakeFetch });
  assert.deepEqual(order, ['http://127.0.0.1:4000/a', 'http://127.0.0.1:4000/b']);
  assert.equal(run.overallStatus, 'ok');
  assert.equal(run.steps.length, 2);
  assert.equal(run.sequenceId, 'seq-1');
});

test('replaySequence as-recorded respects recorded delays', async () => {
  const store = new FixtureStore();
  const f1 = store.save({ name: 'one', url: 'http://127.0.0.1:4000/a', body: {} });
  const f2 = store.save({ name: 'two', url: 'http://127.0.0.1:4000/b', body: {} });
  const stamps = [];
  const fakeFetch = async () => {
    stamps.push(Date.now());
    return { status: 200, ok: true, text: async () => 'ok' };
  };
  await replaySequence({ id: 'seq-2', steps: [{ fixtureId: f1.id, delayMs: 0 }, { fixtureId: f2.id, delayMs: 80 }] }, { timingMode: 'as-recorded', store, fetchImpl: fakeFetch });
  assert.ok(stamps[1] - stamps[0] >= 60, `expected >=60ms gap, got ${stamps[1] - stamps[0]}`);
});

test('replaySequence accelerated scales recorded delays down', async () => {
  const store = new FixtureStore();
  const f1 = store.save({ name: 'one', url: 'http://127.0.0.1:4000/a', body: {} });
  const f2 = store.save({ name: 'two', url: 'http://127.0.0.1:4000/b', body: {} });
  const stamps = [];
  const fakeFetch = async () => {
    stamps.push(Date.now());
    return { status: 200, ok: true, text: async () => 'ok' };
  };
  await replaySequence({ id: 'seq-3', steps: [{ fixtureId: f1.id, delayMs: 0 }, { fixtureId: f2.id, delayMs: 240 }] }, { timingMode: 'accelerated', speed: 4, store, fetchImpl: fakeFetch });
  const gap = stamps[1] - stamps[0];
  assert.ok(gap >= 20, `expected >=20ms gap, got ${gap}`);
  assert.ok(gap < 140, `expected scaled gap <140ms, got ${gap}`);
});

test('replaySequence overlap fires steps concurrently', async () => {
  const store = new FixtureStore();
  const fixtures = ['a', 'b', 'c'].map(n => store.save({ name: n, url: 'http://127.0.0.1:4000/' + n, body: {} }));
  const stamps = [];
  const fakeFetch = async () => {
    stamps.push(Date.now());
    return { status: 200, ok: true, text: async () => 'ok' };
  };
  const steps = fixtures.map(f => ({ fixtureId: f.id, delayMs: 300 }));
  const run = await replaySequence({ id: 'seq-4', steps }, { timingMode: 'overlap', jitterMs: 0, store, fetchImpl: fakeFetch });
  assert.equal(run.steps.length, 3);
  assert.ok(run.durationMs < 200, `overlap run should finish quickly, took ${run.durationMs}ms`);
  const spread = Math.max(...stamps) - Math.min(...stamps);
  assert.ok(spread < 50, `steps should fire near-simultaneously, spread ${spread}ms`);
});

test('replaySequence isolates per-step failures', async () => {
  const store = new FixtureStore();
  const bad = store.save({ name: 'bad', url: 'http://evil.com/x', body: {} });
  const good = store.save({ name: 'good', url: 'http://127.0.0.1:4000/ok', body: {} });
  const fakeFetch = async () => ({ status: 200, ok: true, text: async () => 'ok' });
  const run = await replaySequence({ id: 'seq-5', steps: [{ fixtureId: bad.id, delayMs: 0 }, { fixtureId: good.id, delayMs: 0 }] }, { timingMode: 'compressed', store, fetchImpl: fakeFetch });
  assert.equal(run.steps[0].result.ok, false);
  assert.match(run.steps[0].result.error, /loopback/);
  assert.equal(run.steps[1].result.ok, true);
  assert.equal(run.overallStatus, 'partial');
});

test('RecordingSession finalize creates fixtures with recorded deltas', async () => {
  const store = new FixtureStore();
  const session = new RecordingSession({ store });
  session.capture('POST', { 'x-hub-signature': 'sig1', 'content-type': 'application/json' }, { event: 'a' });
  await new Promise(r => setTimeout(r, 15));
  session.capture('POST', { 'x-hub-signature': 'sig2' }, { event: 'b' });
  const { fixtures, steps, warnings } = session.finalize({ sequenceName: 'Demo flow' });
  assert.equal(fixtures.length, 2);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].delayMs, 0);
  assert.ok(steps[1].delayMs >= 5, `expected recorded delta >=5ms, got ${steps[1].delayMs}`);
  assert.equal(store.get(fixtures[0].id).headers['x-hub-signature'], 'sig1');
  assert.ok(Array.isArray(warnings));
  assert.equal(store.list().length, 2);
});

import http from 'node:http';

function startServer(dataDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['server.js'], {
      cwd: path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
      stdio: 'pipe',
      env: { ...process.env, DATA_FILE: path.join(dataDir, 'hookledger.json') }
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('server failed to start within 15s; is port 3000 already in use?'));
    }, 15000);
    child.stdout.on('data', (data) => {
      if (data.toString().includes('running at')) {
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error('server spawn failed: ' + err.message));
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error('server exited unexpectedly with code ' + code));
    });
  });
}

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new globalThis.URL(url);
    const req = http.request({ hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, ok: res.statusCode < 400, headers: res.headers, json: () => JSON.parse(body || '{}'), text: () => body }));
    });
    if (options.body) req.write(options.body);
    req.on('error', reject);
    req.end();
  });
}

let serverProcess;
let BASE;
let testDataDir;
let echoServer;
let echoPort;
let echoRequests = [];

function startEcho() {
  return new Promise(resolve => {
    echoRequests = [];
    echoServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        echoRequests.push({ method: req.method, url: req.url, headers: req.headers, body });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, method: req.method, url: req.url, body }));
      });
    });
    echoServer.listen(0, '127.0.0.1', () => {
      echoPort = echoServer.address().port;
      resolve();
    });
  });
}

test.before(async () => {
  testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hookledger-test-'));
  serverProcess = await startServer(testDataDir);
  BASE = 'http://localhost:3000';
  await startEcho();
  await new Promise(r => setTimeout(r, 500));
});

test.after(() => {
  if (serverProcess) serverProcess.kill();
  if (echoServer) echoServer.close();
  if (testDataDir) {
    try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch {}
  }
});

test('GET / returns HTML', async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  assert.match(res.text(), /HookLedger/);
});

test('GET /workspace returns workspace page', async () => {
  const res = await fetch(`${BASE}/workspace`);
  assert.equal(res.status, 200);
  const html = res.text();
  assert.match(html, /HookLedger fixture lab/);
  assert.match(html, /searchInput/);
  assert.match(html, /responseModal/);
  assert.match(html, /public\/app\.js/);
  assert.match(html, /public\/style\.css/);
  assert.match(html, /formTitle/);
  assert.doesNotMatch(html, /onclick="/, 'workspace page must not contain inline onclick handlers');
  assert.doesNotMatch(html, /oninput="/, 'workspace page must not contain inline oninput handlers');
});

test('HTML responses include CSP without unsafe-inline for scripts', async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  const csp = res.headers['content-security-policy'];
  assert.ok(csp, 'CSP header must be set');
  assert.doesNotMatch(csp, /script-src.*unsafe-inline/, 'CSP must not allow unsafe-inline scripts');
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

test('PUT /api/fixtures/:id updates fixture', async () => {
  const createRes = await fetch(`${BASE}/api/fixtures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'to-update', url: 'http://localhost:3001/hook', body: { a: 1 } })
  });
  const { fixture } = await createRes.json();
  const putRes = await fetch(`${BASE}/api/fixtures/${fixture.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'updated-name', url: 'http://localhost:3002/hook', method: 'PATCH', body: { b: 2 } })
  });
  assert.equal(putRes.status, 200);
  const { fixture: updated } = await putRes.json();
  assert.equal(updated.name, 'updated-name');
  assert.equal(updated.method, 'PATCH');
  assert.equal(updated.id, fixture.id);
});

test('PUT /api/fixtures/:id returns 404 for nonexistent', async () => {
  const res = await fetch(`${BASE}/api/fixtures/nonexistent-id-99999`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'x', body: {} })
  });
  assert.equal(res.status, 404);
});

test('PATCH /api/fixtures/:id partially updates fixture', async () => {
  const createRes = await fetch(`${BASE}/api/fixtures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'patch-test', url: 'http://localhost:3001/hook', body: { a: 1 } })
  });
  const { fixture } = await createRes.json();
  const patchRes = await fetch(`${BASE}/api/fixtures/${fixture.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'patched-name' })
  });
  assert.equal(patchRes.status, 200);
  const { fixture: patched } = await patchRes.json();
  assert.equal(patched.name, 'patched-name');
  assert.equal(patched.url, 'http://localhost:3001/hook');
  assert.equal(patched.id, fixture.id);
});

test('GET /public/style.css returns CSS file', async () => {
  const res = await fetch(`${BASE}/public/style.css`);
  assert.equal(res.status, 200);
  const text = res.text();
  assert.match(text, /--bg/);
});

test('GET /public/app.js returns valid client JS', async () => {
  const res = await fetch(`${BASE}/public/app.js`);
  assert.equal(res.status, 200);
  const text = res.text();
  assert.match(text, /function escapeHtml/);
  assert.match(text, /function editFixture/);
  assert.match(text, /function load/);
  assert.match(text, /function save/);
  assert.match(text, /function replay/);
  assert.match(text, /function renderFixtures/);
  assert.match(text, /function renderHistory/);
  assert.match(text, /fixtures\.addEventListener/);
  assert.doesNotThrow(() => new Function(text), 'app.js must be parseable as valid JavaScript');
});

test('POST /api/fixtures with invalid JSON returns 400', async () => {
  const res = await fetch(`${BASE}/api/fixtures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{invalid json'
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Invalid JSON/);
});

test('GET /api/export returns valid export payload', async () => {
  const res = await fetch(`${BASE}/api/export`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.product, 'HookLedger');
  assert.ok(Array.isArray(data.fixtures));
  assert.ok(Array.isArray(data.replays));
});

test('POST /api/import imports fixtures', async () => {
  const res = await fetch(`${BASE}/api/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fixtures: [{ name: 'imported-via-test', url: 'http://localhost:3001/hook', body: { ok: true } }] })
  });
  assert.equal(res.status, 200);
  const { imported, warnings } = await res.json();
  assert.equal(imported.length, 1);
  assert.equal(imported[0].name, 'imported-via-test');
  assert.ok(Array.isArray(warnings));
});

test('POST /api/redact returns redacted payload', async () => {
  const res = await fetch(`${BASE}/api/redact`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'test', headers: { authorization: 'Bearer secret' } })
  });
  assert.equal(res.status, 200);
  const { redacted } = await res.json();
  assert.equal(redacted.headers.authorization, '[REDACTED]');
  assert.equal(redacted.name, 'test');
});

test('POST /api/replay with non-loopback target returns 400', async () => {
  const createRes = await fetch(`${BASE}/api/fixtures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'ssrf-test', url: 'http://evil.com/hook', body: {} })
  });
  const { fixture } = await createRes.json();
  const res = await fetch(`${BASE}/api/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: fixture.id, targetUrl: 'http://evil.com/hook' })
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /loopback/);
});

async function createFixture(name, url) {
  const res = await fetch(`${BASE}/api/fixtures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, url, body: {} })
  });
  const { fixture } = await res.json();
  return fixture.id;
}

async function createSequence(name, steps) {
  const res = await fetch(`${BASE}/api/sequences`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, steps })
  });
  const { sequence } = await res.json();
  return sequence.id;
}

test('GET /api/fixtures/:id returns redacted secrets', async () => {
  const createRes = await fetch(`${BASE}/api/fixtures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'redacted-get', url: 'http://localhost:3001/hook', headers: { authorization: 'Bearer topsecret' }, body: { token: 'abc' } })
  });
  const { fixture } = await createRes.json();
  const getRes = await fetch(`${BASE}/api/fixtures/${fixture.id}`);
  const { fixture: fetched } = await getRes.json();
  assert.equal(fetched.headers.authorization, '[REDACTED]');
  assert.equal(fetched.body.token, '[REDACTED]');
  assert.equal(fetched.id, fixture.id);
});

test('PUT preserves [REDACTED] secrets and replay sends real values', async () => {
  echoRequests.length = 0;
  const createRes = await fetch(`${BASE}/api/fixtures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'preserve-test', url: `http://127.0.0.1:${echoPort}/hook`, headers: { authorization: 'Bearer real-secret' }, body: { event: 'demo' } })
  });
  const { fixture } = await createRes.json();
  const putRes = await fetch(`${BASE}/api/fixtures/${fixture.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'preserve-renamed', url: `http://127.0.0.1:${echoPort}/hook`, headers: { authorization: '[REDACTED]' }, body: { event: 'demo' } })
  });
  assert.equal(putRes.status, 200);
  const { fixture: saved } = await putRes.json();
  assert.equal(saved.name, 'preserve-renamed');
  assert.equal(saved.headers.authorization, '[REDACTED]', 'response itself stays redacted');
  const replayRes = await fetch(`${BASE}/api/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: fixture.id })
  });
  assert.equal(replayRes.status, 200);
  assert.equal(echoRequests.length, 1);
  assert.equal(echoRequests[0].headers.authorization, 'Bearer real-secret', 'replay must send the real preserved secret');
});

test('sequence CRUD via API', async () => {
  const fx = await createFixture('seq-crud-fx', `http://127.0.0.1:${echoPort}/hook`);
  const postRes = await fetch(`${BASE}/api/sequences`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'crud-flow', steps: [{ fixtureId: fx, delayMs: 10 }] })
  });
  assert.equal(postRes.status, 201);
  const { sequence } = await postRes.json();
  assert.equal(sequence.name, 'crud-flow');
  assert.equal(sequence.steps[0].fixture.id, fx, 'step embeds fixture info');
  const listRes = await fetch(`${BASE}/api/sequences`);
  const { sequences } = await listRes.json();
  assert.ok(sequences.some(s => s.id === sequence.id));
  const getRes = await fetch(`${BASE}/api/sequences/${sequence.id}`);
  assert.equal((await getRes.json()).sequence.name, 'crud-flow');
  const putRes = await fetch(`${BASE}/api/sequences/${sequence.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'crud-renamed', steps: [{ fixtureId: fx, delayMs: 5 }] })
  });
  assert.equal(putRes.status, 200);
  assert.equal((await putRes.json()).sequence.name, 'crud-renamed');
  const patchRes = await fetch(`${BASE}/api/sequences/${sequence.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: 'a note' })
  });
  assert.equal((await patchRes.json()).sequence.description, 'a note');
  const delRes = await fetch(`${BASE}/api/sequences/${sequence.id}`, { method: 'DELETE' });
  assert.equal((await delRes.json()).deleted, true);
});

test('POST /api/sequences requires an existing fixture per step', async () => {
  const res = await fetch(`${BASE}/api/sequences`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'bad-flow', steps: [{ fixtureId: 'nope', delayMs: 0 }] })
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /missing fixture/);
});

test('sequence replay runs steps in order with compressed timing', async () => {
  echoRequests.length = 0;
  const fx1 = await createFixture('order-fx-a', `http://127.0.0.1:${echoPort}/a`);
  const fx2 = await createFixture('order-fx-b', `http://127.0.0.1:${echoPort}/b`);
  const seq = await createSequence('order-flow', [{ fixtureId: fx1, delayMs: 0 }, { fixtureId: fx2, delayMs: 0 }]);
  const replayRes = await fetch(`${BASE}/api/sequences/${seq}/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ timingMode: 'compressed' })
  });
  assert.equal(replayRes.status, 200);
  const { run } = await replayRes.json();
  assert.equal(run.overallStatus, 'ok');
  assert.equal(run.steps.length, 2);
  assert.equal(run.sequenceName, 'order-flow');
  assert.equal(run.timingMode, 'compressed');
  assert.equal(echoRequests.length, 2);
  assert.equal(echoRequests[0].url, '/a');
  assert.equal(echoRequests[1].url, '/b');
});

test('sequence replay supports target URL override', async () => {
  echoRequests.length = 0;
  const fx = await createFixture('override-fx', '');
  const seq = await createSequence('override-flow', [{ fixtureId: fx, delayMs: 0 }]);
  const replayRes = await fetch(`${BASE}/api/sequences/${seq}/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ timingMode: 'compressed', targetUrl: `http://127.0.0.1:${echoPort}/hook` })
  });
  assert.equal(replayRes.status, 200);
  const { run } = await replayRes.json();
  assert.equal(run.overallStatus, 'ok');
  assert.equal(echoRequests.length, 1);
});

test('sequence replay rejects unknown timing modes and bad numeric options', async () => {
  const fx = await createFixture('tm-fx', `http://127.0.0.1:${echoPort}/hook`);
  const seq = await createSequence('tm-flow', [{ fixtureId: fx, delayMs: 0 }]);
  const badMode = await fetch(`${BASE}/api/sequences/${seq}/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ timingMode: 'instant' })
  });
  assert.equal(badMode.status, 400);
  const badSpeed = await fetch(`${BASE}/api/sequences/${seq}/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ timingMode: 'accelerated', speed: 0 })
  });
  assert.equal(badSpeed.status, 400);
  const badTarget = await fetch(`${BASE}/api/sequences/${seq}/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ timingMode: 'compressed', targetUrl: 'http://evil.com/x' })
  });
  assert.equal(badTarget.status, 400);
});

test('sequence replay returns 404 for missing sequence', async () => {
  const res = await fetch(`${BASE}/api/sequences/nonexistent/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ timingMode: 'compressed' })
  });
  assert.equal(res.status, 404);
});

test('sequence replay runs assertions and records pass/fail', async () => {
  echoRequests.length = 0;
  const fx = await createFixture('assert-fx', `http://127.0.0.1:${echoPort}/hook`);
  const seq = await createSequence('assert-flow', [{
    fixtureId: fx,
    delayMs: 0,
    assertion: { url: `http://127.0.0.1:${echoPort}/state`, jsonPath: 'ok', expectedValue: true, timeoutMs: 3000, pollIntervalMs: 100 }
  }]);
  const replayRes = await fetch(`${BASE}/api/sequences/${seq}/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ timingMode: 'compressed' })
  });
  assert.equal(replayRes.status, 200);
  const { run } = await replayRes.json();
  assert.equal(run.steps[0].assertionResult.passed, true);
  assert.equal(run.overallStatus, 'ok');
});

test('sequence replay records assertion failure with last observed value', async () => {
  const fx = await createFixture('assert-fail-fx', `http://127.0.0.1:${echoPort}/hook`);
  const seq = await createSequence('assert-fail-flow', [{
    fixtureId: fx,
    delayMs: 0,
    assertion: { url: `http://127.0.0.1:${echoPort}/state`, jsonPath: 'ok', expectedValue: false, timeoutMs: 300, pollIntervalMs: 50 }
  }]);
  const replayRes = await fetch(`${BASE}/api/sequences/${seq}/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ timingMode: 'compressed' })
  });
  const { run } = await replayRes.json();
  assert.equal(run.steps[0].assertionResult.passed, false);
  assert.equal(run.steps[0].assertionResult.value, true);
  assert.equal(run.overallStatus, 'failed');
});

test('recording flow captures real events into a sequence', async () => {
  const seq = await createSequence('rec-flow', []);
  const startRes = await fetch(`${BASE}/api/sequences/${seq}/record/start`, { method: 'POST' });
  assert.equal(startRes.status, 200);
  const { sessionId, ingestUrl } = await startRes.json();
  assert.equal(sessionId, seq);
  assert.match(ingestUrl, /\/api\/record\//);
  const capRes = await fetch(ingestUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature': 'sig_123' },
    body: JSON.stringify({ event: 'order.created', id: 42 })
  });
  assert.equal(capRes.status, 200);
  const countRes = await fetch(`${BASE}/api/record/${seq}`);
  assert.equal((await countRes.json()).captured, 1);
  const stopRes = await fetch(`${BASE}/api/sequences/${seq}/record/stop`, { method: 'POST' });
  assert.equal(stopRes.status, 200);
  const { sequence } = await stopRes.json();
  assert.equal(sequence.steps.length, 1);
  const fixturesRes = await fetch(`${BASE}/api/fixtures`);
  const { fixtures } = await fixturesRes.json();
  const captured = fixtures.find(f => f.name.includes('rec-flow'));
  assert.ok(captured, 'captured fixture should exist after stop');
  assert.equal(captured.headers['x-hub-signature'], '[REDACTED]');
});

test('record/start while active returns 409 and stop twice returns 404', async () => {
  const seq = await createSequence('dup-rec', []);
  await fetch(`${BASE}/api/sequences/${seq}/record/start`, { method: 'POST' });
  const second = await fetch(`${BASE}/api/sequences/${seq}/record/start`, { method: 'POST' });
  assert.equal(second.status, 409);
  await fetch(`${BASE}/api/sequences/${seq}/record/stop`, { method: 'POST' });
  const third = await fetch(`${BASE}/api/sequences/${seq}/record/stop`, { method: 'POST' });
  assert.equal(third.status, 404);
});

test('GET /api/sequence-runs lists runs with sequence names', async () => {
  const res = await fetch(`${BASE}/api/sequence-runs`);
  const { runs } = await res.json();
  assert.ok(Array.isArray(runs));
  assert.ok(runs.some(r => r.sequenceName && r.sequenceName.length > 0));
});

test('POST /api/replay returns 429 after exceeding rate limit', async () => {
  for (let i = 0; i < 11; i++) {
    await fetch(`${BASE}/api/replay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'nonexistent-replay-target' })
    });
  }
  const res = await fetch(`${BASE}/api/replay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'nonexistent-replay-target' })
  });
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.match(body.error, /Too many/);
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

test('POST /api/fixtures with wrong Content-Type returns 415', async () => {
  const res = await fetch(`${BASE}/api/fixtures`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ name: 'test', body: {} })
  });
  assert.equal(res.status, 415);
  const body = await res.json();
  assert.match(body.error, /Content-Type must be application\/json/);
});

test('PUT /api/fixtures/:id with wrong Content-Type returns 415', async () => {
  const res = await fetch(`${BASE}/api/fixtures/nonexistent-id`, {
    method: 'PUT',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ name: 'test', body: {} })
  });
  assert.equal(res.status, 415);
});

test('PATCH /api/fixtures/:id with wrong Content-Type returns 415', async () => {
  const res = await fetch(`${BASE}/api/fixtures/nonexistent-id`, {
    method: 'PATCH',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ name: 'test' })
  });
  assert.equal(res.status, 415);
});

test('POST /api/replay with wrong Content-Type returns 415', async () => {
  const res = await fetch(`${BASE}/api/replay`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ id: 'test' })
  });
  assert.equal(res.status, 415);
});

test('responses include Content-Length header', async () => {
  const res = await fetch(`${BASE}/`);
  assert.ok(res.headers['content-length'] !== undefined);
  assert.ok(Number(res.headers['content-length']) > 0);
});

test('GET /public/style.css returns correct MIME type', async () => {
  const res = await fetch(`${BASE}/public/style.css`);
  assert.equal(res.status, 200);
  assert.ok(res.headers['content-type'].includes('text/css'));
});

test('GET /public/app.js returns correct MIME type', async () => {
  const res = await fetch(`${BASE}/public/app.js`);
  assert.equal(res.status, 200);
  assert.ok(res.headers['content-type'].includes('application/javascript'));
});

test('GET nonexistent static file returns 404', async () => {
  const res = await fetch(`${BASE}/public/nope.xyz`);
  assert.equal(res.status, 404);
});
