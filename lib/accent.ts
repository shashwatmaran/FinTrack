import type { AccentToken } from "./types";

/**
 * Explicit class maps — Tailwind only ships classes it can see as complete
 * strings, so accent colours can never be interpolated into class names.
 */
export const ACCENT_BG: Record<AccentToken, string> = {
  "ft-lime": "bg-ft-lime",
  "ft-yellow": "bg-ft-yellow",
  "ft-pink": "bg-ft-pink",
  "ft-sky": "bg-ft-sky",
  "ft-green": "bg-ft-green",
  "ft-red": "bg-ft-red",
  "ft-purple": "bg-ft-purple",
};

export const ACCENT_HEX: Record<AccentToken, string> = {
  "ft-lime": "#beff6c",
  "ft-yellow": "#ffd166",
  "ft-pink": "#ff87ab",
  "ft-sky": "#87ceeb",
  "ft-green": "#6bcb77",
  "ft-red": "#ff6b6b",
  "ft-purple": "#a78bfa",
};

const ACCENT_ORDER: AccentToken[] = [
  "ft-lime",
  "ft-sky",
  "ft-pink",
  "ft-purple",
  "ft-yellow",
  "ft-green",
  "ft-red",
];

export function accentFromId(id: string): AccentToken {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENT_ORDER[hash % ACCENT_ORDER.length];
}
