import fs from 'node:fs';

const privateKeyPem = fs.readFileSync(new URL('./private/license-private.pem', import.meta.url), 'utf8');

const requestArg = process.argv[2];
if (!requestArg) {
  console.error('Usage: node issue-license.mjs "{...request json...}"');
  process.exit(1);
}

const request = JSON.parse(requestArg);
const { signLicensePayload } = await import('./license.js');
const payload = signLicensePayload({
  product: 'HookLedger',
  version: 1,
  plan: 'one-time',
  purchaserName: request.name,
  purchaserEmail: request.email,
  machineHash: request.machineHash,
  issuedAt: new Date().toISOString()
}, privateKeyPem);

console.log(JSON.stringify(payload, null, 2));
