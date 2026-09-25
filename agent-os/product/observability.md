# Observability

What exists, what it is for, and what still has to be set up by hand.

## Lot 0 — logs, request ids, health check, uptime alert

**Structured logs.** In production (`NODE_ENV=production`, so Vercel and the
podman container alike) the backend writes one JSON object per line, which
Vercel's log viewer turns into filterable fields. At a desk the same lines
are coloured and readable. `LOG_FORMAT` and `LOG_LEVEL` override both
defaults; see `backend/src/common/logging.ts` and `backend/.env.example`.

**One line per request.** `backend/src/common/request-log.ts` logs method,
path (query string stripped), status, duration, user id and — on a failed
request — the message the exception filter answered with. Never a body, a
header or a query. A healthy `/health` probe logs at `debug`, so it is
invisible in production; a failing one is an `error`.

**Request id.** Vercel's own `x-vercel-id` when there is one, a UUID
otherwise. It comes back on every response as `x-request-id`, and a 500
body carries it as `requestId`; the frontend appends it to the toast as
`(réf. …)`. To investigate a report from a user: paste the reference into
the Vercel log search, or into `x-vercel-id` in the request log line.

**Health check.** `GET /health` runs `SELECT 1` against the database with a
3-second timeout and answers `200 {status:"ok"}` or
`503 {status:"error"}`, plus the short commit hash of the deployment. It is
unauthenticated and outside the throttler.

## To do once, by hand: the uptime monitor

Nothing in the repository can page anyone. An external monitor has to call
`/health` and alert when it stops answering `200`.

1. Create a free account on Better Stack (Uptime) or use Sentry Uptime
   Monitoring once lot 1 is in.
2. Add an HTTP monitor on `https://<backend-domain>/health`, expecting
   status `200`, checked every 3 minutes from at least two regions.
3. Route its alerts to email and, ideally, the phone app — a monitor nobody
   hears is decoration.
4. Add the same monitor on the frontend URL, expecting `200` and the text
   `<div id="app">`, so that a broken frontend deploy is caught too.

## What the next lots add

- **Lot 1 — Sentry**: unhandled errors with stack traces on backend and
  frontend, p50/p95 per route, alerts on new issues and regressions.
- **Lot 2 — cron monitor**: `/bank-sync/scheduled-run` wrapped in a Sentry
  Cron Monitor, and a captured message when any connection failed.
- **Lot 3 — business metrics**: structured events for CSV imports, AI
  categorisation (tokens, cost), Enable Banking calls (latency, status),
  bank syncs per connection, and the pg pool at request end.
