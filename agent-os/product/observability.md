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

## Lot 1 — Sentry, errors and traces on both sides

**Backend.** `backend/src/instrument.ts` starts the SDK before anything
else, from the policy in `backend/src/common/sentry.ts`. The exception
filter reports every answer with a 5xx status — an unhandled exception, a
Prisma error it has no mapping for, a 5xx chosen by the code, an outage
of the bank gateway — tagged with the request id, and asks Vercel to wait
for the upload (`waitUntil`) so the event is not frozen with the function.
A 4xx is never reported: it is the API saying no, not a defect. The guard
names the user to Sentry by id. `SentryModule.forRoot()` names each span
after the Nest handler; the Prisma integration adds the SQL spans.

**Frontend.** `frontend/src/lib/sentry.ts` starts the SDK before the
router, so page loads and navigations are traced; `useAsyncAction`
reports the error behind each toast, except session errors; the user id
follows the auth store from sign-in to sign-out. At build time, with the
secrets below, the Vite plugin uploads hidden source maps under the
commit hash and deletes them from `dist` before Vercel publishes it.

**What never leaves.** No request or response bodies, no query strings,
no cookies, no headers beyond content type and the request id, no local
variables, no component props, no prompts or model answers. The SQL in a
span is parameterised. Both `sentryOptions` functions have a spec that
asserts this.

**Sample rates.** Every request and page load is traced by default — the
volume of a single household sits far inside the free quota, and a p95
out of a 20 % sample of it would be a guess;
`SENTRY_TRACES_SAMPLE_RATE` / `VITE_SENTRY_TRACES_SAMPLE_RATE` change it.
Errors are always sent.

### To do once, by hand: the Sentry projects and the Vercel variables

1. Create a Sentry account (organisation region: EU) with two projects,
   platform NestJS for the backend and Vue for the frontend.
2. On the Vercel **backend** project, add `SENTRY_DSN` (the NestJS
   project's DSN) for Production and Preview.
3. On the Vercel **frontend** project, add `VITE_SENTRY_DSN` (the Vue
   project's DSN), plus `SENTRY_AUTH_TOKEN` (Sentry > Settings > Auth
   Tokens, scope `project:releases`), `SENTRY_ORG` and `SENTRY_PROJECT`
   (the two slugs) so that stack traces are readable. Without the three
   build variables errors still arrive, minified.
4. Redeploy both. A first event can be forced from a browser console with
   `throw new Error('sentry smoke test')` on the deployed frontend, and
   from the API by calling a route with a valid token and a payload the
   database refuses.
5. In each Sentry project, Alerts: keep the default "new issue" email and
   add one for "issue count above 10 in an hour". The Vercel `VERCEL_ENV`
   and commit hash arrive as environment and release, so an issue says
   which deployment introduced it.

Optional, backend: setting `NODE_OPTIONS=--enable-source-maps` on the
Vercel backend project makes Node map the stack frames to TypeScript at
runtime, which Sentry then shows as such. No upload needed.

## Lot 2 — the nightly bank sync reports for duty

Nothing else notices a cron that does not run: the health check stays
green, the logs stay empty, the user finds no new balance point and
cannot say why. So every run of `/bank-sync/scheduled-run` checks in
with Sentry when it starts and when it ends (`backend/src/common/
cron-monitor.ts`), under the monitor `daily-bank-sync`, whose schedule is
the crontab from `backend/vercel.json` — a spec keeps the two equal.

Sentry raises an issue, hence an email, when a run is **missed** (no
check-in within 10 minutes of 04:30 UTC), **fails**, or **times out**
(still in progress after 10 minutes). A night on which any bank refused
counts as a failed run even though the HTTP answer stays 200 for Vercel,
and a warning event lists the banks and the errors' own words, grouped
under one issue so that repeated bad nights stack up and a good night
lets it be resolved.

The monitor appears under **Monitors** in Sentry after the first run;
nothing to create by hand. To watch it before the next 04:30, trigger a
run by calling the route with `Authorization: Bearer <CRON_SECRET>`.

## What the next lots add

- **Lot 3 — business metrics**: structured events for CSV imports, AI
  categorisation (tokens, cost), Enable Banking calls (latency, status),
  bank syncs per connection, and the pg pool at request end.
