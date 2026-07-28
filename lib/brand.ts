/**
 * The FinTrack mark, in one place.
 *
 * Used by the in-app logo and by the generated favicon and touch icon. Kept
 * here rather than duplicated so the tab icon cannot drift away from the thing
 * in the sidebar — which is exactly what happens when a favicon is a binary
 * file somebody exported once.
 *
 * No directive: a client component and a route handler both import it.
 */

/** Three rules, the last one short — the same shape as a statement of totals. */
export const MARK_PATH = "M3 6h18M3 12h18M6 18h12";

export const MARK_VIEWBOX = "0 0 24 24";

/** Matches --color-ft-ink and --color-ft-lime in app/globals.css. */
export const BRAND_INK = "#1a1a1a";
export const BRAND_LIME = "#beff6c";
