# FinTrack — working notes

Read [README.md](README.md) first for architecture and roadmap. This file covers conventions that aren't obvious from the code.

## Commands

```bash
npm run dev       # http://localhost:3000
npm test          # must pass before committing
npm run build     # must pass before committing
npm run lint      # must pass before committing
npm run db:check  # verify MongoDB connection + document counts
npm run seed      # load demo data into MongoDB (--reset to replace)
```

Tests need no running database — `tests/mongo-store.test.ts` starts a real
`mongod` in-process via `mongodb-memory-server`.

`AUTH_SECRET` is required (in `.env.local`). `MONGODB_URI` is optional — without it the app uses the in-memory store. Demo login: `maya.alvarez@email.com` / `demo1234`.

## Conventions

- **Business logic never lives in components.** Split math and balance resolution belong in `lib/balances.ts`; derived views belong in `lib/selectors.ts`. Both are pure and dependency-free.
- **Authorization lives in the store, not the route handler.** Every `DataStore` method takes the acting `userId` and enforces access itself. Route handlers just resolve the session and map errors. Adding a check to a route handler instead means the other store implementation silently lacks it.
- **Both store implementations must stay in sync.** `memory-store.ts` and `mongo-store.ts` implement the same interface; a new method needs both, with the same authorization rules.
- **The client fetches only through `hooks/use-fintrack-data.ts`.** Components never call `lib/api/client.ts` directly, and never import anything from `lib/server/` or `lib/db/` (those are `server-only` and will fail the build).
- **The shell loads through one query, not one per resource.** `/api/bootstrap`
  returns everything the signed-in shell needs, `app/(app)/layout.tsx`
  prefetches it and dehydrates it into the cache, and the hooks in
  `use-fintrack-data.ts` are `select`s over that single query. Five separate
  requests cost almost nothing on a persistent server and five cold starts plus
  five database connections on serverless. The prefetch belongs in the *layout*
  because the shell subscribes to the same query — prefetching in a page leaves
  the shell outside the hydration boundary, so it fetches anyway.
- **`queryKeys` lives in `lib/query-keys.ts`, which carries no directive.** A
  server component importing it from a `"use client"` module gets a client
  reference proxy: it works by identity inside one server render, then
  serialises to `null` crossing into the RSC payload, so the browser cannot
  match the dehydrated entry and refetches everything the prefetch just paid
  for. Nothing looks broken — the page is just quietly slower, which is the
  worst kind of regression. `tests/query-keys.test.ts` guards it.
- **Server data never goes into Zustand.** TanStack Query owns it. `stores/ui-store.ts` is for modals, filters, and toasts only.
- **Empty is not loading.** Use `isPending` from the query to decide whether to show a skeleton. Treating `data.length === 0` as loading strands new accounts on a permanent skeleton.
- **Accent colours are never interpolated into class names.** Tailwind can only see complete strings, so go through the maps in `lib/accent.ts`.
- **Money is handled in integer paise when splitting.** See `equalSplit` — per-share rounding would let splits drift off the total.
- **Single currency: INR.** `formatCurrency` takes no currency argument. Don't add a per-user currency preference — in a shared-expense app the currency belongs to the money, not the viewer, so a display-only setting would show one debt as ₹500 to one member and $500 to another. Real multi-currency needs a currency per group plus FX rates.
- **The model never does arithmetic.** Figures are computed in `lib/insights.ts` and passed to the model as text. `lib/ai/narrate.ts` discards any completion containing a number that wasn't supplied — a plausible wrong figure is worse than no narrative.
- **`/api/*` returns JSON, always.** `proxy.ts` 401s API calls rather than redirecting them; a redirect would hand `fetch` an HTML body.
- **`materializeRecurring` is the one store method with no acting user.** It is the scheduled job and writes across every group, so it must stay reachable only from `/api/cron/*` — never from a user-facing route. Adding a new cron path means adding it to the `proxy.ts` matcher exclusion too, or the proxy will 401 it before the handler runs.
- **`/api/health` reports status words, never values.** It is unauthenticated
  because it has to answer when auth is the thing that is broken, which means
  anything it returns is public. A driver error routinely contains the whole
  connection string including credentials, so nothing derived from an exception
  — and no env var value — may reach the response body. Booleans and a fixed
  vocabulary only. Like the cron routes, it needs its path in the `proxy.ts`
  matcher exclusion or the proxy 401s it before the handler runs.
- **Auth failures are classified, not collapsed.** Auth.js returns
  `CredentialsSignin` when `authorize` returns null and `Configuration` when it
  *threw* — an unreachable database takes the second path. `lib/auth-errors.ts`
  maps only the first to a credentials message; everything else says the fault
  is ours. Collapsing them tells users to re-check a password that was never
  wrong and hides an outage from the one person likely to report it.
