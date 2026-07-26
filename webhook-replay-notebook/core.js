import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SECRET_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'api_key',
  'apikey',
  'token',
  'secret',
  'password',
  'client_secret',
  'stripe-signature'
]);

const ALLOWED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class FixtureStore {
  constructor(options = {}) {
    this.dataFile = options.dataFile || null;
    this.fixtures = new Map();
    this.replays = [];
    if (this.dataFile) this.load();
  }

  load() {
    if (!this.dataFile || !fs.existsSync(this.dataFile)) return;
    const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8') || '{}');
    this.fixtures = new Map((data.fixtures || []).map((fixture) => [fixture.id, fixture]));
    this.replays = data.replays || [];
  }

  persist() {
    if (!this.dataFile) return;
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
    fs.writeFileSync(this.dataFile, JSON.stringify(this.exportData(), null, 2));
  }

  save(input) {
    const name = String(input?.name ?? '').trim();
    if (!name) throw new Error('Fixture name is required');
    const url = String(input?.url ?? '').trim();
    if (url) validateHttpUrl(url);
    const method = String(input?.method ?? 'POST').toUpperCase();
    if (!ALLOWED_METHODS.has(method)) throw new Error(`Method must be one of ${[...ALLOWED_METHODS].join(', ')}`);
    const now = new Date().toISOString();
    const existing = input?.id ? this.fixtures.get(input.id) : null;
    const fixture = {
      id: input?.id || crypto.randomUUID(),
      name,
      url,
      method,
      headers: redact(input?.headers ?? {}),
      body: redact(input?.body ?? {}),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    this.fixtures.set(fixture.id, fixture);
    this.persist();
    return fixture;
  }

  importFixtures(fixtures) {
    if (!Array.isArray(fixtures)) throw new Error('Import payload must include a fixtures array');
    const imported = fixtures.map((fixture) => this.save({ ...fixture, id: fixture.id || crypto.randomUUID() }));
    return imported;
  }

  list() {
    return [...this.fixtures.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id) {
    const fixture = this.fixtures.get(id);
    if (!fixture) throw new Error('Fixture not found');
    return fixture;
  }

  delete(id) {
    const deleted = this.fixtures.delete(id);
    this.persist();
    return deleted;
  }

  logReplay(entry) {
    const replay = { id: crypto.randomUUID(), at: new Date().toISOString(), ...entry };
    this.replays.unshift(replay);
    this.replays = this.replays.slice(0, 100);
    this.persist();
    return replay;
  }

  history() {
    return this.replays;
  }

  exportData() {
    return { product: 'HookLedger', version: 1, fixtures: this.list(), replays: this.replays };
  }
}

export function validateHttpUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Target URL must be a valid http:// or https:// URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Target URL must be a valid http:// or https:// URL');
  return parsed;
}

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      const normalized = key.toLowerCase().replaceAll('-', '_');
      if (SECRET_KEYS.has(normalized) || SECRET_KEYS.has(key.toLowerCase())) return [key, '[REDACTED]'];
      return [key, redact(nested)];
    })
  );
}

export async function replayFixture(fixture, targetUrl = fixture.url, fetchImpl = fetch) {
  if (!targetUrl) throw new Error('Target URL is required');
  validateHttpUrl(targetUrl);
  const response = await fetchImpl(targetUrl, {
    method: fixture.method || 'POST',
    headers: { 'content-type': 'application/json', ...(fixture.headers || {}) },
    body: JSON.stringify(fixture.body ?? {})
  });
  const text = await response.text();
  return { status: response.status, ok: response.ok, body: text.slice(0, 5000) };
}
