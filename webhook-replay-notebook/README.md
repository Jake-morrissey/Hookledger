# Webhook Replay Notebook

Local-first MVP for saving, editing, and replaying webhook fixtures during development.

## What it does

- Paste a captured webhook payload and headers.
- Save it as a named fixture in local memory.
- Redact common secret-like fields before storage.
- Replay the fixture to a development endpoint.
- View request and response history for each replay.

## Guardrails

Do not paste production secrets or sensitive customer data. This MVP is local-first and has no payment, hosting, or account integration.

## Run

```bash
npm test
npm start
```

Open http://localhost:3000.

## MVP scope

This version intentionally avoids provider OAuth, live Stripe connections, production deployment, and paid billing. Those belong after human approval checkpoints.
