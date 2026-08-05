# KEPT — design plan

Produced at build-order checkpoint 4, before any component styling work.

---

## 1. Token table

Everything below is a CSS custom property in `src/styles/globals.css` behind
Tailwind's `@theme`. There are no other colours, no other spacing steps, and no
radius scale at all.

### Colour

| Token | Value | What it is allowed to be |
|---|---|---|
| `--color-ground` | `#E8E6DF` | Page ground. The default background of everything. |
| `--color-ground-2` | `#DEDBD2` | One step darker. The hero field, and nothing else. |
| `--color-ink` | `#151515` | Body text, headlines, values. |
| `--color-ink-2` | `#494844` | Secondary text where ink is too loud. |
| `--color-muted` | `#75736C` | Labels, meta, disabled. |
| `--color-accent` | `#C4442C` | **Type, a 1px rule, a marker dot, the spine, an active state.** Never a filled area, never a background, never a button fill. |
| `--color-hairline` | `rgba(21,21,21,.16)` | Every border in the app is 1px of this. |

### Spacing — nine steps, nothing between

| Token | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| px | 4 | 8 | 12 | 16 | 24 | 34 | 56 | 88 | 144 |

### Type

| Role | Face | Size | Tracking | Case |
|---|---|---|---|---|
| Display XL — hero | Familjen Grotesk 700 | `clamp(38px, 6.4vw, 104px)` | −.035em | UPPER |
| Display L — section | Familjen Grotesk 600 | `clamp(28px, 3.4vw, 52px)` | −.03em | UPPER |
| Display M — verdict word | Familjen Grotesk 700 | `clamp(32px, 4vw, 64px)` | −.03em | UPPER |
| Label | Spline Sans Mono 500 | 9.5px | .14em | UPPER |
| Value / figure | Spline Sans Mono 500 | 11.5px | .12em | as-is |
| Body | Spline Sans Mono 400 | 11.5px / 1.75 | .12em | sentence |

Every figure carries `font-variant-numeric: tabular-nums` and
`font-feature-settings: "tnum"`, so a count-up never reflows the row it sits in.

### Frame

| Token | Value |
|---|---|
| `--frame-spine` | 2px, fixed top, scroll-bound |
| `--frame-rail` | 34px, fixed left, vertical-rl |
| `--frame-topbar` | 58px, fixed, 82% ground + 12px blur |

Rail and spine drop below 768px. Radius is 0 everywhere, buttons included.
No gradient, no glow, no shadow, no bento grid, anywhere.

---

## 2. `/ask` — the core screen

Single centred column, max 640px. Left edge of the column is the measure
everything aligns to.

```
 ┃                                                                    ← 2px accent spine (scroll-bound)
┌──────────────────────────────────────────────────────────────────────┐
│ KEPT.  01–31 AUG        ASK  HOLDS  LEDGER  IMPORT  REVIEW  INSIGHTS │  58px top bar, bottom hairline
└──────────────────────────────────────────────────────────────────────┘
 P                        ┌─────────────────────────────────┐
 E                        │                                 │
 R                        │  BEFORE YOU BUY                 │  ← label, muted
 I                        │                                 │
 O                        │  ASK                            │  ← h1: solid ASK
 D                        │  BEFORE YOU BUY                 │     + outlined second line
                          │                                 │
 0                        │  AMOUNT                         │  ← label
 1                        │  AED  450.00                    │  ← 38px mono, tabular, hairline under
 –                        │  ─────────────────────────────  │
 3                        │                                 │
 1                        │  CATEGORY                       │
                          │  [GROCERIES][DINING][DELIVERY]  │  ← square toggles, aria-pressed
 A                        │  [TRANSPORT][CLOTHING][HOUSE…]  │     active = accent text + accent border
 U                        │                                 │
 G                        │  NOTE (OPTIONAL)                │
                          │  team lunch_                    │  ← one line, hairline under
 ·                        │  ─────────────────────────────  │
                          │                                 │
 K                        │  [ Ask ]                        │  ← square, 1px hairline, no fill
 E                        │                                 │
 P                        └─────────────────────────────────┘
 T
                          PENDING STATE — form dims to 40%,
 A                        no spinner, one mono line:
 E                          CHECKING AGAINST YOUR POLICY
 D
                          ── the form is replaced in place ──
 1
 ,                        ┌─────────────────────────────────┐
 3                        ┃ [ R-01 ]            AED 450.00  │  ← ┃ = 1px accent rule, HOLD/DECLINE only
 8                        ┃                                 │
 1                        ┃ HOLD  FOR NOW                   │  ← Display M. HOLD solid, FOR NOW outlined
                          ┃                                 │
 ↑                        ┃ "nothing over 200 without a     │  ← the user's own words, quoted verbatim
 34px                     ┃  48 hour wait"                  │
 rail                     ┃                                 │
                          ┃ You have 280 left against your  │  ← two sentences maximum, second person
                          ┃ 1,400 dining limit and this is  │
                          ┃ 450. Your own rule asks for 48  │
                          ┃ hours on anything over 200.     │
                          ┃ ─────────────────────────────── │
                          ┃ SPENT · DINING   AED 1,120/1,400│  ← ledger rows, the only layout primitive
                          ┃ DAYS LEFT IN PERIOD          11 │
                          ┃ BILLS BEFORE PERIOD END AED 970 │
                          ┃ ─────────────────────────────── │
                          ┃ [ Hold it ]   [ Log it anyway ] │
                          └─────────────────────────────────┘

                          ERROR STATE (AI_UNAVAILABLE) — same card, no accent
                          rule, label reads:
                            ARITHMETIC ONLY — POLICY CHECK UNAVAILABLE
                          and the reasoning is computed locally from
                          BudgetState. Never a fabricated model verdict.
```

Decision styling is typographic only. `allow` gets no marker. `hold` and
`decline` get the left accent rule. No red backgrounds, no traffic lights, no
icons.

---

## 3. The one element this app is remembered by

> **Hollow type means money that stayed put.** The outline is not decoration and
> not a headline style — it is the app's one piece of semantics. Solid type is
> money that moved; outlined type is money that did not. The verdict word on
> `/ask` sets `HOLD` solid beside an outlined qualifier at 64px, and the hero
> sets the Kept figure as a 660px hollow numeral behind everything. Same device,
> two scales, one meaning — an app that tells you no in a word half of which
> isn't filled in.

Why this is specific to this brief and not a generic type trick: KEPT's entire
product claim is that the money it counts is money that *was never spent*. That
figure has no transaction behind it. Rendering it as an outline — present,
measurable, unfilled — is the only visual in the app that states what the
product actually measures. Every other rule in the design system exists to keep
that one device legible: the accent never fills an area, so hollow always reads
as hollow; radius is 0, so a stroke is a stroke; the ledger row is the only
layout primitive, so nothing competes with the type.
