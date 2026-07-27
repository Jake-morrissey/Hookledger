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
    return fixtures.map((fixture) => this.save({ ...fixture, id: fixture.id || crypto.randomUUID() }));
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
    if (deleted) this.persist();
    return deleted;
  }

  logReplay(entry) {
    this.replays.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry });
    if (this.replays.length > 100) this.replays.length = 100;
    this.persist();
    return this.replays[0];
  }

  history() {
    return this.replays;
  }

  exportData() {
    return { product: 'HookLedger', version: 1, fixtures: this.list(), replays: this.replays };
  }
}

export function validateHttpUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Target URL must be a valid http:// or https:// URL');
    }
    return parsed;
  } catch (err) {
    if (err.message.includes('http')) throw err;
    throw new Error('Target URL must be a valid http:// or https:// URL');
  }
}

export function redact(value, debug = false) {
  if (Array.isArray(value)) return value.map(v => redact(v, debug));
  if (!value || typeof value !== 'object') return value;
  
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      const normalized = key.toLowerCase().replaceAll('-', '_');
      const isSecret = SECRET_KEYS.has(normalized) || SECRET_KEYS.has(key.toLowerCase());
      if (isSecret) {
        return [key, debug ? { value: '[REDACTED]', reason: 'secret-field' } : '[REDACTED]'];
      }
      return [key, redact(nested, debug)];
    })
  );
}

export async function replayFixture(fixture, targetUrl = fixture.url, fetchImpl = fetch) {
  if (!targetUrl) throw new Error('Target URL is required');
  validateHttpUrl(targetUrl);
  
  try {
    const response = await fetchImpl(targetUrl, {
      method: fixture.method || 'POST',
      headers: { 'content-type': 'application/json', ...(fixture.headers || {}) },
      body: JSON.stringify(fixture.body ?? {})
    });
    const text = await response.text();
    const truncated = text.length > 5000;
    return { 
      status: response.status, 
      ok: response.ok, 
      body: truncated ? text.slice(0, 5000) : text,
      truncated,
      error: null
    };
  } catch (err) {
    const errorMsg = err instanceof TypeError 
      ? `Connection failed: ${err.message}. Check that the target URL is reachable.`
      : `Replay failed: ${err.message}`;
    return { 
      status: null, 
      ok: false, 
      body: null,
      error: errorMsg
    };
  }
}
