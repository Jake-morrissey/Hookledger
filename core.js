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
  'stripe-signature',
  'x-hub-signature',
  'x-hub-signature-256',
  'x-shopify-hmac-sha256',
  'x-webhook-signature'
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
    try {
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8') || '{}');
      const entries = [];
      const seenIds = new Set();
      for (const fixture of (data.fixtures || [])) {
        if (!fixture.id) {
          console.warn('load: skipping fixture without id:', fixture.name || '<unknown>');
          continue;
        }
        if (seenIds.has(fixture.id)) {
          console.warn('load: skipping duplicate id:', fixture.id, fixture.name || '<unknown>');
          continue;
        }
        seenIds.add(fixture.id);
        entries.push([fixture.id, fixture]);
      }
      this.fixtures = new Map(entries);
      this.replays = data.replays || [];
    } catch (err) {
      console.error(`Corrupted data file, backing up and starting fresh: ${err.message}`);
      const backup = this.dataFile + '.bak.' + Date.now() + '.' + crypto.randomUUID().slice(0, 8);
      try { fs.copyFileSync(this.dataFile, backup); } catch {}
      this.fixtures = new Map();
      this.replays = [];
    }
  }

  persist() {
    if (!this.dataFile) return;
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
    const tmp = this.dataFile + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(this.exportData(), null, 2));
    fs.renameSync(tmp, this.dataFile);
  }

  save(input) {
    const name = String(input?.name ?? '').trim();
    if (!name) throw new Error('Fixture name is required');
    const url = String(input?.url ?? '').trim();
    if (url) validateHttpUrl(url);
    const method = String(input?.method ?? 'POST').toUpperCase();
    if (!ALLOWED_METHODS.has(method)) throw new Error(`Method must be one of ${[...ALLOWED_METHODS].join(', ')}`);
    if (input?.headers != null && (typeof input.headers !== 'object' || Array.isArray(input.headers))) {
      throw new Error('Fixture headers must be a plain object');
    }
    if (input?.body != null && (typeof input.body !== 'object' || Array.isArray(input.body))) {
      throw new Error('Fixture body must be a plain object');
    }
    const now = new Date().toISOString();
    const existing = input?.id ? this.fixtures.get(input.id) : null;
    const fixture = {
      id: input?.id || crypto.randomUUID(),
      name,
      url,
      method,
      headers: input?.headers ?? {},
      body: input?.body ?? {},
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    this.fixtures.set(fixture.id, fixture);
    try {
      this.persist();
    } catch (err) {
      this.fixtures.delete(fixture.id);
      throw err;
    }
    return fixture;
  }

  importFixtures(fixtures) {
    if (!Array.isArray(fixtures)) throw new Error('Import payload must include a fixtures array');
    const warnings = [];
    const seenIds = new Set();
    const validated = fixtures.map((fixture) => {
      const id = fixture.id || crypto.randomUUID();
      if (this.fixtures.has(id)) warnings.push(`Fixture "${fixture.name || id}" overwrites existing ID ${id}`);
      if (seenIds.has(id)) warnings.push(`Fixture "${fixture.name || id}" has duplicate ID ${id} within the same batch`);
      seenIds.add(id);
      const name = String(fixture?.name ?? '').trim();
      if (!name) throw new Error('Fixture name is required');
      const url = String(fixture?.url ?? '').trim();
      if (url) validateHttpUrl(url);
      const method = String(fixture?.method ?? 'POST').toUpperCase();
      if (!ALLOWED_METHODS.has(method)) throw new Error(`Method must be one of ${[...ALLOWED_METHODS].join(', ')}`);
      if (fixture.headers != null && (typeof fixture.headers !== 'object' || Array.isArray(fixture.headers))) {
        throw new Error('Fixture headers must be a plain object');
      }
      if (fixture.body != null && (typeof fixture.body !== 'object' || Array.isArray(fixture.body))) {
        throw new Error('Fixture body must be a plain object');
      }
      const now = new Date().toISOString();
      const existing = this.fixtures.get(id);
      return {
        id, name, url, method,
        headers: fixture?.headers ?? {},
        body: fixture?.body ?? {},
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
    });
    const written = new Set();
    for (const f of validated) {
      if (written.has(f.id)) continue;
      written.add(f.id);
      this.fixtures.set(f.id, f);
    }
    this.persist();
    return { imported: validated, warnings };
  }

  list() {
    return [...this.fixtures.values()].map(redactedFixture).sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id) {
    const fixture = this.fixtures.get(id);
    if (!fixture) throw new Error('Fixture not found');
    return fixture;
  }

  delete(id) {
    if (!this.fixtures.has(id)) return false;
    const fixture = this.fixtures.get(id);
    this.fixtures.delete(id);
    try {
      this.persist();
    } catch (err) {
      this.fixtures.set(id, fixture);
      throw err;
    }
    return true;
  }

  logReplay(entry) {
    const replay = { id: crypto.randomUUID(), at: new Date().toISOString(), ...entry };
    this.replays.unshift(replay);
    if (this.replays.length > 100) this.replays.length = 100;
    try {
      this.persist();
    } catch (err) {
      this.replays.shift();
      throw err;
    }
    return this.replays[0];
  }

  history() {
    return this.replays.map(r => structuredClone(r));
  }

  exportData() {
    return { product: 'HookLedger', version: 1, fixtures: this.list(), replays: this.replays.map(r => structuredClone(r)) };
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

export function validateReplayTarget(url) {
  const parsed = validateHttpUrl(url);
  const host = parsed.hostname;
  const isExplicitLoopback = host === 'localhost' || host === '::1' || host === '[::1]' || host === '0.0.0.0';
  const is127Prefix = host === '127.0.0.1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  const isLoopback = isExplicitLoopback || is127Prefix;
  if (!isLoopback) {
    throw new Error('Replay target must be a localhost/loopback address for safety');
  }
  return parsed;
}

export function redact(value, debug = false) {
  if (Array.isArray(value)) return value.map(v => redact(v, debug));
  if (!value || typeof value !== 'object') return value;
  
  const secretKeys = [...SECRET_KEYS].map(k => k.replaceAll('-', '_'));
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      const normalized = key.toLowerCase().replaceAll('-', '_');
      const isSecret = secretKeys.some(kn => {
        return normalized === kn ||
          normalized.endsWith('_' + kn) ||
          normalized.includes('_' + kn + '_');
      });
      if (isSecret) {
        return [key, debug ? { value: '[REDACTED]', reason: 'secret-field' } : '[REDACTED]'];
      }
      return [key, redact(nested, debug)];
    })
  );
}

export function redactedFixture(fixture) {
  return { ...fixture, headers: redact(fixture.headers ?? {}), body: redact(fixture.body ?? {}) };
}

export async function replayFixture(fixture, targetUrl = fixture.url, fetchImpl = fetch) {
  if (!targetUrl) throw new Error('Target URL is required');
  validateReplayTarget(targetUrl);
  
  const start = Date.now();
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
      durationMs: Date.now() - start,
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
      durationMs: Date.now() - start,
      error: errorMsg
    };
  }
}
