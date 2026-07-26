import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com',
  'throwawaymail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'trashmail.com', 'mintemail.com'
]);

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function validateCustomerIdentity({ name, email }) {
  const cleanName = String(name || '').trim();
  const cleanEmail = normalizeEmail(email);
  if (!cleanName) throw new Error('Full name is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('A valid email address is required');
  const domain = cleanEmail.split('@')[1];
  if (DISPOSABLE_DOMAINS.has(domain)) throw new Error('Disposable or temporary email addresses are not allowed');
  return { name: cleanName, email: cleanEmail, domain };
}

export function getMachineFingerprint(seed = null) {
  const input = seed || [os.hostname(), os.platform(), os.arch(), os.userInfo().username, path.basename(os.homedir())].join('|');
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function createLicenseRequest(identity, machineHash = getMachineFingerprint()) {
  const clean = validateCustomerIdentity(identity);
  return {
    product: 'HookLedger',
    version: 1,
    name: clean.name,
    email: clean.email,
    machineHash,
    createdAt: new Date().toISOString(),
    note: 'Send this request blob to the seller after purchase so they can issue a machine-bound license.'
  };
}

export function signLicensePayload(payload, privateKeyPem) {
  const body = canonicalize({ ...payload, signature: undefined });
  const signature = crypto.sign(null, Buffer.from(body), privateKeyPem).toString('base64');
  return { ...payload, signature };
}

export function verifyLicensePayload(payload, publicKeyPem, machineHash = getMachineFingerprint()) {
  if (!payload || typeof payload !== 'object') throw new Error('License payload is missing');
  const { signature, ...unsigned } = payload;
  if (!signature) throw new Error('License signature is missing');
  if (unsigned.product !== 'HookLedger') throw new Error('License product mismatch');
  if (unsigned.machineHash !== machineHash) throw new Error('This license was issued for a different computer');
  const body = canonicalize(unsigned);
  const valid = crypto.verify(null, Buffer.from(body), publicKeyPem, Buffer.from(signature, 'base64'));
  if (!valid) throw new Error('License signature is invalid');
  return { valid: true, license: unsigned };
}

export class LicenseManager {
  constructor({ publicKeyPem, licenseFile, machineHash } = {}) {
    this.publicKeyPem = publicKeyPem;
    this.licenseFile = licenseFile;
    this.machineHash = machineHash || getMachineFingerprint();
  }

  status() {
    if (!this.publicKeyPem) return { active: false, reason: 'No public verification key configured', machineHash: this.machineHash };
    if (!this.licenseFile || !fs.existsSync(this.licenseFile)) return { active: false, reason: 'No activated license installed', machineHash: this.machineHash };
    try {
      const payload = JSON.parse(fs.readFileSync(this.licenseFile, 'utf8'));
      const verified = verifyLicensePayload(payload, this.publicKeyPem, this.machineHash);
      return { active: true, machineHash: this.machineHash, license: verified.license };
    } catch (error) {
      return { active: false, reason: error.message, machineHash: this.machineHash };
    }
  }

  activate(licenseText) {
    const payload = typeof licenseText === 'string' ? JSON.parse(licenseText) : licenseText;
    const verified = verifyLicensePayload(payload, this.publicKeyPem, this.machineHash);
    fs.mkdirSync(path.dirname(this.licenseFile), { recursive: true });
    fs.writeFileSync(this.licenseFile, JSON.stringify(payload, null, 2));
    return { active: true, license: verified.license, machineHash: this.machineHash };
  }

  createRequest(identity) {
    return createLicenseRequest(identity, this.machineHash);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
