# FinTrack wireframes — low fidelity, with interaction redlines

Self-contained HTML copies of the wireframe boards, one file per screen. No
build step, no runtime, no dependencies: open any file in a browser, or import
it into Figma.

Start at [00-wiring-checklist.html](00-wiring-checklist.html) — it lists every
prototype connection in the set, grouped by source screen. Then
[index.html](index.html) for the contact sheet.

## The two layers

Each board has a **screen** at its real device size, and an **interaction
legend** printed directly underneath it. They are separate groups, so in Figma
you can move or hide the legend without touching the screen.

**Grey is the design:**

| Mark | Means |
|---|---|
| Flat mid-grey fill | An accent surface — lime, yellow, pink, purple or sky in the real UI |
| Grey bar | Text whose content comes from data |
| `₹` + bar | A computed figure |
| Square with a diagonal | An icon slot, not final iconography |
| Dashed outline (grey) | A "needs credentials" or not-configured state |

**Magenta is the annotation, never part of the design:**

| Mark | Means |
|---|---|
| Dashed magenta outline | An interactive element |
| Numbered badge | Matches a row in the legend below the screen |
| Unnumbered `–` row | Described in the legend, but nothing to connect |

## Getting them into Figma

Figma imports `.fig`, `.sketch`, images and SVG natively — not HTML. The usual
bridge is the **html.to.design** community plugin, which rebuilds HTML as real
Figma layers rather than a flat picture.

1. In Figma: **Plugins → browse plugins → install "html.to.design"**.
2. Open a blank file and run the plugin.
3. Use its **code / paste-HTML** import mode (the URL mode is no use here —
   these are local files).
4. Paste the entire contents of one `.html` file.
5. Set the import **viewport width to match the board** (below), or the layout
   reflows and the frame comes in narrower than intended.
6. Import, then repeat per file.

The free tier caps imports per month. If you are rationing, the four that carry
most of the language are `05-dashboard`, `09-group-detail-overview`,
`08-expenses` and `13-settlements`.

### Import widths

| Files | Width |
|---|---|
| `00` wiring checklist | 1600 |
| `01` – `04` auth | 1280 |
| `05` – `17` app screens | 1440 |
| `18` system states | 1280 |
| `19` overlays | 1100 |
| `20` – `24` modals | 720 |
| `25` – `27` phone | 390 |

## Wiring the prototype

Every signed-in screen carries the same six shell interactions, numbered
identically on all of them:

| Badge | Element | Target |
|---|---|---|
| 1 | Sidebar nav (6 items) | 05 / 07 / 08 / 13 / 15 / 16 |
| 2 | Profile & Settings | 17 Profile |
| 3 | Search field | 19 Overlays (results) |
| 4 | Bell | 19 Overlays (notifications) |
| 5 | + Add Expense | 20 Add expense |
| 6 | Avatar | 17 Profile |

Wire those once on a component and every screen inherits them. Badge 7 onward is
screen-specific and listed in that screen's own legend.

State changes that need no connection — filter pills, toggles, participant
chips, confirm / dispute, copy link — are labelled `in place` in the legend.

## Tab and toggle states are separate boards

Static files can't hold component state, so the states that would otherwise be
lost each ship as their own board, and the tab bars link between them:

- `09` – `12` — group detail, one board per tab
- `13` / `14` — settlements, all debts vs. simplified
- `03` / `04` — the password screens show their submitted / done / no-token
  states side by side on one board

## Limits worth knowing

- Styling is inline, so the plugin produces per-element properties rather than
  Figma styles or components. Expect to promote the repeated pieces — expense
  row, group card, stat tile, nav item — into components yourself.
- Type is Archivo and IBM Plex Mono, loaded from Google Fonts. Install both
  locally or Figma will substitute.

## Regenerating

These are generated from the artboards on the Design canvas, not maintained by
hand. Edit the canvas, then re-flatten — don't patch these files, or the two
versions drift.
