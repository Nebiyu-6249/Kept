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
     │ OpenAI           │        │ Neon Postgres     │  │ Netlify     │
     │ gpt-4.1          │        │ via Prisma        │  │ functions   │
     │                  │        │                   │  │             │
     │ verdict  (strict │        │ pooled at runtime │  │ import-     │
     │   json, 700 tok) │        │ direct for migrate│  │  background │
     │ parse-sms (2000  │        │                   │  │  (15 min)   │
     │   tok, 20/call)  │        │                   │  │ nightly-    │
     └──────────────────┘        └───────────────────┘  │  sweep (30s)│
                                                        └─────────────┘
```

**The UI never computes a figure.** Every number on screen comes from
`BudgetState`, assembled once in `src/lib/budget-state.ts` and read by the
verdict engine, `/ask`, the rail and `/insights` alike.

### Why the AI layer is shaped this way

Both model calls use structured outputs (`response_format: json_schema`,
`strict: true`), so a well-formed response always carries exactly one result
matching the schema — nothing is parsed out of prose. Every call goes through
one wrapper (`src/lib/ai/client.ts`) with a 25s abort, one retry on 429/5xx, and
token usage recorded on the row that triggered it, so `/insights` reports a real
cost rather than an estimate.

The vendor sits behind `src/lib/ai/provider.ts`. `verdict.ts` and `parse-sms.ts`
describe what they want — a prompt, a schema, a token budget — and never learn
who answers; the timeout, the retry and the usage accounting live in the shared
client so swapping vendors cannot quietly change them.

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
cp .env.example .env        # fill in DATABASE_URL, DIRECT_URL, OPENAI_API_KEY
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

### Two Neon connection strings, and they are not interchangeable

Neon gives you the same database over two different hosts. Getting them the
wrong way round is the single most common way this deploy fails.

| | Pooled | Direct |
|---|---|---|
| Goes in | `DATABASE_URL` | `DIRECT_URL` |
| Host | contains **`-pooler`** | does **not** contain `-pooler` |
| Where in Neon | Console → your project → **Connection Details**, with **"Connection pooling" ON** | the same panel, with **"Connection pooling" OFF** |
| Used by | every query the app makes at runtime | `prisma migrate deploy`, during the build only |
| Why | serverless functions open a connection per invocation and would exhaust a direct connection limit | migrations need a real session: advisory locks and DDL do not survive a transaction pooler |

Pasting the pooled string into both is the failure `npm run preflight` exists
to catch — it exits 1 and names it rather than letting migrations behave oddly.

### Environment variables

Set these in **Site configuration → Environment variables**, and make sure each
is available to the **Production** deploy context — a variable scoped only to a
branch or preview context is invisible to the production build, which reads as
"not set". Every one is server-side; **never prefix any with `NEXT_PUBLIC_`**,
which would ship the value to the browser.

| Variable | Scope | Value | Why that scope |
|---|---|---|---|
| `DATABASE_URL` | **Functions + Builds** | Neon **pooled** (`-pooler` in host) | Functions query through it, and `prisma migrate deploy` needs it at build to resolve the datasource. Missing it fails the build with `Environment variable not found: DATABASE_URL`. |
| `DIRECT_URL` | **Builds** | Neon **direct** (no `-pooler`) | `prisma migrate deploy` runs migrations over it during the production build. Missing it is the `P1012` failure. **Runtime never reads it** — verified by querying with it absent — so Builds-only is correct and sufficient. |
| `OPENAI_API_KEY` | **Functions only** | `sk-proj-…` | Never needed at build. Functions-only keeps it out of the build environment entirely. The build preflight reports it as a warning, not a failure, because a build genuinely cannot see a Functions-scoped variable. |
| `OPENAI_MODEL` | Functions | `gpt-4.1` (default) | Optional. Changing it changes what the evals measure, so re-run `npm run eval` after touching it. The preflight warns if it names a reasoning model, which will not accept the `temperature: 0` the spec fixes. |
| `APP_TIMEZONE` | Functions + Builds | `Asia/Dubai` | Period boundaries and the `UsageCounter` day key. Defaults to `Asia/Dubai`. |
| `DEFAULT_CURRENCY` | Functions + Builds | `AED` | Defaults to `AED`. |
| `VERDICT_DAILY_LIMIT` | Functions | `100` | Daily cap on model calls. Defaults to `100`. |

`URL` and `DEPLOY_PRIME_URL` are provided by Netlify and are what
`POST /api/import` uses to reach the background function. Nothing to set.

**Verified:** no client bundle contains any of these names or values.
`npm run check:no-secrets` scans the real build output for the literal secret
values, for OpenAI SDK markers, and for any `NEXT_PUBLIC_` variable named
like a credential.

### Preflight

Every build command starts with a preflight that checks the whole environment
and reports **every** problem at once, each with the scope it needs and where
to find it in Neon — so one failed build tells you everything, not just the
first thing.

```bash
npm run preflight              # what an ordinary build needs
npm run preflight:migrations   # adds DIRECT_URL, for the production build
npm run preflight:runtime      # what a deployed function needs
```

It reads `.env` the same way the Prisma CLI does, so a local run of the build
command behaves exactly like the deploy.

### The build command

Migrations run in **one context only**:

```
[build]                 npm run preflight            && prisma generate &&                          next build
[context.production]    npm run preflight:migrations && prisma generate && prisma migrate deploy && next build
```

A deploy preview or branch deploy therefore never alters the production schema,
and — because `next build` needs no database at all — touches Postgres zero
times during its build.

Each stage was checked against a real database:

- **Fresh deploy** — `migrate deploy` applies every migration in
  `prisma/migrations`.
- **Redeploy** — reports *No pending migrations to apply* and changes nothing.
- **`next build` needs no database.** Every route is `force-dynamic`, so a build
  with `DATABASE_URL` and `DIRECT_URL` unset still succeeds. The only build-time
  database requirement is the migration step.

Run `npm run check:netlify` before pushing. Besides parsing the TOML it asserts
that the default command does *not* migrate, that the production one does, and
that its preflight is in `--migrations` mode.

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

**The suites are the gate on a provider or model change.** Both system prompts
are the specification's, verbatim, and stay that way unless an eval run proves a
specific change is needed. Changing `OPENAI_MODEL` changes what these numbers
mean, so re-run them after touching it.

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
