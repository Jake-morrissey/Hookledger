import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FixtureStore, redact, replayFixture, validateHttpUrl } from './core.js';

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
