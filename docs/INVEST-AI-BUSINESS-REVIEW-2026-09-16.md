# InvestAI business review — 16 September 2026

Read-only review of `jaredphillips99-cyber/space-tracker` (`main` = `91cf1cf`).
Product code was not changed. This file is the only deliverable.

**Live site probed:** `https://portfolio-analysis-six.vercel.app`
**Prior review:** 6–7 September 2026 cloud-agent architecture/security review
(`bc-876b2bde-cab7-46bd-8dc4-f79f79837d39`), same git SHA.

No user counts, conversion rates, TAM, ARR, or API-dollar figures appear below.
Those numbers are not in this repo and were not measured.

---

## Verdict

InvestAI is a **high-quality personal research terminal** for a **49-name thematic
book**, not an AI-industry-wide tracker and not a productizable SaaS in its
current shape.

Keep it as a hobby / resume-grade personal tool. Do not sell it as “AI industry
coverage” without a different universe and a different architecture. Do not
charge strangers until the Claude and household-PII routes have server-side
auth — those routes are reachable with `curl` today.

That is the same technical picture the September 6 review documented. **`main`
has not moved since 16 August 2026** (`91cf1cf`, “Replace Needs Attention
sidebar with Upcoming Earnings bar”). The September 6 findings still describe
this tree. A few live-routing details changed or were clarified; they are
called out in the verification table.

The project’s own description already matches this conclusion:

> “Personal research tool, also presented professionally (resume,
> finance/wealth management audiences).”
> — `CLAUDE.md` lines 3–9

---

## Method

- Re-read `src/config/tickers.ts`, `src/config/themes.ts`, `src/config/gics.ts`,
  `src/App.tsx`, `src/store/useStore.ts`, `src/hooks/useAnalysis.ts`,
  `src/hooks/useSupabaseSync.ts`, `src/hooks/useLivePrice.ts`,
  `api/analyze.ts`, `api/portfolio.ts`, `api/retirement.ts`, `api/prices.ts`,
  `api/edgar.ts`, `api/edgar-proxy.ts`, `scripts/newswire.mjs`,
  `src/lib/indexCalc.ts`, `.github/workflows/newswire.yml`, `package.json`,
  and the docs (`CLAUDE.md`, `PROJECT_INSTRUCTIONS.md`, `README.md`,
  `DEPLOY_INSTRUCTIONS.md`).
- Counted tickers and GICS maps from source (Node one-liners, not estimates).
- Hit production HTTP endpoints **without** sending filing text or a prompt
  that would invoke Claude successfully.
- Compared against the September 6 architecture/security review of the same SHA.

Not done: live Supabase RLS inspection, a real analysis run, sending dollar
figures to Anthropic, user interviews, competitive pricing research.

---

## 1. Gaps vs an AI-industry-wide tracking objective

### What the app actually tracks

The stated product is a **curated five-sector book**, not “the AI industry.”
Dashboard pills (`src/types/index.ts`): `space`, `ai_infrastructure`,
`defense`, `clean_energy`, `cyber`.

`src/config/tickers.ts` `TICKERS` / `ALL_TICKERS` — **49 unique names**,
primary sector = `sectors[0]`:

| Primary pill | Count | Names |
|---|---|---|
| space | 8 | RKLB, PL, RDW, LUNR, ASTS, BKSY, FLY, SPCX |
| ai_infrastructure | 23 | NVDA, PLTR, CRWV, IREN, NBIS, CIFR, RIOT, VRT, MOD, MSFT, GOOGL, AMZN, META, ANET, MU, SMCI, AVGO, INTC, DELL, PWR, ETN, EQIX, GNRC |
| clean_energy | 10 | CEG, VST, BWXT, GEV, BE, CCJ, LEU, NXE, OKLO, NNE |
| cyber | 5 | CRWD, PANW, NET, ZS, FTNT |
| defense | 3 | KTOS, LHX, AVAV |
| **Total** | **49** | |

KTOS is tagged `defense` primary / `space` crossover in `tickers.ts`
(lines 62–68). SPCX is `space` + `ai_infrastructure`. PWR is
`ai_infrastructure` + `clean_energy`. Sub-indices use primary sector only
(`src/lib/indexCalc.ts` lines 7–9, 87–90).

Thematic overlay (`src/config/themes.ts`): four themes
(`space_economy`, `ai_infrastructure`, `defense`, `clean_energy_nuclear`).
The five cyber names sit under the **AI-infrastructure theme**,
`cybersecurity` sub-theme (lines 141–145) — not a fifth theme.

