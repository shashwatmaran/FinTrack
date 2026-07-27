# FinTrack

A shared-expenses and settlement app for small groups: track what everyone spent, see who owes whom, and settle up without the spreadsheet.

FinTrack started as a single static HTML prototype driven by a custom runtime. It is now a Next.js 16 application that ports that prototype's neobrutalist design into a real component architecture, with the full domain layer — splits, balances, debt simplification, escrow settlements — implemented and working.

```bash
npm install
cp .env.example .env.local     # then set AUTH_SECRET (see below)
npm run dev                    # http://localhost:3000
```

Sign in with **`maya.alvarez@email.com`** / **`demo1234`**, or create a new account.

`AUTH_SECRET` is the only required variable — sessions are signed with it. Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Without `MONGODB_URI` the app runs against a seeded in-memory store: fully functional, but data resets whenever the server restarts. See [Connecting a database](#connecting-a-database).

---

## Current status

Every screen from the original prototype is ported and functional. The data layer is real code against local state, not static markup — splits are calculated, balances net out across groups, and mutations flow through TanStack Query with cache invalidation.

**Working today**

| Area | State |
|---|---|
| App shell, routing, navigation | Done — App Router with `(auth)` and `(app)` route groups |
| Design system | Done — Tailwind v4 theme tokens + `components/ui/` primitives |
| Dashboard, Groups, Group detail | Done — live totals, per-group balances, member views |
| Expenses + recurring rules | Done — filtering, search, create, delete, pause/resume |
| Settlements | Done — debt map, greedy debt simplification, escrow confirm/dispute |
| Insights | Partial — locally-computed insights work; LLM narratives deferred |
| Activity feed, Profile | Done |
| Add Expense / Create Group / Settle Up / Expense Detail modals | Done, with validation |
| Authentication | Done — Auth.js email + password, hashed with bcrypt |
| API layer | Done — route handlers with auth and per-group authorization |
| MongoDB persistence | Done — enabled by setting `MONGODB_URI` |
| Tests | 196 tests — domain math, selectors, schemas, and both stores |

Every integration is feature-flagged in [lib/env.ts](lib/env.ts), so the app runs end to end with none of them configured — each surfaces an explicit "not configured" state rather than a broken control.

**Still deferred**: blob storage (`BLOB_READ_WRITE_TOKEN`) for receipt attachments. Nothing else is waiting on a credential.

---

## Currency

**FinTrack is single-currency: every amount is INR**, formatted with the `en-IN` locale so grouping follows the lakh/crore convention (₹12,34,567.89).

There is deliberately no per-user currency setting. In a shared-expense app the currency belongs to the money, not to the viewer — a display-only preference would let two members of the same group read one debt as ₹500 and $500, with no conversion between them. Real multi-currency support means a currency per group (or per expense) plus FX rates: a data-model change, not a formatting one.

Each flag in `lib/env.ts` gates exactly one feature, so they can be enabled independently.

---

## Connecting a database

Without `MONGODB_URI` everything works, but data lives in server memory and resets on restart. To persist it:

1. Create a free **M0** cluster at [cloud.mongodb.com](https://cloud.mongodb.com).
2. **Database Access** → add a user with *Read and write to any database*.
3. **Network Access** → allowlist your current IP.
4. **Connect → Drivers** → copy the connection string into `MONGODB_URI` in `.env.local`.
   URL-encode special characters in the password (`@` → `%40`, `#` → `%23`, `/` → `%2F`).
5. Verify and seed:

```bash
npm run db:check     # connection, collection counts, index counts
npm run seed         # load the demo dataset (--reset to replace existing data)
npm run dev
```

`db:check` separates "can't connect" from "connected but empty" — run it first whenever Atlas misbehaves. Indexes are created automatically on the first request; `seed` refuses to run against a non-empty database unless you pass `--reset`.

Switching between the two modes needs no code change: the store is chosen at runtime in [lib/server/get-store.ts](lib/server/get-store.ts).

---

## Repository layout

```
auth.ts              Auth.js config (Credentials provider)
proxy.ts             route guard: redirects pages, 401s API calls
app/
  (auth)/            sign in, sign up, forgot password
  (app)/             authenticated shell: dashboard, groups, expenses,
                     settlements, insights, activity, profile
  api/               route handlers — the only path to data
  providers.tsx      TanStack Query client
components/
  ui/                design-system primitives (Button, Card, Modal, Avatar…)
  shell/             sidebar, topbar, notifications, toast
  <feature>/         one folder per screen
  modals/            modal host + individual dialogs
hooks/               TanStack Query hooks (the only place the client fetches)
lib/
  types.ts           domain types
  balances.ts        split, net-balance, and debt-simplification math
  selectors.ts       derived views over the raw domain data
  insights.ts        locally-computed spending insights
  validation.ts      Zod schemas shared by forms and route handlers
  api/client.ts      typed fetch wrappers
  db/                MongoDB client, document types, index definitions
  server/            DataStore interface + memory and MongoDB implementations
  env.ts             validated config + feature flags
scripts/             seed and db:check CLI utilities
stores/              Zustand stores (UI state only)
legacy-prototype/    the original single-file prototype, kept for design reference
```

### Where to make changes

- **New screen** → a route under `app/(app)/`, a view component under `components/<feature>/`
- **New data operation** → add it to the `DataStore` interface, implement it in *both* stores, add a route handler, then expose a hook
- **New business rule** → `lib/balances.ts` or `lib/selectors.ts`, never inside a component
- **New authorization rule** → the store implementations, never the route handler
- **New colour or shadow** → `@theme` in `app/globals.css`, then a class map in `lib/accent.ts`

---

## Architecture

### Layers

1. **Presentation** — App Router pages that stay thin; every screen delegates to one view component.
2. **Domain** — pure functions in `lib/`. Split math, balance resolution, and settlement suggestions have no React or network dependency, which is what makes them straightforward to test and to run on either side of the wire.
3. **Data access** — one `DataStore` interface ([lib/server/store-types.ts](lib/server/store-types.ts)) with two implementations. Route handlers depend only on the interface, so neither MongoDB nor the in-memory fallback leaks into the HTTP layer.
4. **State** — a strict split, described below.

### Authorization

Every `DataStore` method takes the acting user's id, and **authorization is enforced in the store, not in the route handlers**. Route handlers are wrappers that resolve the session and hand `userId` to the store already resolved — so a new endpoint cannot forget to scope its query. Concretely:

- Reads are filtered to groups the caller belongs to. There is no endpoint that returns all users; `/api/users` returns only people who share a group with you.
- `fromUserId` on a settlement comes from the session, never the request body.
- Only a settlement's recipient can confirm it. Either party can decline.
- Confirming is a conditional update on `status: "pending"`, so a double-click can't resurrect a declined settlement.

The route layer's only job is mapping thrown `ValidationError` / `ForbiddenError` / `NotFoundError` to 400 / 403 / 404, and never leaking a driver error to the client.

### Auth flow

Auth.js v5 with the Credentials provider and bcrypt-hashed passwords. Sessions are JWTs — the Credentials provider does not support database sessions — with the user record living in the store, so adding OAuth later is additive.

[proxy.ts](proxy.ts) guards routes at the edge. It redirects unauthenticated *page* requests to `/signin` (preserving `?next=`), but returns a **401 JSON body for `/api/*`**: redirecting an API call to an HTML page hands `fetch` something it can't parse, which surfaces as a generic error instead of an expired session. The client mirrors this — a 401 from any endpoint bounces the user to sign-in.

### State management

The rule is that the query cache is authoritative for anything that will eventually live on a server, and Zustand holds only what is genuinely client-local.

| Tool | Owns |
|---|---|
| TanStack Query | all server data: users, groups, expenses, settlements, notifications, activity |
| Zustand (`stores/ui-store.ts`) | modals, filters, toasts, the simplify-debts toggle |
| Auth.js session | who you are |
| React Hook Form + Zod | form state and validation, with schemas shared between forms and route handlers |

Server data is never copied into a Zustand store.

### Domain model

Documents use the domain id as `_id` (a string, not an `ObjectId`), so nothing is mapped between database and domain types.

- `users` — profile, `passwordHash`, colour
- `groups` — metadata, `memberIds`, type, colour
- `expenses` — amount, payer, splits, category, date, optional recurring rule
- `settlements` — payer, receiver, amount, status (`pending` / `confirmed` / `declined`), method
- `notifications`, `activity` — event streams

Indexes ([lib/db/indexes.ts](lib/db/indexes.ts), created on first request):

| Collection | Index | Why |
|---|---|---|
| `users` | `email` **unique** | sign-in lookup; also what makes concurrent signups safe |
| `groups` | `memberIds` | "which groups am I in?" — the hottest query in the app |
| `expenses` | `groupId + date`, `splits.userId` | group feeds and per-user share queries |
| `expenses` | `recurring.nextRunAt` *(sparse)* | the future cron job scans only this |
| `settlements` | `groupId + createdAt`, `fromUserId + status`, `toUserId + status` | pending-confirmation lookups |
| `notifications` | `userId + createdAt` | the notification panel |

### Two decisions worth knowing

**Settlements are escrowed.** A logged payment enters as `pending` and does *not* move any balance. Only the recipient can confirm it, at which point it counts. `computeNetBalances` and `computeDebtFlows` both filter to `status === "confirmed"`. This is deliberate: it means a payer cannot unilaterally mark a debt cleared — and it is enforced server-side, not just in the UI.

**Splits are computed in integer cents.** `equalSplit` distributes the remainder one cent at a time rather than rounding each share, so the splits always sum exactly to the expense total.

---

## Roadmap

Phases 1–4 below are what is built. The rest is sequenced so that each phase is independently shippable.

### Phase 1 — Foundation ✅

Next.js 16 App Router, TypeScript, Tailwind v4 design system, path aliases, lint and build clean.

### Phase 2 — Domain layer ✅

Split calculation, net balances, pairwise debt flows, greedy debt simplification, escrow settlement semantics, locally-computed insights.

### Phase 3 — UI ✅

Every prototype screen ported to components. Loading and empty states, keyboard-dismissable modals, responsive down to mobile.

### Phase 4 — State wiring ✅

TanStack Query for all server-shaped reads and writes, cache invalidation on mutation, Zustand confined to UI state.

### Phase 5 — Persistence ✅

Route handlers backed by MongoDB, behind a `DataStore` interface with an in-memory fallback. Indexes, validation on every write path, and permission checks scoped to group membership. Hook signatures did not change.

### Phase 6 — Authentication ✅

Auth.js email + password with bcrypt. Real sessions, edge route guard in `proxy.ts`, and server-side access checks on every endpoint.

### Phase 7 — Recurring expenses and notifications ✅ (email still deferred)

Recurring expenses materialise on a schedule, and in-app notifications are generated by real events. See [Recurring expenses](#recurring-expenses) below.

### Phase 7b — Email delivery ✅

The settlement request is the only notification that leaves the app. It is the one event that needs the recipient to *act*, and it holds someone else's balance until they do; everything else is a record of something already finished and belongs in the in-app feed. Emailing all of them would put a provider round trip inside every write and train people to ignore the channel.

`lib/server/email.ts` never throws — the settlement is recorded whether or not the mail goes out.

**Password reset** issues a token whose SHA-256 is all the store ever sees, and the request endpoint answers identically whether or not the address exists — otherwise it is a way to enumerate who has an account here.

Resetting also evicts sessions that already exist. Auth.js cannot use database sessions alongside the Credentials provider, so there is nothing server-side to delete; instead the reset stamps `passwordChangedAt` on the user and every authenticated request refuses a token whose `iat` predates it. That costs one indexed lookup per request, which since the shell loads through a single `/api/bootstrap` call is about one extra read per page.

**Invites** are member-only, because an invite grants sight of everyone's balances in that group. Unknown, expired and already-spent are one answer, so a spent token cannot confirm a group exists.

Creating one returns a link and sends nothing. The inviter already has a way to reach the person they are inviting, and routing it through an email provider bought a dependency that failed silently — the modal insisted the invite had been sent while the provider was rejecting every recipient but the account owner. The email field is now only a label on the invite. The link is shown once, because only its hash is stored.

### Phase 8 — AI insights ✅

A narrative layer over the deterministic insights in `lib/insights.ts`. See [AI insights](#ai-insights) below.

### Phase 9 — Hardening and deploy ✅ (observability still deferred)

Deployed and verified on Vercel against Atlas. See [Deployment](#deployment) below.

Done: tests ([see below](#tests)); rate limiting on `/api/signup` and the sign-in callback (`lib/server/rate-limit.ts` — fixed-window, in-process; move the counters to Redis or Vercel KV before running more than one instance); error boundaries; security headers; `/api/health`.

**Error boundaries.** `app/error.tsx` catches anything below the root layout, `app/(app)/error.tsx` catches it inside the shell so the navigation survives, `app/global-error.tsx` catches the root layout itself, and `app/not-found.tsx` handles 404s. None of them print the error message in production — they show `error.digest`, which is what correlates a user report with the server logs.

**Security headers.** Set in `next.config.ts`: a CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and HSTS in production only. `/api/*` additionally gets `no-store`, since those responses are per-session and must never reach a shared cache. `X-Powered-By` is off.

**Error reporting.** Sentry covers server, edge and browser. `sendDefaultPii` is off: this app holds balances, settlements and expense descriptions people wrote about their own lives, and a crash report is not a reason to ship that to a third party. Traces are sampled at 10% in production and off in development, because they bill against a separate quota from errors. Browser events route through a same-origin `/monitoring` tunnel so ad blockers don't silently swallow them — which also means `/monitoring` needs its place in the `proxy.ts` matcher exclusion.

**Shared rate limiting.** Counters live in Upstash Redis when `KV_REST_API_*` are set, so the limit means the same thing across instances. When Redis is unreachable the limiter falls back to per-process counters rather than failing closed — a dependency outage should not become a total outage.

Nothing outstanding here that a credential unlocks.

---

## Deployment

Live on Vercel, backed by MongoDB Atlas.

### Environment variables

Set in Project Settings → Environment Variables, for **both** Production and Preview — a variable scoped to one environment is simply absent in the other, and the dashboard list looks identical either way:

| Variable | Notes |
| --- | --- |
| `AUTH_SECRET` | Required. Sessions can't be signed without it. |
| `MONGODB_URI` | The `mongodb+srv://` string. |
| `MONGODB_DB` | `fintrack` |
| `CRON_SECRET` | Bearer token for `/api/cron/*`; the schedule is in `vercel.json`. |

Do **not** set `AUTH_URL`. Auth.js auto-detects the deployment host on Vercel; a stale value wins over detection and sends authenticated users to whatever it names.

Env var changes only apply to **new** deployments — edit them, then redeploy.

### Atlas

Vercel Hobby functions have dynamic egress IPs, so Network Access has to be `0.0.0.0/0`; there is no narrower range to pin. That removes the network barrier but not authentication — the cluster still requires SCRAM over TLS. Since the password becomes the only remaining layer, use a **database user scoped to the `fintrack` database only**, not the read/write-any-database user from local setup. Tightening the network again means a Vercel dedicated egress IP (Pro) or an Atlas Private Endpoint (M10+).

### `/api/health`

```
GET /api/health
{"status":"ok","database":"connected","authSecret":true,
 "authUrlIsLocalhost":false,"aiNarratives":false,"scheduledJobs":true}
```

Unauthenticated by necessity — it has to answer when auth is the broken thing — so it reports status words and booleans only: never a connection string, hostname, error message, or secret value. `database` distinguishes the three failures that otherwise look identical from a browser: `in-memory` (no `MONGODB_URI`, app silently works but data resets), `unreachable` (set but blocked), `connected`.

### Performance

Serverless charges per invocation, not per server. The shell used to fetch its data as five parallel requests, which meant five function invocations and five database connections for one page load — measured at ~200ms of invocation overhead *before* any handler ran, with warm requests no faster than cold.

It now loads through a single `/api/bootstrap`, prefetched and dehydrated in `app/(app)/layout.tsx` so the dashboard HTML arrives with its content and the browser makes **zero** API calls to render it.

| | Before | After |
| --- | --- | --- |
| Dashboard to content | ~1.4s (page, then 5 calls) | **~865ms** (one request) |
| Skeleton on first paint | yes | none |
| Return to dashboard | cached | cached |
| Sign-in | ~570ms | ~570ms |

Sign-in is unchanged on purpose: it is a bcrypt comparison plus a database read, and neither is cacheable. Cold starts still cost 4–5s on Hobby — that is the plan, not the code.

### Two traps that cost an afternoon

**Deployment Protection.** Vercel gates preview *and* production deployments behind its own SSO by default. Requests get a `302` to `vercel.com/sso-api` before reaching the app. A browser already signed in to Vercel loads the page normally, so the app looks fine — but its `fetch` calls follow that redirect and get HTML instead of JSON, and sign-in fails with no useful error. Settings → Deployment Protection → *Only Preview Deployments*. Diagnose it with `curl -I`: a `Location:` header pointing at `vercel.com` means the app never ran.

**A failing build keeps serving the last good one.** Fixes appear not to work because they were never deployed. Check the top entry in Deployments is green and matches the commit you expect.

---

## Recurring expenses

An expense can carry a `recurring` rule (`cadence`, `nextRunAt`, `active`). A daily Vercel Cron job materialises every rule that has come due.

```
vercel.json          cron schedule (02:00 UTC daily)
  └─ GET /api/cron/recurring     bearer-secret gated, no session
       └─ store.materializeRecurring(today)
            └─ lib/recurring.ts  pure scheduling maths
```

**The scheduling maths is pure and dependency-free** ([lib/recurring.ts](lib/recurring.ts)), because that's where the awkward cases are:

- **Month-end clamping.** A rule on the 31st becomes the 30th in April and the 28th in February — but clamping is applied from the *anchor* day, not the previous result, so it returns to the 31st in the next long month instead of being permanently dragged down to the 28th.
- **Catch-up.** If the job doesn't run for three months (a deploy gap, a paused project), all three occurrences are created, not one, and the schedule still lands on the correct next date.
- **A catch-up cap.** A rule whose `nextRunAt` is years in the past — bad data, or a restore from an old backup — materialises at most 12 occurrences and then fast-forwards, rather than silently creating hundreds.

**Idempotency** comes from advancing `nextRunAt` as part of *claiming* a rule. In MongoDB that update is conditioned on the value that was read, so two concurrent cron invocations can't both materialise the same rule — the failure that would silently double-charge everyone in a group.

**Security.** The endpoint writes across every group with no acting user, so it is gated on `CRON_SECRET` rather than a session, and is exempted from the proxy's session check (which would otherwise 401 it before the handler runs). With `CRON_SECRET` unset it returns 503 and does nothing — the safe failure is "job doesn't run", not "anyone can trigger charges".

Generated expenses are not themselves templates; only the original rule keeps its `recurring` field, so runs don't multiply.

## Notifications

In-app notifications are generated by real events — someone adding an expense you're part of, a payment logged that needs your confirmation, and that payment being confirmed or declined. The actor is never notified of their own action.

One of them leaves the app by email: a payment awaiting your confirmation. It is the only event that needs the recipient to *act*, and it holds someone else's balance until they do — the rest are records of something already finished and belong in the feed where they are.

Mail goes through Brevo, chosen because it verifies a single sender address rather than a whole domain. A password reset has to reach someone other than the account owner, and domain-only verification made that impossible without buying a domain. Brevo's IP restriction has to stay **off**: serverless egress addresses are dynamic, so there is nothing to allowlist and every send from production would 401.

## AI insights

Optional. The insights page works without it — the figures are computed locally in [lib/insights.ts](lib/insights.ts) and are always correct. A model, when configured, only writes a paragraph over those numbers.

**The model never does arithmetic.** It receives the already-computed figures as text and is instructed to restate them. Anything it returns containing a number that wasn't supplied is discarded rather than shown ([`containsUnsupportedNumbers`](lib/ai/narrate.ts)) — in a money app a plausible-looking wrong figure is worse than no narrative. That split is what makes it safe to point a small open-weight model at financial data.

Any **OpenAI-compatible `/chat/completions`** endpoint works, which is the de facto standard for serving open-weight models:

| Provider | `AI_BASE_URL` | Notes |
|---|---|---|
| **Ollama** | `http://localhost:11434/v1` | Local, free, no key, fully offline. Best for development. |
| **Groq** | `https://api.groq.com/openai/v1` | Free tier, very fast. Needs a free key. |
| **OpenRouter** | `https://openrouter.ai/api/v1` | Free tier via `:free` model suffixes. Needs a free key. |

```bash
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.2
AI_API_KEY=            # omit entirely for Ollama
```

Deliberately not a vendor SDK — the surface used is one POST with a JSON body, and an SDK would tie the app to a provider we want to keep swappable.

**Caching and regeneration.** Narratives are stored per user in the `narratives` collection alongside the hash of the facts they were written from. A request regenerates only when that hash no longer matches the current insights, so repeat views are free and a narrative is never stale.

Generation runs on read rather than inside the expense write: awaiting a model call would add seconds to every "add expense", and fire-and-forget work after a serverless response isn't guaranteed to execute. The trade-off is that the first insights view after a change pays the model latency once.

**Every failure degrades to the deterministic insights** — not configured, server unreachable, HTTP error, timeout, empty completion, or an answer that failed the number check. The endpoint always returns 200 with a `status` the UI explains, rather than hiding the gap.

## Tests

```bash
npm test              # 589 tests, ~12s
npm run test:watch
npm run test:coverage
```

No database or dev server required — the MongoDB suite starts a real `mongod` in-process via `mongodb-memory-server`.

| Suite | Covers |
|---|---|
| `balances.test.ts` | split math, net balances, debt flows, simplification |
| `selectors.test.ts` | headline totals, per-group net, monthly spend, activity grouping |
| `validation.test.ts` | every Zod schema, plus the schema↔split invariant |
| `store-contract.ts` | the `DataStore` behavioural contract — **run against both stores** |
| `insights.test.ts`, `format.test.ts` | insight generation, rupee and date formatting |
| `narrate.test.ts` | the hallucinated-number guard and cache-invalidation hash |
| `recurring.test.ts` | cadence maths, month-end clamping, catch-up, convergence |
| `route-helpers.test.ts` | request-level auth and error→status mapping |
| `cron-route.test.ts` | cron auth gate and job-result mapping |
| `rate-limit.test.ts` | window behaviour, per-key isolation, client IP extraction |
| `auth-route.test.ts` | sign-in throttling, and the 429 body shape the Auth.js client can parse |
| `auth-errors.test.ts` | bad credentials vs. infrastructure failure, and what neither may reveal |
| `health-route.test.ts` | status reporting, and that no secret or connection string escapes |
| `db-client.test.ts` | one-connection-pool-per-process |
| `query-keys.test.ts` | that the keys stay importable from both sides of the RSC boundary |
| `redis.test.ts` | the pipeline protocol, and that no error message carries the token |
| `shared-rate-limit.test.ts` | the Redis window, and the fallback when Redis is down |
| `email.test.ts` | that no delivery failure can propagate into a write |
| `sign-in-form.test.tsx` | that a failed submit **always** produces visible feedback |
| `dashboard-view.test.tsx` | empty-vs-loading, onboarding, rupee formatting |
| `app-url.test.ts` | that an emailed link points where the recipient can reach |
| `add-expense-modal.test.tsx` | that the split preview matches what is submitted |
| `group-detail-view.test.tsx` | which way a balance reads, and escrow at the UI layer |
| `settle-up-modal.test.tsx` | that a logged payment is a claim, and says so |
| `settlements-view.test.tsx` | that only the payee is offered confirm and dispute |
| `create-group-modal.test.tsx` | that the members submitted are the members selected |
| `activity-view.test.tsx` | that stored `**bold**` renders as text, never as HTML |
| `expense-detail-modal.test.tsx` | that your position is your share, not the whole expense |
| `invite-modal.test.tsx` | that the link is shown, and nothing claims to have been sent |

**The contract suite is the important one.** `memory-store` and `mongo-store` are separate code but only one runs in production, so an authorization rule can silently exist in one and not the other. Both are held to the same 45 assertions. New `DataStore` methods belong there, not in a per-implementation file.

Each rule was verified by breaking it deliberately and confirming the suite fails — a test that passes against both the correct and the broken implementation protects nothing.

**Component tests** (`*.test.tsx`) run under jsdom via a `@vitest-environment jsdom` docblock, so only the files that need a DOM pay for one. They exist because the two worst bugs this project has had were both invisible to everything above: a resolved-but-empty query rendering as a permanent skeleton, and a sign-in form that failed *silently* when Auth.js threw. In both cases the server was returning exactly the right thing. Both were re-broken deliberately to confirm the new tests fail.

The two highest-stakes screens are covered because their bugs are silent. The split form is where money is divided between real people — a preview that disagrees with what gets submitted shows one number and charges another. Group detail states a balance as a sentence, so reversing the sign turns "you're owed ₹500" into "you owe ₹500" while every API response stays correct. Both were verified by breaking them: dropping the rounding remainder, and swapping the balance wording.

Writing them found a shipped bug: the settle-up form defaulted its payment method to `"Venmo"`, which was not one of the options the dropdown offered — a leftover from the US-facing prototype that survived the move to rupees. Anyone who did not touch the field submitted a method the UI never showed them.

Every screen now has coverage.

## Legacy prototype

The original prototype is preserved under [legacy-prototype/](legacy-prototype/) as the design reference the port was checked against. It is excluded from linting and is not part of the build.

```bash
node legacy-prototype/serve.js    # http://localhost:5173
```

It can be deleted once the port is considered final.
