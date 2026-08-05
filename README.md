# KEPT

A personal spending advisor. It answers one question before a purchase, enforces
a wait when the answer is "not yet", and counts the money that was never spent.

The product name is the metric.

> **Kept** is the sum of every hold you released and every purchase the policy
> declined that you did not make, within the current period. A hold you later
> bought contributes nothing.

That definition lives in exactly one place in the codebase
(`KEPT_DEFINITION` in `src/lib/kept.ts`) and is rendered verbatim in the
tooltip on the figure, on the signed-out home, and here. A metric nobody can
define is a metric nobody trusts.

---

## Scope, plainly

KEPT looks at your own outgoing spending and nothing else.

- It has **no bank access**. It reads the alert messages you paste in, and a
  CSV if you export one. There is no account to connect.
- It gives **no investment advice** and **no lending or credit
  recommendations**. Those are regulated activities and are deliberately out of
  scope — the verdict prompt instructs the model not to raise them, and the
  eval suite would catch it if it started.
- It stores what you give it: your policy, the alerts you paste, the
  transactions parsed from them, and your answers to "was it worth it".
- Single user. No teams, no auth providers, no billing, no mobile app.
- Currency is AED, stored in minor units (fils) as integers. No float ever
  holds a monetary value.

---

## The three loops

| Loop | Trigger | Outcome |
|---|---|---|
| Ask | You enter an amount and a category before buying | A verdict — `allow` / `hold` / `decline` — citing one of your own rules |
| Hold | The verdict is `hold`, or you choose to hold an `allow` | A 48h timer; when it ends you buy it or let it go. Letting it go increments Kept |
| Review | 7 days after a discretionary purchase | One question: worth it or not. The answers become evidence in future verdicts |

Expiry never releases on your behalf. When a hold's window passes the row stays
`HELD` and moves to **READY TO DECIDE** — the app makes waiting the default, it
does not make the decision.

---

## Architecture

```
                      ┌─────────────────────────────────────────┐
   browser            │  Next.js 15 App Router  ·  React 19      │
   ───────            │                                         │
   /ask ──────────────▶ POST /api/verdict ──┐                   │
   /holds ────────────▶ PATCH /api/intents  │                   │
   /ledger ───────────▶ GET  /api/transactions                  │
   /import ───────────▶ POST /api/import ───┼──▶ 202 + batchId   │
   /review ───────────▶ POST /api/review    │                   │
   /insights ─────────▶ (server component)  │                   │
                      └─────────────────────┼───────────────────┘
                                            │
        ┌───────────────────────────────────┼──────────────────────┐
        │  src/lib — pure, unit tested, one source for every figure │
        │                                                          │
        │   money.ts      integers in fils; the only formatter      │
        │   period.ts     timezone-aware boundaries via Intl        │
        │   budget-state  THE shape everything reads                │
        │   kept.ts       the metric, and its definition            │
        │   intent-machine  the hold lifecycle as a closed table    │
        └───────────────────────────────────┬──────────────────────┘
                                            │
              ┌─────────────────────────────┼──────────────────┐
              │                             │                  │
     ┌────────▼─────────┐        ┌──────────▼────────┐  ┌──────▼──────┐
     │ Anthropic        │        │ Neon Postgres     │  │ Netlify     │
     │ claude-sonnet-4-6│        │ via Prisma        │  │ functions   │
     │                  │        │                   │  │             │
     │ verdict  (forced │        │ pooled at runtime │  │ import-     │
     │   tool, 700 tok) │        │ direct for migrate│  │  background │
     │ parse-sms (2000  │        │                   │  │  (15 min)   │
     │   tok, 20/call)  │        │                   │  │ nightly-    │
     └──────────────────┘        └───────────────────┘  │  sweep (30s)│
                                                        └─────────────┘
```

**The UI never computes a figure.** Every number on screen comes from
`BudgetState`, assembled once in `src/lib/budget-state.ts` and read by the
verdict engine, `/ask`, the rail and `/insights` alike.

### Why the AI layer is shaped this way

Both model calls force a tool, so a well-formed response always carries exactly
one structured result — nothing is parsed out of prose. Every call goes through
one wrapper (`src/lib/ai/client.ts`) with a 25s abort, one retry on 429/5xx, and
token usage recorded on the row that triggered it, so `/insights` reports a real
cost rather than an estimate.

When the model cannot be reached, `POST /api/verdict` returns **503 and creates
no intent**. `/ask` then computes an arithmetic-only verdict in the browser from
the `BudgetState` it already has, and labels it
`ARITHMETIC ONLY — POLICY CHECK UNAVAILABLE`. A fabricated verdict is never
shown, and nothing is recorded for one.

A cited `rule_ref` that is not in the rules supplied to the model is dropped to
`null`. A citation you cannot find is worse than no citation.

---

## Design system

Radius is 0 everywhere, buttons included. No gradient, no glow, no shadow, no
bento grid. The accent appears only as type, a 1px rule, a marker dot, the
progress spine, or an active state — **never as a filled area, a background, or
a button fill**.

