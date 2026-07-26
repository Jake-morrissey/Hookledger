import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { FixtureStore, redact, replayFixture, validateHttpUrl } from './core.js';
import { LicenseManager, createLicenseRequest, signLicensePayload, validateCustomerIdentity, verifyLicensePayload } from './license.js';

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

test('blocks disposable email domains', () => {
  assert.throws(() => validateCustomerIdentity({ name: 'Temp User', email: 'temp@mailinator.com' }), /temporary email/);
  assert.equal(validateCustomerIdentity({ name: 'Real User', email: 'real@example.com' }).email, 'real@example.com');
});

test('creates machine-bound license requests', () => {
  const request = createLicenseRequest({ name: 'Real User', email: 'real@example.com' }, 'machine-123');
  assert.equal(request.machineHash, 'machine-123');
  assert.equal(request.product, 'HookLedger');
});

test('signs and verifies license payloads', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const signed = signLicensePayload({ product: 'HookLedger', purchaserEmail: 'real@example.com', machineHash: 'machine-123', issuedAt: '2026-07-26T00:00:00.000Z' }, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const verified = verifyLicensePayload(signed, publicKey.export({ type: 'spki', format: 'pem' }), 'machine-123');
  assert.equal(verified.valid, true);
  assert.equal(verified.license.purchaserEmail, 'real@example.com');
  assert.throws(() => verifyLicensePayload(signed, publicKey.export({ type: 'spki', format: 'pem' }), 'machine-999'), /different computer/);
});

test('license manager activates and reports active state', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hookledger-license-'));
  const licenseFile = path.join(dir, 'license.json');
  const manager = new LicenseManager({ publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }), licenseFile, machineHash: 'machine-123' });
  const signed = signLicensePayload({ product: 'HookLedger', purchaserEmail: 'real@example.com', purchaserName: 'Real User', machineHash: 'machine-123', issuedAt: '2026-07-26T00:00:00.000Z' }, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const activated = manager.activate(JSON.stringify(signed));
  assert.equal(activated.active, true);
  assert.equal(manager.status().active, true);
});
