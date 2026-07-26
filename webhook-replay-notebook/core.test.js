import test from 'node:test';
import assert from 'node:assert/strict';
import { FixtureStore, redact, replayFixture } from './core.js';

test('redacts secret-like fields recursively', () => {
  const result = redact({
    Authorization: 'Bearer live_secret',
    nested: { token: 'abc', safe: 'ok' },
    array: [{ password: 'pw' }]
  });
  assert.equal(result.Authorization, '[REDACTED]');
  assert.equal(result.nested.token, '[REDACTED]');
  assert.equal(result.nested.safe, 'ok');
  assert.equal(result.array[0].password, '[REDACTED]');
});

test('saves and lists fixtures with redaction', () => {
  const store = new FixtureStore();
  const fixture = store.save({ name: 'Stripe payment succeeded', headers: { 'stripe-signature': 'sig' }, body: { id: 'evt_1' } });
  assert.equal(fixture.headers['stripe-signature'], '[REDACTED]');
  assert.equal(store.get(fixture.id).name, 'Stripe payment succeeded');
  assert.equal(store.list().length, 1);
});

test('requires a fixture name', () => {
  const store = new FixtureStore();
  assert.throws(() => store.save({ name: ' ' }), /Fixture name is required/);
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