The widget labeled **“AI Index”** (`INDEX_DISPLAY.composite` in
`src/lib/indexCalc.ts` line 74) is the **full 49-name book**, including
launch, uranium, and defense names. It is equal-weight, buy-and-hold,
`INDEX_BASE_DATE = '2025-07-31'` (`src/lib/indexCalc.ts` lines 11–19, 71).
It is not an AI-industry index.

### Where that diverges from “AI industry-wide”

If the objective is to track publicly listed AI **as an industry**, this
universe is a **conviction slice**, not a coverage map. Evidence is presence
or absence in `TICKERS`, not market-share estimates.

**In the 23-name AI-infra primary list**

- Hyperscalers: MSFT, GOOGL, AMZN, META.
- Accelerators / custom silicon: NVDA, AVGO, INTC.
- Memory: MU.
- GPU-cloud / miner-pivot: CRWV, IREN, NBIS, CIFR, RIOT.
- Networking / servers: ANET, SMCI, DELL.
- Power / cooling / colocation: VRT, MOD, PWR, ETN, EQIX, GNRC.
- Application software (dedicated): **PLTR only**.

**Not in `TICKERS` (checked against the 49-name list)**

These are examples of public names a generic “AI industry” book usually
has to take a view on. They are **absent**, not “underweighted”:

- Foundry / equipment / EDA: TSM, ASML, AMAT, LRCX, KLAC, SNPS, CDNS, ARM.
- Merchant accelerators besides NVDA: AMD, MRVL.
- Other compute / interconnect: QCOM, TXN, CRDO, ALAB, HPE.
- Cloud / enterprise software: ORCL, SNOW, DDOG, NOW, CRM, ADBE, IBM, PATH, AAPL.
- Consumer / other AI-adjacent: TSLA, APP, SOUN, BBAI, AI (C3.ai).
- Other cyber: S, OKTA, CHKP, CYBR, RBRK.
- Other data-center landlords: DLR.

`src/config/gics.ts` `KNOWN_TICKERS` **does** classify many of those names
for Portfolio *external* positions (file comment at line 286 says “~800
tickers”; counted **1,053** unique `TICKER: {` keys in that object). That
map is a classification fallback. It does **not** put those names on the
Dashboard, News ranking, newswire cron, or AI Index.

**Other structural gaps vs industry-wide tracking**

- No private-company layer (OpenAI, Anthropic, xAI as issuers). SPCX’s
  `specialNotes` mention an xAI/Colossus crossover (`tickers.ts` lines 70–77);
  that is a comment, not a modeled xAI line.
- CIFR and RIOT are in AI-infra with notes that they are still primarily
  Bitcoin miners (`tickers.ts` 119–133). That is a thesis bet, not a
  standard industry taxonomy.
- News is Yahoo RSS for the 49 names only (`scripts/newswire.mjs`
  `TICKERS` array, lines 18–78). There is no sector news wire, no 13F,
  no conference-transcript product, no supply-chain graph.
- Analysis is **on-demand, filing-grounded, one ticker at a time**
  (`api/analyze.ts`, `StockDetail.tsx`). There is no scheduled
  industry briefing. `CLAUDE.md` Stage 2 (“Python backend, SEC EDGAR
  monitoring, scheduled analysis pipeline”) is marked **not started**.
- Copy still describes a narrower book than the UI: Dashboard subtitle
  omits Cyber (`src/pages/Dashboard.tsx` lines 26–28); `tickers.ts`
  section comment still says `// ── Space (9)` after SATS’s removal.

**Bottom line for this objective:** InvestAI tracks **Jared’s curated
thematic universe**. Calling the composite “AI Index” and the product
“InvestAI” oversells industry completeness. Closing that gap is a
**universe + ranking + research-pipeline** project, not a rename.

---

## 2. Monetization paths and what each would require

There is **no billing code**. Grep across `src/` and `api/` finds no Stripe,
paywall, plan, or usage meter. Auth is Supabase magic link. `package.json`
name is still `"space-tracker"`; `index.html` `<title>` is `space-tracker`.

Variable cost that *is* in source: Anthropic `claude-sonnet-4-6` on
`/api/analyze` (two calls, `max_tokens` 2000 then 2500), `/api/portfolio`
(20/IP/hr, several request types, web search on `cash_deploy` /
`macro_risk` / `sector_explore`), `/api/retirement` (15/IP/hr,
`max_tokens` 1400). News, prices, and the index are designed to be
**zero Claude cost** (`scripts/newswire.mjs` header; `src/lib/indexCalc.ts`).

