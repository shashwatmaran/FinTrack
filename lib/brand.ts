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

/** Matches --color-ft-ink and --color-ft-sky in app/globals.css. */
export const BRAND_INK = "#1a1a1a";

/**
 * Sky, not lime. A lime-on-black roundel at favicon size reads as Spotify
 * before it reads as us, and a mark whose first association is another product
 * is doing the opposite of its job. Sky is already in the palette, so this
 * borrows an existing token rather than introducing an eighth accent.
 */
export const BRAND_SKY = "#87ceeb";
