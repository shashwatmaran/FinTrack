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
- **Server data never goes into Zustand.** TanStack Query owns it. `stores/ui-store.ts` is for modals, filters, and toasts only.
- **Empty is not loading.** Use `isPending` from the query to decide whether to show a skeleton. Treating `data.length === 0` as loading strands new accounts on a permanent skeleton.
- **Accent colours are never interpolated into class names.** Tailwind can only see complete strings, so go through the maps in `lib/accent.ts`.
- **Money is handled in integer cents when splitting.** See `equalSplit` — per-share rounding would let splits drift off the total.
- **`/api/*` returns JSON, always.** `proxy.ts` 401s API calls rather than redirecting them; a redirect would hand `fetch` an HTML body.

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

## Design system

The neobrutalist look (thick borders, hard offset shadows, lime/yellow/pink/purple accents) is ported from the original prototype. Tokens live in `@theme` in `app/globals.css`; primitives live in `components/ui/`. Prefer extending a primitive over writing one-off styles.

## Deferred integrations

Anything needing a credential is feature-flagged in `lib/env.ts` and surfaces in the UI as an explicit "needs credentials" state rather than a broken control. When enabling one, flip it in `lib/env.ts`, not at the call site.

Still deferred: Google OAuth, email (Resend), LLM insight narratives, blob storage, Sentry.

## Gotchas

- Empty strings in `.env` files are not "absent" — `lib/env.ts` preprocesses `""` to `undefined` so a blank placeholder reads as unconfigured.
- `MONGODB_URI` is not validated with `z.string().url()`; `mongodb+srv://` isn't a URL the WHATWG parser accepts. The scheme is checked instead.
- Route guarding lives in `proxy.ts` (Next 16's rename of `middleware.ts`), not in the client shell.

## Legacy prototype

`legacy-prototype/` is the pre-Next.js single-file version, kept as a design reference and excluded from lint and build. Don't add to it.
