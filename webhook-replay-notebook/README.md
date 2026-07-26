# HookLedger

Save, redact, and replay webhook fixtures during development.

HookLedger is a local-first developer tool for testing webhook integrations without recreating the same Stripe, GitHub, Shopify, Clerk, or custom event by hand.

## What it does

- Paste a captured webhook payload and headers.
- Preview redaction before saving.
- Save named fixtures to a local JSON data file.
- Redact common secret-like fields before storage.
- Replay fixtures to a development endpoint.
- View request and response history.
- Import and export fixture JSON for backup or sharing.
- Validate method and target URL before replay.

## Guardrails

Do not paste production secrets or sensitive customer data. This MVP is local-first and has no payment, hosting, or account integration.

## Run

```bash
npm test
npm start
```

Open http://localhost:3000.

Data is stored at `data/hookledger.json` and is intentionally ignored by git.

## MVP completion scope

Completed local MVP:

- File-backed persistence
- Fixture CRUD
- Redaction preview
- Import/export
- Replay history
- Critical-path tests

Not included until later human checkpoints:

- Live Stripe/payment setup
- Hosted production deployment
- Legal document publishing
- Customer email or launch posting
- Paid ads or any budget spend
