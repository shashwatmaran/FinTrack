# FinTrack — working notes

Read [README.md](README.md) first for architecture and roadmap. This file covers conventions that aren't obvious from the code.

## Commands

```bash
npm run dev      # http://localhost:3000
npm run build    # must pass before committing
npm run lint     # must pass before committing
```

No env vars needed to run. See `.env.example` for the deferred integrations.

## Conventions

- **Business logic never lives in components.** Split math and balance resolution belong in `lib/balances.ts`; derived views belong in `lib/selectors.ts`. Both are pure and dependency-free.
- **Data is fetched only through `hooks/use-fintrack-data.ts`.** Components never import `lib/api/mock-api.ts` directly — that indirection is what lets the mock API be replaced with real route handlers without touching the UI.
- **Server-shaped data never goes into Zustand.** TanStack Query owns it. `stores/ui-store.ts` is for modals, filters, and toasts only.
- **Accent colours are never interpolated into class names.** Tailwind can only see complete strings, so go through the maps in `lib/accent.ts`.
- **Money is handled in integer cents when splitting.** See `equalSplit` — per-share rounding would let splits drift off the total.

## Design system

The neobrutalist look (thick borders, hard offset shadows, lime/yellow/pink/purple accents) is ported from the original prototype. Tokens live in `@theme` in `app/globals.css`; primitives live in `components/ui/`. Prefer extending a primitive over writing one-off styles.

## Deferred integrations

Anything needing a credential is feature-flagged in `lib/env.ts` and surfaces in the UI as an explicit "needs credentials" state rather than a broken control. When enabling one, flip it in `lib/env.ts`, not at the call site.

## Legacy prototype

`legacy-prototype/` is the pre-Next.js single-file version, kept as a design reference and excluded from lint and build. Don't add to it.