Rate limits are in-memory `Map`s keyed by the first `x-forwarded-for` hop
(`api/analyze.ts` 4–17, 210–214; `api/portfolio.ts` 5–18, 1098–1101;
`api/retirement.ts` 67–78, 259–260). They reset on cold start and are not
shared across isolates. `/api/prices` and `/api/edgar-proxy` have **no**
rate limit.

Live checks on 16 September 2026 (no Claude completion):

| Request | Result | Meaning |
|---|---|---|
| `GET /api/prices?tickers=NVDA` | HTTP 200, live quote payload | Public Yahoo proxy, no auth |
| `POST /api/analyze` `{}` | HTTP 400 `ticker is required` | Reached handler; **not** 401 |
| `POST /api/portfolio` `{"type":"macro_risk"}` | HTTP 500 `FUNCTION_INVOCATION_FAILED` | No auth; crashes before a clean 4xx (`positions.map` at `api/portfolio.ts` 389 has no array guard) |
| `POST /api/retirement` `{}` | HTTP 400 `annualSalary and primaryContributionPct are required` | Reached handler; **not** 401 |
| `GET /api/edgar?ticker=NVDA` | Vercel HTML **404 NOT_FOUND** | Function file still in git (`api/edgar.ts`); **not routed** on this production deploy |

Net Worth / Retirement / Portfolio UI gates (`NetWorthAuthGate.tsx`,
`RetirementAuthGate.tsx`, `PortfolioAuthGate.tsx`) all offer
“Continue without saving.” They do not bind the HTTP APIs.

`analyses` writes upsert **on `ticker`** (`useAnalysis.ts`
`pushToSupabase`, lines 135–137) — one shared row per symbol, not per user.

### Path A — Keep it personal (no revenue)

**Fit:** Matches the code and `CLAUDE.md`.

**Build (if the URL stays public):** server-auth the Claude routes;
stop treating any magic-link session as admin (`src/store/useStore.ts`
7–13, 79–83; `src/App.tsx` 31–42; `src/components/AuthGate.tsx` 16–19);
durable rate limits; restrict who can upsert `analyses`. Optional: lock
the Vercel deployment to you.

**Do not build:** billing, multi-tenant accounts, industry-complete
universe, Stage 2 scheduler.

### Path B — Paid research terminal (B2C subscription)

Charge for filing-grounded memos + the thematic watchlist.

**Missing in this repo, required to charge:**

1. Server-side auth on `/api/analyze`, `/api/portfolio`, `/api/retirement`.
2. Durable rate limits / quotas (KV or equivalent), including `/api/prices`.
3. Real billing (Stripe or similar), plan entitlements, customer portal.
4. Per-user data, not `upsert on ticker` for analyses and not
   `isAdmin` in `localStorage`.
5. Terms, privacy policy, and an **investment-advice** stance.
   `api/analyze.ts` instructs “You are a financial analyst” and asks for
   `convictionRating` `strong_buy`…`strong_sell`. Only `api/retirement.ts`
   (lines 222, 249) has an “educational information, not personalized
   financial or tax advice” line. Portfolio prompts have no equivalent
   disclaimer in source.
6. Licensed market data if Yahoo’s unofficial `yahoo-finance2` path is
   not acceptable for a paid product (`api/prices.ts`, `package.json`).
7. Tests and build CI. There are **zero** `*.test.*` / `*.spec.*` files
   and **no** `test` script. The only GitHub Action is the newswire cron
   (`.github/workflows/newswire.yml`). `tsconfig.app.json` `include` is
   `src` only — `api/**/*.ts` is not typechecked by `npm run build`.
8. `vite.config.ts` has no `/api` proxy; local `npm run dev` cannot
   exercise serverless functions.

**Product risk:** Seeking Alpha, Koyfin, TIKR, Bloomberg, and ChatGPT
already cover “AI on filings.” The differentiator here is the **curated
book + filing fetch quirks (FPI 6-K, speculative 10-Q)** — a niche, not
a category.

### Path C — Newsletter / gated content

Sell the memos, not the app.

**Missing:** Stage 2 scheduled analysis (`CLAUDE.md` “not started”);
email/CMS; rights to publish model output; still need auth so the public
app cannot drain the Anthropic key.

### Path D — RIA / wealth white-label