### Tokens

| Token | Value | Role |
|---|---|---|
| `--color-ground` | `#E8E6DF` | Page ground |
| `--color-ground-2` | `#DEDBD2` | The hero field, and nothing else |
| `--color-ink` | `#151515` | Body, headlines, values |
| `--color-ink-2` | `#494844` | Secondary text |
| `--color-muted` | `#75736C` | Labels, meta |
| `--color-accent` | `#C4442C` | Type, 1px rules, marker dots, the spine, active states |
| `--color-hairline` | `rgba(21,21,21,.16)` | Every border in the app |

Spacing: **4 / 8 / 12 / 16 / 24 / 34 / 56 / 88 / 144**. Nothing between.

| Role | Face | Size | Tracking |
|---|---|---|---|
| Display XL | Familjen Grotesk 700 | `clamp(38px, 6.4vw, 104px)` | −.035em |
| Display L | Familjen Grotesk 600 | `clamp(28px, 3.4vw, 52px)` | −.03em |
| Display M | Familjen Grotesk 700 | `clamp(32px, 4vw, 64px)` | −.03em |
| Label | Spline Sans Mono 500 | 9.5px | .14em |
| Value | Spline Sans Mono 500 | 11.5px | .12em |
| Body | Spline Sans Mono 400 | 11.5px / 1.75 | .12em |

Every figure is `tabular-nums`, so a count-up never reflows the row beside it.

### The one thing this app is remembered by

**Hollow type means money that stayed put.** The outline is not a headline
style — it is the app's one piece of semantics. Solid type is money that moved;
outlined type is money that did not. `/ask` sets `HOLD` solid beside an outlined
qualifier at 64px; the hero sets the Kept figure as a 660px hollow numeral
behind everything. Same device, two scales, one meaning.

Every other rule exists to keep it legible: the accent never fills an area, so
hollow always reads as hollow; radius is 0, so a stroke is a stroke; the ledger
row is the only layout primitive, so nothing competes with the type.

`LedgerRow` is that primitive. Transactions, policy rules, holds, bills,
insights and settings all render through it. There is no card anywhere.

---

## Running it

```bash
cp .env.example .env        # fill in DATABASE_URL, DIRECT_URL, ANTHROPIC_API_KEY
npm install
npx prisma migrate deploy
npm run db:seed             # idempotent: re-running leaves one copy, not two
npm run dev
```

| Script | What it does |
|---|---|
| `npm test` | Unit suites plus the import-idempotency integration suite |
| `npm run eval` | Both eval suites against the live prompts (needs a key) |
| `npm run eval:validate` | Fixture integrity only — no model calls, no key |
| `npm run e2e` | Playwright smoke tests |
| `npm run check:no-secrets` | Scans the built client bundle for server secrets |
| `npm run db:seed` | Rebuilds the demo dataset |

---

## Deploying to Netlify

Run `npm run check:netlify` before every push. It parses `netlify.toml` and
fails on the things that cost a whole build to discover — a duplicate function
table, a functions directory Netlify will not look in, a schedule that
disagrees with the one in the function's own config.

### Environment variables

Set these in **Site configuration → Environment variables**. Every one is
server-side; **never prefix any of them with `NEXT_PUBLIC_`**, which would ship
the value to the browser.

| Variable | Scope | Why that scope |
|---|---|---|
| `DATABASE_URL` | **Functions + Builds** | The pooled Neon string. Functions query through it, and `prisma migrate deploy` needs it at build to resolve the datasource — missing it fails the build with `Environment variable not found: DATABASE_URL`. |
| `DIRECT_URL` | **Builds** | The direct (unpooled) Neon string. `prisma migrate deploy` runs migrations over it during the build; missing it fails the build at the migration step, before `next build` starts. Runtime never uses it. |
| `ANTHROPIC_API_KEY` | **Functions only** | Never needed at build. Scoping it to Functions keeps it out of the build environment entirely. |
| `APP_TIMEZONE` | Functions + Builds | `Asia/Dubai`. Period boundaries and the `UsageCounter` day key. Falls back to `Asia/Dubai` if unset. |
| `DEFAULT_CURRENCY` | Functions + Builds | `AED`. Falls back to `AED` if unset. |
| `VERDICT_DAILY_LIMIT` | Functions | `100`. The daily cap on model calls. Falls back to `100` if unset. |

`URL` and `DEPLOY_PRIME_URL` are provided by Netlify and are what
`POST /api/import` uses to reach the background function. Nothing needs setting
for those.

**Verified:** no client bundle contains any of these names or values.
`npm run check:no-secrets` scans the real build output for the literal secret
values, for Anthropic SDK markers, and for any `NEXT_PUBLIC_` variable named
like a credential.

### The build command

```
prisma generate && prisma migrate deploy && next build
```

Each stage was checked against a real database:

- **Fresh deploy** — `migrate deploy` applies every migration in
  `prisma/migrations`.
