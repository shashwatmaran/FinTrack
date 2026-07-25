# FinTrack

A shared-expenses and settlement app for small groups: track what everyone spent, see who owes whom, and settle up without the spreadsheet.

FinTrack started as a single static HTML prototype driven by a custom runtime. It is now a Next.js 16 application that ports that prototype's neobrutalist design into a real component architecture, with the full domain layer — splits, balances, debt simplification, escrow settlements — implemented and working.

```bash
npm install
npm run dev          # http://localhost:3000
```

No environment variables are required. The app runs end-to-end against a seeded in-memory dataset.

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

**Deliberately deferred** — everything below needs a credential, so it is stubbed behind a feature flag in [lib/env.ts](lib/env.ts) rather than half-built:

- MongoDB Atlas persistence (`MONGODB_URI`) — data currently lives in memory and resets on reload
- Auth.js sessions and OAuth (`AUTH_SECRET`, `GOOGLE_CLIENT_*`) — sign-in uses a local placeholder session
- Transactional email (`RESEND_API_KEY`) — invites and password resets
- LLM-written insight narratives (`ANTHROPIC_API_KEY`)
- Blob storage (`BLOB_READ_WRITE_TOKEN`) — receipt attachments, exports
- Sentry / PostHog

Copy [.env.example](.env.example) to `.env.local` when you're ready to turn one of these on. Each flag in `lib/env.ts` gates exactly one feature, so they can be enabled independently.

---

## Repository layout

```
app/
  (auth)/            sign in, sign up, forgot password
  (app)/             authenticated shell: dashboard, groups, expenses,
                     settlements, insights, activity, profile
  layout.tsx         root layout + font + providers
  providers.tsx      TanStack Query client
components/
  ui/                design-system primitives (Button, Card, Modal, Avatar…)
  shell/             sidebar, topbar, notifications, toast
  <feature>/         one folder per screen
  modals/            modal host + individual dialogs
hooks/               TanStack Query hooks (the only place data is fetched)
lib/
  types.ts           domain types
  balances.ts        split, net-balance, and debt-simplification math
  selectors.ts       derived views over the raw domain data
  insights.ts        locally-computed spending insights
  api/mock-api.ts    in-memory stand-in for the future server API
  env.ts             validated config + feature flags
stores/              Zustand stores (UI state and placeholder session only)
legacy-prototype/    the original single-file prototype, kept for design reference
```

### Where to make changes

- **New screen** → a route under `app/(app)/`, a view component under `components/<feature>/`
- **New data operation** → add it to `lib/api/mock-api.ts`, expose a hook in `hooks/use-fintrack-data.ts`
- **New business rule** → `lib/balances.ts` or `lib/selectors.ts`, never inside a component
- **New colour or shadow** → `@theme` in `app/globals.css`, then a class map in `lib/accent.ts`

---

## Architecture

### Layers

1. **Presentation** — App Router pages that stay thin; every screen delegates to one view component.
2. **Domain** — pure functions in `lib/`. Split math, balance resolution, and settlement suggestions have no React or network dependency, which is what makes them straightforward to test and to move server-side later.
3. **Data access** — `lib/api/mock-api.ts` returns exactly the shapes the future route handlers will return. Swapping it for `fetch` calls should not require touching a single component.
4. **State** — a strict split, described below.

### State management

The rule is that the query cache is authoritative for anything that will eventually live on a server, and Zustand holds only what is genuinely client-local.

| Tool | Owns |
|---|---|
| TanStack Query | all server-shaped data: users, groups, expenses, settlements, notifications, activity |
| Zustand (`stores/ui-store.ts`) | modals, filters, toasts, the simplify-debts toggle |
| Zustand (`stores/session-store.ts`) | the placeholder session, until Auth.js replaces it |
| React Hook Form + Zod | form state and validation, with schemas shared between forms and the API layer |

Server data is never copied into a Zustand store.

### Domain model

The collections below are what the in-memory store holds today and what the MongoDB Atlas schema will mirror:

- `users` — profile, settings
- `groups` — metadata, membership, type, colour
- `expenses` — amount, payer, splits, category, date, optional recurring rule
- `settlements` — payer, receiver, amount, status (`pending` / `confirmed` / `declined`), method
- `notifications`, `activity` — event streams

Indexes to plan for when persistence lands: `userId`, `groupId`, `date`, `recurring.nextRunAt`, and the membership lookup on `groups.memberIds`.

### Two decisions worth knowing

**Settlements are escrowed.** A logged payment enters as `pending` and does *not* move any balance. Only the recipient can confirm it, at which point it counts. `computeNetBalances` and `computeDebtFlows` both filter to `status === "confirmed"`. This is deliberate: it means a payer cannot unilaterally mark a debt cleared.

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

### Phase 5 — Persistence 🔒 needs `MONGODB_URI`

Replace `lib/api/mock-api.ts` with route handlers backed by MongoDB Atlas. Add indexes, input validation on every write path, and permission checks scoped to group membership. The hook signatures in `hooks/` should not change.

### Phase 6 — Authentication 🔒 needs `AUTH_SECRET`

Auth.js with the MongoDB adapter. Replace `stores/session-store.ts` with real sessions, move the route guard from the client `AppShell` into middleware, and add server-side access checks.

### Phase 7 — Notifications and recurring jobs 🔒 needs `RESEND_API_KEY`

Vercel Cron to materialise recurring expenses on their `nextRunAt`. Invite emails, reminder digests, notification preferences.

### Phase 8 — AI insights 🔒 needs `ANTHROPIC_API_KEY`

A narrative layer on top of the deterministic insights already in `lib/insights.ts`. The computed numbers stay the source of truth; the model writes the explanation. Store generated insights with provenance so users can see what produced them.

### Phase 9 — Hardening and deploy

Tests for the domain layer first — `balances.ts` is pure and is where a bug costs the most. Then rate limiting, Sentry, and Vercel preview/production environments with least-privilege Atlas credentials.

---

## Legacy prototype

The original prototype is preserved under [legacy-prototype/](legacy-prototype/) as the design reference the port was checked against. It is excluded from linting and is not part of the build.

```bash
node legacy-prototype/serve.js    # http://localhost:5173
```

It can be deleted once the port is considered final.