Net Worth and Retirement send **real dollars** by design
(`api/portfolio.ts` `networth_analysis`; `api/retirement.ts`). Those
HTTP handlers are unauthenticated. Portfolio’s percentage-only rule is
already leaky: `buildCashContext` sends whole-share counts and leftover
**dollars** (`src/components/compare/PortfolioTab.tsx` 1191–1226;
`api/portfolio.ts` ~730–734).

This path also needs audit logs, multi-account-of-record, compliance
review, and an actual firm — none of which exist in source.

### Path E — Index or data license

The “AI Index” is a homemade equal-weight series over 49 names, prices
from Yahoo, history approximated where needed (`scripts/indexBackfill.mjs`
header). It is not a licensed index. Do not sell it as one.

### What is actually strong (keep these if anything is commercialized)

- Filing-grounded two-call analysis, not a generic chatbot wrapper
  (`api/analyze.ts`; browser EDGAR in `StockDetail.tsx`).
- FPI 6-K scan for NBIS (20-F) and CCJ (40-F).
- Zero-Claude News ranking (`src/lib/newsRanking.ts`) and index math
  (`src/lib/indexCalc.ts`).
- Portfolio conviction overlay (themes + non-theme GICS stances).
- Cost discipline on the front page.

Those are **personal-terminal** strengths. They are not a moat against
incumbent research platforms without auth, tenancy, and a clearer wedge.

---

## 3. Hobby vs productize

**Recommendation: stay a hobby-grade personal terminal.** Present it on a
resume as a built research dashboard. Do not productize in the next
build cycle.

| Signal | Hobby / personal | Product |
|---|---|---|
| Own docs | “Personal research tool” (`CLAUDE.md`) | Would need a market, pricing, ToS |
| Universe | 49-name conviction book | Industry-wide or a named niche with coverage rules |
| Auth | Any magic-link session ⇒ `isAdmin` (`useStore.ts`, `App.tsx`) | Allowlist + server auth |
| Analyses | Shared `upsert` on `ticker` | Per-user or per-tenant |
| Claude | Public proxies, in-memory IP limits | Quotas, billing, abuse controls |
| Tests / CI | None | Required |
| Docs | `README.md` is the Vite template; `PROJECT_INSTRUCTIONS.md` still lists dead URL `stock-tracker-five-tau.vercel.app` and SATS; `DEPLOY_INSTRUCTIONS.md` is Stage-1 local-path notes | One current deploy + security story |
| Brand | `index.html` title `space-tracker`; package name `space-tracker` | InvestAI naming consistent |
| Household finance | Admin-gated in UI, open in HTTP | Do not ship to third parties as-is |
| Stage 2 | Not started | Needed for “always-on research product” |

**If the goal is resume / professional presentation:** the UI (News,
Dashboard, filing deep-dive, Portfolio simulation, Index) is already
the artifact. Tighten public API auth so a stranger cannot spend the
Anthropic key or POST a net-worth payload. Do not expand the universe
just to look “more complete.”

**If the goal is a company:** pick **one** wedge *after* P0 security,
for example “filing-grounded earnings memos on a disclosed thematic
universe.” Drop or strictly isolate Net Worth / Retirement from any
external product. Do not lead with “AI-industry-wide tracking” — the
49-name book cannot support that claim.

**If the goal is personal investing:** the current Stage 1.5 app
already does that job. Expanding toward industry-wide coverage or
SaaS tenancy would compete with the tool’s actual use.

---

## September 6 findings — re-verified on this SHA

`main` is still `91cf1cf` (16 August 2026). Almost every September 6
code claim still holds. Differences are live routing and a few
clarifications.

