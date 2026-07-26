import crypto from 'node:crypto';

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

export class FixtureStore {
  constructor() {
    this.fixtures = new Map();
    this.replays = [];
  }

  save(input) {
    const name = String(input?.name ?? '').trim();
    if (!name) throw new Error('Fixture name is required');
    const url = String(input?.url ?? '').trim();
    const method = String(input?.method ?? 'POST').toUpperCase();
    const fixture = {
      id: input?.id || crypto.randomUUID(),
      name,
      url,
      method,
      headers: redact(input?.headers ?? {}),
      body: redact(input?.body ?? {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.fixtures.set(fixture.id, fixture);
    return fixture;
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
    return this.fixtures.delete(id);
  }

  logReplay(entry) {
    const replay = { id: crypto.randomUUID(), at: new Date().toISOString(), ...entry };
    this.replays.unshift(replay);
    this.replays = this.replays.slice(0, 100);
    return replay;
  }

  history() {
    return this.replays;
  }
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
  const response = await fetchImpl(targetUrl, {
    method: fixture.method || 'POST',
    headers: { 'content-type': 'application/json', ...(fixture.headers || {}) },
    body: JSON.stringify(fixture.body ?? {})
  });
  const text = await response.text();
  return { status: response.status, ok: response.ok, body: text.slice(0, 5000) };
}