- **Redeploy** — `migrate deploy` reports *No pending migrations to apply* and
  changes nothing. It is safe to run on every build.
- **`next build` needs no database at all.** Every route is `force-dynamic`, so
  nothing queries at build time; a build with `DATABASE_URL` and `DIRECT_URL`
  unset still succeeds. The only build-time database requirement is the
  migration step.

### Functions

The functions live at `src/netlify/functions`, which is where the build
specification puts them. Netlify defaults to `netlify/functions` at the
repository root, so `netlify.toml` sets `directory` explicitly. Getting this
wrong fails silently: no cron, no background import, and no error anywhere.

| Function | How it runs | What makes it so |
|---|---|---|
| `import-background` | Background, up to 15 min, returns 202 at once | The `-background` suffix **in the filename**. Renaming the file turns it back into a sync function bound by the 10s timeout. |
| `nightly-sweep` | Scheduled, 20:00 UTC (midnight in Dubai), 30s cap | `schedule` in `netlify.toml`, mirrored in the function's own `config` export. `check:netlify` asserts the two agree. |

Both were bundled with Netlify's own `zip-it-and-ship-it` to confirm the
Prisma client, its `libquery_engine-*.so.node` binary and `schema.prisma` all
land inside each function, that the `@/…` path aliases resolve, and that
`import-background` reports `invocationMode: background`.

---

## Evals

`npm run eval` runs 30 verdict fixtures and 20 parse fixtures against the live
prompts, prints a table with a diff per failure, and exits non-zero below **90%
on verdict decisions** or **95% on parse amounts**. CI runs it on any change
under `src/lib/ai/`.

Verdict coverage: 6 clear allows, 8 clear holds, 4 clear declines, 6 boundary
cases landing within 5% of a limit, 4 where a hard rule contradicts the
arithmetic and must win, and 2 with no applicable rule at all.

Parse coverage: English with and without a balance, Arabic-English mixed, a
truncated merchant, a credit, an OTP, a balance enquiry, a promotion, a refund,
and one message whose amount is unreadable — which must come back as
`amount_fils: null` with confidence below 0.3, never as a guess.

The fixtures are generated (`evals/build-fixtures.ts`) so every `budget_state`
in them is internally consistent, and the runner re-checks that before spending
a token. A fixture whose arithmetic does not add up tests nothing.

---

## Tradeoffs

**`dailyBurn` is left exactly as specified, and a companion was added beside
it.** §6.2 defines it as `spentTotal / days elapsed`. With rent landing on day
one of the seeded period, that projects AED 45,749 against an income of 18,000
— arithmetically correct and useless to act on. Rather than quietly redefine
the specified figure, `BudgetState` also carries
`spentDiscretionary` / `dailyBurnDiscretionary` / `projectedEndSpendDiscretionary`,
and the burn line reads those. Both are visible on `/insights`, labelled.

**Idempotency is belt and braces, because retries are certain.** Netlify retries
a failed background function after 1 minute and again after 2. Only `PENDING`
rows are processed, *and* writes use `skipDuplicates` against the composite
unique on `Transaction`. The integration suite deliberately removes the first
guard to prove the second holds alone.

**The parser is allowed to say it does not know.** An unreadable amount comes
back as `null` with low confidence and becomes a row a human fixes, not a
plausible number. Rows below 0.6 confidence carry an accent marker in the
ledger until reviewed.

**Recurring-charge detection is conservative about creating bills.** It matches
existing bills on amount and due day rather than label, because the statement
never spells a bill the way you did. Without that, the sweep created
`Landlord Transfer` alongside an existing `Rent` and counted the same AED 7,000
twice in `committedBills`. Detected bills are flagged as such so you can switch
off a false positive.

**Kept is defined so it cannot be inflated.** `release` is not a legal
transition from `OPEN` — only a hold that actually waited, or a decline you did
not act on, counts. Illegal transitions are a 409, not a silent no-op, so a
double-tapped "Let it go" cannot count twice. A Playwright test asserts the
figure equals the definition, recomputed independently.

**`prefers-reduced-motion` and no-JS render the finished app.** Reveal's start
state only applies under a `.js-reveal` class that an inline head script adds
before first paint, and only after confirming reduced motion was not requested.
Anything above the fold reveals on `requestAnimationFrame` rather than being
observed — an IntersectionObserver with a negative root margin never intersects
on a short viewport and would strand the content invisible forever.

**No chart library.** Both charts are hand-authored SVG. The burn line measures
its own path with `getTotalLength()` to self-draw.

---

## What is not here

No investment advice, no debt product recommendations, no bank API
integrations, no price comparison, no receipt OCR, no multi-currency
conversion, no social features, and no notifications beyond the in-app ones.

Every figure displayed anywhere — including on the signed-out home — is
computed from seeded or real data. There are no fabricated statistics,
testimonials, user counts, logos, or press mentions in this application or in
this README.

See `DECISIONS.md` for the choices made where the specification was silent, and
`DESIGN.md` for the design plan the interface was built to.