| Sep 6 claim | 16 Sep status |
|---|---|
| Curated research dashboard, not a broker | **Unchanged** — restated as the business verdict above |
| 49 tickers, SATS absent | **Unchanged** — counted from `tickers.ts` |
| `pushAnalysis` in `useSupabaseSync` never called; `App.tsx` discards the return | **Unchanged** (`App.tsx` 21–22; `useSupabaseSync.ts` 107–131) |
| Analyses **do** write via `useAnalysis.pushToSupabase` on SSE `done`, not gated on `isAdmin` | **Unchanged** (`useAnalysis.ts` 115–144, 273–286). `CLAUDE.md` “KNOWN OPEN BUG / wire `pushAnalysis`” is still **stale** |
| Claude + PII routes have no server auth | **Unchanged**; live `curl` above |
| In-memory rate limits; prices/edgar-proxy unlimited | **Unchanged** |
| `api/edgar.ts` still in tree (31-name CIK map, SATS, TRAINING_KNOWLEDGE_FALLBACK) | **File still present.** Production `GET /api/edgar?ticker=NVDA` returned Vercel **404 NOT_FOUND** (function not routed). Sep 6 assumed it deployed as a live GET; **do not treat it as a live spender** until a deploy actually serves it. Still delete or exclude it so a future deploy cannot revive it |
| Index equal-weight, `INDEX_BASE_DATE = '2025-07-31'` | **Unchanged**; `CLAUDE.md` still documents cap-weight / `2026-07-31` |
| KTOS tagged `space` in newswire vs `defense` primary | **Unchanged** (`scripts/newswire.mjs` line 25 vs `tickers.ts` 62–65) |
| NBIS system prompt still says no automated fetch | **Unchanged** (`api/analyze.ts` 166–175) |
| NXE in both `SPECULATIVE` and `SEDAR_ONLY` | **Unchanged**. Fetch is SEDAR-only (`StockDetail.tsx` 383–395); `filingRegimeFor` defers to `SEDAR_ONLY` first (95–98). Harmless redundancy, not dual-fetch |
| `buildCashContext` leftover dollars | **Unchanged** |
| `rowToAnalysis` does not map `conviction` | **Unchanged** (`useSupabaseSync.ts` 25–41) |
| Hydration effect `[]` deps captures first-render `analyses` | **Unchanged** (`useSupabaseSync.ts` 72–104) |
| Missing env: `supabase.ts` **warns**, does not throw | **Unchanged** (lines 5–10). `CLAUDE.md` still says fatal init |
| Prices fetched once (`useLivePrice` empty deps) | **Unchanged** |
| No tests / no build CI | **Unchanged** |
| Onboarding: 4 tabs, no Retirement; “live-priced crypto”; sidebar “needs attention” | **Unchanged** (`OnboardingModal.tsx` 11–32) |
| `isAdmin` persisted; Continue-as-reader does not `signOut()` | **Unchanged** (`useStore.ts` 79–83; `AuthGate.tsx` 131–138) |
| `analyses` RLS / CREATE TABLE not in repo | **Unchanged** — still unverified live (no credentials used) |
| edgar-proxy UA includes name + email | **Unchanged** (`api/edgar-proxy.ts` line 3) |

September 6 ranked P0s remain the right engineering order **if** the
site stays on the public internet, whether or not the product is sold:

1. Server-auth `/api/analyze`, `/api/portfolio` (at least
   `networth_analysis`), `/api/retirement`.
2. Durable rate limits; cover prices and edgar-proxy; fail closed.
3. Delete or exclude `api/edgar.ts` so it cannot return in a deploy.
4. Confirm live `analyses` RLS; keep a single write path; **do not**
   “wire `pushAnalysis`” as if nothing writes.
5. Admin email allowlist; stop persisting `isAdmin`; Continue-as-reader
   should `signOut()`.

Those are **safety** items for a personal tool on a public URL, not a
product roadmap.

---

## Appendix — source map

| Concern | Where |
|---|---|
| Stated product + stage | `CLAUDE.md` 1–26 |
| Universe | `src/config/tickers.ts` |
| Themes | `src/config/themes.ts` |
| GICS + 1,053-name fallback | `src/config/gics.ts` |
| Routes | `src/App.tsx` |
| Admin flag | `src/store/useStore.ts`, `src/components/AuthGate.tsx` |
| Analysis write | `src/hooks/useAnalysis.ts` `pushToSupabase` |
| Unused write helper | `src/hooks/useSupabaseSync.ts` `pushAnalysis` |
| Claude stock analysis | `api/analyze.ts` |
| Portfolio / net worth Claude | `api/portfolio.ts` |
| Retirement Claude | `api/retirement.ts` |
| Prices | `api/prices.ts`, `src/hooks/useLivePrice.ts` |
| Index | `src/lib/indexCalc.ts`, `scripts/indexCalc.mjs` |
| Newswire | `scripts/newswire.mjs`, `.github/workflows/newswire.yml` |
| Filing fetch | `src/components/StockDetail.tsx` |
| Dead EDGAR function | `api/edgar.ts` (in git; 404 on production this check) |
| Package / title | `package.json`, `index.html` |

**Deploy note:** this review is documentation only. No app deploy.
Production remains whatever Vercel last built from `main` (`91cf1cf`).