- **Error boundaries never print `error.message` in production.** Next replaces
  server error messages with a generic string, but a client-side throw keeps its
  real one — and in an app holding balances and settlements that is the wrong
  thing to paint on screen. Show `error.digest` instead; it is the hash Next logs
  next to the real stack, so it is what correlates a user report with the server
  logs. `app/global-error.tsx` additionally imports nothing from the design
  system: it catches root-layout failures, so anything it depended on could be
  the very thing that failed. A boundary that can throw is not a boundary.
- **Security headers live in `next.config.ts`, not in `proxy.ts`.** Keeping them
  in one `headers()` block means they apply to every response including static
  assets, which a proxy matcher exclusion would silently skip. The CSP keeps
  `script-src 'unsafe-inline'` because Next injects inline bootstrap scripts;
  removing it means per-request nonces in `proxy.ts` and opts every route out of
  static rendering. Worth doing if the app ever renders user-supplied HTML.
- **Side channels never fail the transaction.** `lib/server/email.ts` and the
  Redis path in `rate-limit.ts` both return rather than throw. A settlement that
  was genuinely recorded must not roll back because Resend was down, and a
  Redis hiccup must not lock every user out of sign-in — the limiter falls back
  to per-process counters, which is weaker than the shared count but stronger
  than no limit at all. Failing closed on a dependency turns its outage into a
  total outage.
- **Modules holding a credential never put foreign text in an error message.**
  `redis.ts` attaches the transport error as `cause` and throws its own message;
  `email.ts` logs the status and recipient but never the response body. Callers
  log these, and logs travel further than the code that wrote them.
- **Recurring scheduling maths lives in `lib/recurring.ts` and stays pure.** Month-end clamping and catch-up are where the bugs are; keeping it free of dates-from-`Date.now()` and database access is what makes them testable.

## Tests

`tests/store-contract.ts` is a single behavioural suite executed against *both*
store implementations. Anything added to the `DataStore` interface — especially
an authorization rule — belongs there, not in an implementation's own test file.
That shared suite is the only thing standing between the two stores and silent
drift, since just one of them runs in production.

When adding a rule, confirm the test actually catches its absence: break the
rule deliberately, watch the contract fail, then restore it. A test that passes
against both the correct and the broken implementation is not protecting
anything.

Component tests are `tests/*.test.tsx` and opt into jsdom with a
`// @vitest-environment jsdom` docblock on the first line — the default stays
`node` because the store contract runs a real `mongod`. They cover what the
server-side suites structurally cannot: this project's two worst bugs were a
resolved-but-empty query rendering as a permanent skeleton, and a sign-in form
that went silent when `signIn()` threw. Both had a correct API response behind
them. When a component test asserts an *absence* — no skeleton, no error text —
re-break the component and watch it fail, or it is asserting nothing.

## Design system

The neobrutalist look (thick borders, hard offset shadows, lime/yellow/pink/purple accents) is ported from the original prototype. Tokens live in `@theme` in `app/globals.css`; primitives live in `components/ui/`. Prefer extending a primitive over writing one-off styles.

## Deferred integrations

Anything needing a credential is feature-flagged in `lib/env.ts` and surfaces in the UI as an explicit "needs credentials" state rather than a broken control. When enabling one, flip it in `lib/env.ts`, not at the call site.

Still deferred: Google OAuth, email (Resend), blob storage, Sentry.

AI narratives are optional rather than deferred: set `AI_BASE_URL` + `AI_MODEL` to any OpenAI-compatible server (Ollama locally needs no key). Everything degrades to the deterministic insights when it's absent or failing.

## Gotchas

- Empty strings in `.env` files are not "absent" — `lib/env.ts` preprocesses `""` to `undefined` so a blank placeholder reads as unconfigured.
- `MONGODB_URI` is not validated with `z.string().url()`; `mongodb+srv://` isn't a URL the WHATWG parser accepts. The scheme is checked instead.
- **`mongodb+srv://` can fail on a machine where everything else resolves.** The
  driver does the SRV and TXT lookups through Node's c-ares resolver, which keeps
  its own nameserver list; `dns.lookup()` uses the OS resolver, so browsers,
  `nslookup`, and the rest of the app stay fine while only Atlas breaks. If
  `require("dns").getServers()` is `['127.0.0.1']` with nothing on port 53,
  c-ares found no nameserver and fell back. Don't paper over it with
  `dns.setServers()` in app code — that hard-codes one machine's workaround into
  production. Use the direct seed-list connection string instead (see
  `.env.example`), and note it doesn't survive Atlas topology changes.
- Route guarding lives in `proxy.ts` (Next 16's rename of `middleware.ts`), not in the client shell.

## Legacy prototype

`legacy-prototype/` is the pre-Next.js single-file version, kept as a design reference and excluded from lint and build. Don't add to it.
