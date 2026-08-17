# InvestAI — CLAUDE.md

## What This Project Is
A curated-universe investment analysis dashboard tracking five dashboard
sectors: space economy, AI infrastructure, defense, clean energy/nuclear, and
cyber, with a full GICS taxonomy underlying the Portfolio tab. Built in
React + Vite + Tailwind, deployed on Vercel, Supabase for persistence.
Personal research tool, also presented professionally (resume, finance/wealth
management audiences). (Ticker count is intentionally not treated as a fixed
number in prose — the universe grows and has already been resized twice
[31→50, then 50→49 on SATS's removal]; say "tracked universe," not a
hard-coded count.)

## Site Name
InvestAI — displayed in the header as INVEST (cyan #00c8ff) + AI (white #e2e4ef)
in Space Mono font.

## Current Build Stage
Stage 1.5 (active): React app with on-demand Claude analysis, live prices from
Yahoo Finance, Supabase persistence for shared analyses, admin magic-link auth,
sessionStorage for portfolio, a zero-Claude-cost newswire pipeline (GitHub
Actions cron → Supabase), and a zero-Claude-cost AI Index layer computed from
prices already in hand. No scheduled Claude analysis pipeline.

Stage 2 (not started): Python backend, SEC EDGAR monitoring, scheduled
analysis pipeline.

## Stack — Do Not Deviate Without Discussion
- React + Vite + TypeScript
- Tailwind CSS
- Zustand for global state
- React Router v6
- Vercel serverless functions in /api/ for all external API calls
- localStorage for stock analysis cache (Stage 1 fallback)
- Supabase for shared analysis persistence (Stage 1.5) and admin magic-link auth
- sessionStorage for portfolio position data (privacy — clears on browser close)
- react-markdown + remark-gfm for rendering all AI output cards
- No charting library — all charts (index sparkline/line chart) are hand-rolled
  inline SVG; keep it that way unless discussed
- GitHub Actions for scheduled cron jobs (newswire + daily index close)

## Production URL
https://portfolio-analysis-six.vercel.app
Do NOT use stock-tracker-five-tau.vercel.app — confirmed DEAD (missing
VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY env vars, throws a fatal Supabase
init exception on load, nothing renders). Do not test against it or reference
it in deploy docs. See the July 24, 2026 session log entry for how this was
diagnosed.

---

## App Layout — Five Top-Level Tabs

Nav order (`src/components/Layout/index.tsx`, `NAV_LINKS`): **News · Dashboard
· Portfolio · Net Worth · Retirement**.

### News (`/`) — landing page
Zero-Claude-cost front page ranked entirely from data already in hand
(`marketCap`/`changePercent` from the store + the `newswire_items` archive).
No LLM calls, no new API cost. Three tiers via the pure `rankFrontPage()`
(`src/lib/newsRanking.ts`):
  - **Lead stories** — sorted by materiality-category presence first, market
    cap as tiebreaker (categorized headlines outrank uncategorized ones
    regardless of cap).
  - **Also moving** — any ticker with an outsized 1-day move (≥5% abs),
    regardless of cap.
  - **Feed** — everything else, reverse-chronological, paginated.
  Diversity-capped at `MAX_PER_TICKER = 3` per tier so one ticker's news day
  can't sweep every slot. Items are deduped by URL and filtered for
  generic/listicle noise and ticker mis-attribution at ingestion (see
  `scripts/newswire.mjs`).
  `IndexTicker` (the AI Index composite + 5 sub-index pills) mounts above Lead
  Stories on this page.

### Dashboard (`/dashboard`)
The full tracked universe as a sortable price table (default sort: 1D% change
descending), sector filter pills (ALL / SPACE / AI INFRA / DEFENSE / CLEAN
ENERGY / CYBER — Dashboard-route-only), and a right-hand sidebar ("What's
New") with a "Today's Wire" news teaser (first 3 items + "See all news →" link
to `/`), an "Upcoming Earnings" section (next 5 tracked tickers with a known
earnings date, soonest first — purely date-driven, added Aug 16, 2026,
replacing the old staleness-based "Needs Attention" section), and "Recently
Analyzed". Staleness warnings live only on the Dashboard price table's STALE
badge (`PriceTable/index.tsx`), driven by `getAnalysisFreshness()`. Row click
opens a stock deep dive at `/stock/:ticker`.

### Portfolio (`/portfolio`)
The investor's actual holdings: live values, unrealized gains, sector
concentration vs. target weights (GICS taxonomy), a thematic conviction layer
(lean-in / neutral / avoid across the four curated themes AND the 8 remaining
GICS sectors), a simulation panel for modeling adds/trims/exits, and
AI-generated macro risk, trim/exit memos, sector exploration, and
cash-deployment suggestions.

**Hard privacy rule:** raw dollar amounts and share counts are never sent to
the Anthropic API from this tab — only computed weight percentages and gain
percentages. Scoped to Portfolio specifically; does not apply to Net Worth or
Retirement (see below).

### Net Worth (`/networth`)
Broader balance-sheet view: cash/balance/credit-card/crypto accounts alongside
Portfolio holdings, admin-gated (`NetWorthAuthGate.tsx`). Crypto accounts are
a **manual dollar value** by default (decision reversed Aug 4, 2026 — the
earlier live-Yahoo-priced symbol+quantity flow is dormant, not deleted; a
legacy row with a stored `crypto_symbol`/`crypto_quantity` still live-prices
until removed and re-added).

**Deliberate exception to the percentage-only privacy rule:** `networth_analysis`
(on `api/portfolio.ts`, same rate-limit bucket as everything else on that
endpoint) may send real dollar figures. Scoped tightly to this feature —
must not bleed into Portfolio prompt-building code.

### Retirement (`/retirement`)
AI contribution-waterfall advisor, admin-gated (`RetirementAuthGate.tsx`).
Fixed prioritization order: employer match → high-APR debt (pulled from Net
Worth data when connected) → remaining tax-advantaged room → other goals.
Single one-shot analysis via `api/retirement.ts` (own 15/IP/hr rate-limit
bucket, separate from both analyze.ts and portfolio.ts). Same deliberate
dollar-figure exception as Net Worth — real salary/balances by design,
admin-only.

Deleted — do not reference or rebuild: `src/pages/Compare.tsx`,
`src/components/compare/ResearchCompare.tsx`,
`src/components/compare/StockPicker.tsx`, `api/edgar.ts` (confirmed dead,
deleted), `api/_shared/` (any shared module under `api/` — see the Aug 6
hotfix log entry for why this breaks on Vercel).

---

## Immutable Schema Decisions

impliedUpsidePercent is NEVER stored in StockAnalysis.
Always computed at render from Yahoo Finance analystTargetPrice and livePrice:
  (analystTargetPrice - livePrice) / livePrice

keyMetrics field in StockAnalysis stores the snapshot string from Call 1 JSON.
2-4 sentence prose with **bold** markdown on key numbers.
Rendered via ReactMarkdown in the purple snapshot block on StockDetail.

status — computed at render, never stored:
  "awaiting"  — analysis is null
  "analyzed"  — within the freshness window (see Analysis Freshness below)
  "stale"     — outside it

segments array is nullable. When null, UI skips segment chart entirely.

businessModel has its own lastUpdated timestamp separate from analyzedAt.

lastEarningsDate is written client-side in `StockDetail.tsx`'s
`handleComplete` (from the EDGAR-fetched filing date) so freshness reflects
the just-analyzed filing immediately, without waiting on a Supabase
round-trip. Also mapped from Supabase's `filing_date` column on sync.

---

## Analysis Freshness — Single Shared Definition

`src/lib/analysisFreshness.ts` — `getAnalysisFreshness(analysis,
nextEarningsDate, lastReportedQuarterEnd)` → `{ status, daysUntilEarnings }`.
Consumed by the Dashboard price table (`PriceTable/index.tsx`) for the STALE
badge. The sidebar (`SidePanel/index.tsx`) no longer consumes this helper as
of Aug 16, 2026 — its "Needs Attention" section was replaced with a purely
date-driven "Upcoming Earnings" section (see that session log entry); do not
assume the two are still unified just because this section predates the
change.

Statuses: `awaiting` · `reportDue` · `earningsToday` · `earningsSoon` ·
`staleFallback` · `analyzed`.

Core rule: **elapsed time alone never makes an analysis stale.** `reportDue`
fires only when Yahoo's earnings date is now in the past AND newer than the
filing actually analyzed (`analysis.lastEarningsDate`). When Yahoo has no
earnings date for a ticker, and only then, it falls back to the flat
`isAnalysisStale()` / `ANALYSIS_STALE_DAYS` rule (`src/types/index.ts`).

---

## KNOWN OPEN BUG — Supabase write not wired up (unresolved as of this session)

`useSupabaseSync.ts` returns a `pushAnalysis(...)` function meant to write a
completed analysis to Supabase. It is currently **never called**:
  - `App.tsx` calls `useSupabaseSync()` and discards the return value entirely.
  - `StockDetail.tsx`'s `handleComplete` only writes to Zustand/localStorage
    via `setAnalysis(...)` — it does not call `pushAnalysis`.

Effect: analyses run in the admin session update local state correctly, but
never reach Supabase, so public (non-admin) visitors and fresh sessions never
see the new analysis, and the Dashboard price table's STALE badge
(`PriceTable/index.tsx`, driven by `getAnalysisFreshness()`) can flag stocks
that were, in fact, just analyzed. This is a real, currently-reproducing bug —
not yet fixed despite earlier diagnosis. Before touching this, re-confirm it still
reproduces on the live deployed build (per the "never re-diagnose from theory"
rule below), then wire `pushAnalysis` into `handleComplete`, gated on
`isAdmin`, and note in the session log that each previously-run ticker needs
one re-run post-deploy to trigger its first real Supabase write.

---

## API Architecture — Do Not Change

Yahoo Finance → `api/prices.ts` (Vercel serverless)
  Never call yahoo-finance2 from the browser. Cache 5 minutes. On error:
  `fetchError: true`, UI shows last cached values. Works for ANY ticker
  symbol — used by Portfolio for external positions too. Has a
  `quoteType === 'CRYPTOCURRENCY'` short-circuit branch that skips the
  stock-only `quoteSummary` round-trip for crypto symbols.

Anthropic API → `api/analyze.ts` (stock analysis, streaming SSE)
  Rate limit: 10 calls per IP per hour. Model: claude-sonnet-4-6.
  Two-call pattern: Call 1 — JSON extraction; Call 2 — narrative (What
  Happened / Bull Case / Bear Case / Key Catalysts).

Anthropic API → `api/portfolio.ts` (portfolio + net worth features, non-streaming)
  Rate limit: 20 calls per IP per hour (separate bucket from analyze.ts AND
  from retirement.ts). Model: claude-sonnet-4-6.
  Request types: `"macro_risk" | "macro_scenario" | "trim" | "trim_memo" |
  "sector_explore" | "cash_deploy" | "networth_analysis"`.
  `useWebSearch` is true for `cash_deploy`, `macro_risk`, and `sector_explore`
  only (`web_search_20250305` tool) — everything else on this endpoint is
  tool-free. Web-search responses can interleave `server_tool_use` /
  `web_search_tool_result` / text blocks, so the handler filters for
  `type === 'text'` and joins; tool-free types keep the single-block
  `content[0].text` read.
  `networth_analysis` shares this same 20-calls/hour bucket — no separate
  limit. It is the ONE exception to the percentage-only privacy rule — do not
  use it as precedent for any other request type on this endpoint.
  JSON-returning types under web search (`sector_explore`) slice from the
  first `[` to the last `]` before `JSON.parse` to survive incidental search
  narration around the array.

Anthropic API → `api/retirement.ts` (retirement contribution-waterfall, non-streaming)
  Rate limit: 15 calls per IP per hour — own bucket, separate from both
  analyze.ts and portfolio.ts. Model: claude-sonnet-4-6. No `tools` array
  (tool-free by design this pass). Single request type
  (`retirement_analysis`), 400s if `annualSalary` or `primaryContributionPct`
  is missing.
  `NETWORTH_GROUNDING_RULE` / `fmtUsd` / `buildAccountLines` /
  `NetWorthAccountPayload` are **duplicated inline** here, matching the same
  copy in `api/portfolio.ts` — deliberately NOT factored into a shared
  `api/_shared/` module. Vercel does not bundle underscore-prefixed `api/`
  paths as importable dependencies, so a shared module 500s both functions at
  runtime with no local-build signal (`tsc`/`npm run build` can't catch it —
  see the Aug 6, 2026 hotfix log entry). Duplicate small `api/` helpers
  inline; do not reintroduce a shared module across Vercel functions here.

SEC EDGAR → fetched browser-side in `StockDetail.tsx`
  CORS proxy at `api/edgar-proxy.ts` for both `/Archives/` URLs and
  `data.sec.gov/submissions/` (generalized Aug 16, 2026 — see session log;
  every SEC request goes through the proxy now, none direct-from-browser).
  Normal (domestic filer): EX-99.1 from most recent 8-K item 2.02.
  Speculative names (currently OKLO, NNE): dual 8-K + 10-Q MD&A, gated by
  automatic revenue detection (`hasReportedRevenue`, via `filingShowsRevenue()`
  heuristic) rather than a hardcoded pre/post-revenue split — the
  `SPECULATIVE` set now only controls fetch behavior (always pull both).
  Foreign private issuers (NBIS, CCJ): file 6-K, not 8-K — see "Foreign
  Private Issuer filing framework" below. SEDAR-only (NXE): training
  knowledge fallback, no EDGAR fetch at all.
  Newly-public names with thin/registration-heavy EDGAR history (FLY, SPCX):
  a thin "most recent 8-K item 2.02" result is expected, not a bug — not
  added to SPECULATIVE/SEDAR_ONLY/TRAINING_ONLY, which are for pre-revenue or
  non-EDGAR-filing names specifically.

### Foreign Private Issuer filing framework (`FILING_REGIME` / `FPI_CONFIG`)
A classification axis in `StockDetail.tsx` parallel to (not a replacement
for) `SPECULATIVE`/`SEDAR_ONLY` — those control how many filings to fetch;
`FILING_REGIME` controls which SEC form to look for. `filingRegimeFor()`
defers to `SEDAR_ONLY` first so the two axes can't disagree about NXE.
Currently populated: `NBIS: 'foreign_private_issuer'` (Dutch, 6-K + 20-F),
`CCJ: 'foreign_private_issuer'` (Canadian, 6-K + 40-F, enabled Aug 16 2026 —
see session log). Adding a new FPI is one `FILING_REGIME` line + one
`FPI_CONFIG` line, no other file touched.

`fetchForeignIssuerFiling()` scans the `SIX_K_SCAN_LIMIT = 5` most recent
6-Ks (not just the single most recent one — 6-Ks carry no `items` code like
8-K's `2.02`, so FPIs routinely interleave earnings 6-Ks with routine
press-release 6-Ks under the same form) and tests each candidate's resolved
exhibit text with `looksLikeEarningsFiling()`, returning the first that reads
as an earnings release. Falls back to the literal most-recent 6-K (logged
warning) if none scan as earnings-shaped, then to the annual form (20-F/40-F)
if the filer has no 6-K on record. `resolveForeignExhibitUrl()` +
`parseIndexEntries()` match `FPI_EXHIBIT_HINTS` against both the filing
index's Description/Type columns and the filename (FPI exhibit filenames are
inconsistently mangled across filers — NBIS uses `ex99d1`, not `ex-99.1`).
UI filing-type badge (`filingFormLabel()`) renders "6-K" generically for any
`foreign_private_issuer` ticker — not hardcoded per name.

---

## StockDetail Page Layout

The metric card grid has been REMOVED. Do not re-add it.
Layout top to bottom:
  1. ← All Stocks nav
  2. Header: ticker + sector pills · price + day change + conviction badge
  3. Yahoo stats strip: Analyst Target · Implied Upside · Market Cap · 52W Range
  4. Meta row: period · filed date · SEC link · guidance badge · cache age
  5. Run Analysis / Cancel buttons
  6. Loading indicator
  7. Snapshot block: purple left-border card, ReactMarkdown prose
  8. Divider
  9. Narrative: 4 ReactMarkdown sections
     — What Happened (neutral) · Bull Case (green tint) · Bear Case (red tint)
       · Key Catalysts (neutral)
  10. Empty state
  11. Re-run button (admin-only, only when cached analysis exists)
  12. Re-run confirmation modal (admin-only)

## Narrative Structure — 4 Sections, This Order
  ## What Happened → ## Bull Case → ## Bear Case → ## Key Catalysts

Key Catalysts last — least damaging if token budget runs short.
Management tone woven into What Happened and Bull/Bear.
Risks folded into Bear Case.
Key Catalysts: 3-4 filing-grounded milestones only. No invented events.
Target: under 700 words total.

---

## Design System
Core palette is defined as CSS custom properties in src/index.css (`:root` =
dark defaults, `html.light` = light overrides). Components reference
`var(--bg-base)` etc. — do not reintroduce hardcoded core-palette hex values.

Dark values (the canonical look):
Background:   #08090d  --bg-base      Surface:    #0f1117  --bg-surface
Surface 2:    #161922  --bg-elevated  Border:     #1e2230  --border
Text:         #e2e6f0  --text-primary Muted text: #8b93a8  --text-secondary
Green:        #00e676     Red:        #ff4b6e     Yellow: #ffd166

Accent colors (green/red/yellow, sector colors) are NOT themed — identical hex
in both modes. Dark-text-on-accent buttons keep literal #08090d on purpose.

Fonts: Space Mono → labels, tickers, data, badges
       DM Sans    → body text, descriptions, narrative prose
Dark theme is the default. Light mode via sun/moon toggle in the top nav,
persisted in localStorage `investai_theme` (unset = dark). index.html applies
the saved theme class pre-paint to avoid a flash.

## Dashboard Sector Colors — Single Source of Truth
Defined in src/types/index.ts as SECTOR_COLORS. Used everywhere: filter pills,
sector dots, ticker name text, left accent bars, SidePanel ticker labels.
Do NOT use per-ticker color overrides — all color derives from primary sector.

  space:             #00c8ff   cyan
  ai_infrastructure: #a259ff   violet
  defense:           #f97316   orange
  clean_energy:      #00e676   green
  cyber:             #ff4b6e   pink/red (reuses the existing red accent — no
                                new hex added)
  lng_export:        #fbbf24   amber (reserved, not displayed)

The `color` field on TickerConfig is deprecated and unused. Do not add new
per-ticker color overrides. accentColor in PriceTable is always derived from
SECTOR_COLORS[ticker.sectors[0]].

Card color coding on AI-output MarkdownCards (Portfolio + Net Worth + Retirement):
  Macro Risk card       — red left border (#ff4b6e), red tint background
  Trim Suggestion       — amber left border (#ffd166), amber tint background
  Scenario Analysis     — purple left border (#a259ff), purple tint background
  Should I? memo        — purple left border (#a259ff), purple tint background
  Trim/Exit memo        — purple left border (#a259ff), purple tint background
  Retirement waterfall  — teal left border (#06b6d4, GICS health_care accent)

## Row Status Visual Rules
Awaiting:  dimmed row, "AWAITING" label, no sector dot
Analyzed:  normal row, colored sector dot, ✓ ANALYZED label
Stale:     subtle amber outline on row, "⚠ STALE" label — driven by
           `getAnalysisFreshness()`, fires only on `reportDue` or
           `staleFallback`, never from elapsed time alone (see Analysis
           Freshness section above).

Second dot after sector label = crossover sector membership (intentional).
Example: RKLB shows "• SPACE •" — primary space, crossover defense.

Rating column shows Yahoo Finance recommendationMean as badge (STRONG BUY /
BUY / HOLD / SELL / STRONG SELL). Shows "—" when Yahoo has no analyst
coverage for that ticker (e.g. KTOS, AVAV) — this is correct, not a bug.

guidanceDirection badge colors:
  raised → green    maintained → gray    lowered → red    initiated → blue

## Speculative Names — Handle Differently in Analysis Prompts
OKLO, NNE  — pre-revenue by default; prompt framing auto-switches once
             `hasReportedRevenue` is detected from the filing.
NXE        — pre-production uranium, Canadian SEDAR-only filer (no EDGAR
             presence at all) — training-knowledge fallback, not a live fetch.
CCJ        — Canadian foreign private issuer, but an established uranium
             producer (not pre-revenue) — files 6-K on EDGAR, live-fetched via
             the `FILING_REGIME`/`FPI_CONFIG` framework (enabled Aug 16, 2026 —
             see session log). Contrast with NXE: NXE has no EDGAR filings to
             fetch at all (SEDAR-only), CCJ has real EDGAR history and is
             fetched the same way a domestic 8-K filer's earnings text is.
CIFR, RIOT — Bitcoin miners, AI pivot less advanced than IREN. Be explicit.
SATS       — REMOVED from the tracked universe (Aug 6, 2026). Do not
             reference or re-add without discussion — see the removal
             session log entry for the full checklist that was run.

---

## Markdown Rendering — AI Output Cards

All AI-generated text across Portfolio, Net Worth, and Retirement is rendered
via a shared `<MarkdownCard>` component (`src/components/common/MarkdownCard.tsx`
— extracted from an original PortfolioTab-local copy) using ReactMarkdown +
remark-gfm. Do not render AI output as plain text strings anywhere.

It overrides: h2 (suppressed), h3 (uppercase mono label), p, strong, ul, li,
table/thead/tbody/tr/th/td, hr, code.

Prompts must NOT include a top-level ## heading — the card header already
labels the section. Prompts use ### for internal section headings.

---

## SidePanel Snippet Rendering

The stored `summary` field on StockAnalysis contains the full narrative string,
which always begins with "## What Happened\n\n..." before any prose.

The extractSnippet() helper in SidePanel/index.tsx handles this:
  1. Splits on newlines, filters out all lines starting with #
  2. Collapses blank lines, takes the first non-empty paragraph
  3. Strips **bold** markers for clean plain-text display
  4. Truncates to 90 chars with ellipsis

Do NOT use a.summary.slice(0, N) directly — it will show the raw heading.
Always route sidebar snippets through extractSnippet().

---

## Environment Variables Required
ANTHROPIC_API_KEY       → Vercel dashboard → Settings → Environment Variables
VITE_SUPABASE_URL       → Vercel dashboard → Settings → Environment Variables
VITE_SUPABASE_ANON_KEY  → Vercel dashboard → Settings → Environment Variables
(Yahoo Finance requires no key — uses yahoo-finance2 npm package)

Set for Production, Preview, AND Development. Missing any of the three
Supabase-related vars throws a fatal init exception on load — this is exactly
what killed the old stock-tracker-five-tau deployment.

---

## Key File Locations
src/types/index.ts                             canonical data schema + SECTOR_COLORS
src/config/tickers.ts                          tracked universe (49 tickers), sector assignments
src/config/gics.ts                             GICS two-tier taxonomy + classifyTicker()
src/config/themes.ts                           4-theme conviction taxonomy + TICKER_THEME_MAP
src/store/useStore.ts                          Zustand store, all global state
src/App.tsx                                    router — routes: / · /dashboard · /stock/:ticker ·
                                                /index/:indexName · /portfolio · /networth ·
                                                /retirement · /admin
src/components/Layout/index.tsx                top nav (NAV_LINKS), brand, sector filter bar
                                                (Dashboard-route-only)
src/pages/News.tsx                             News landing page (/)
src/pages/Dashboard.tsx                        Dashboard page (/dashboard)
src/pages/Portfolio.tsx                        thin wrapper over PortfolioTab
src/pages/NetWorth.tsx                         Net Worth page wrapper (gate/anon/auth flow)
src/pages/Retirement.tsx                       Retirement page wrapper (gate/anon/auth flow)
src/pages/StockDetail.tsx                      re-export only — logic in components/StockDetail
src/pages/IndexDetail.tsx                      re-export only — logic in components/IndexDetail
src/components/StockDetail.tsx                 stock deep dive — canonical component; local
                                                CIK_MAP + SECTOR_COLOR_MAP/SECTOR_LABEL_MAP +
                                                FILING_REGIME/FPI_CONFIG (foreign private issuer
                                                6-K framework, see Aug 16 2026 session log)
                                                (does NOT import tickers.ts — see universe-change
                                                checklist below)
src/components/ConvictionBadge.tsx             conviction rating badge
src/components/ErrorBoundary.tsx               wraps /index/:indexName, /portfolio, /networth,
                                                /retirement routes
src/hooks/useAnalysis.ts                       SSE stream parsing, localStorage cache
src/hooks/useLivePrice.ts                      live price fetch, runs once in App.tsx (hoisted
                                                from Dashboard so News can rank on it too)
src/hooks/useSupabaseSync.ts                   hydrates Zustand from Supabase on mount;
                                                pushAnalysis() — SEE "KNOWN OPEN BUG" above,
                                                currently never called
src/hooks/useNewswire.ts                       reads latest newswire run, wired into SidePanel
src/hooks/useNewsArchive.ts                    News-tab archive read (feeds rankFrontPage())
src/hooks/usePortfolioSync.ts                  Portfolio-tab preferences sync (theme/sector
                                                conviction, account type)
src/hooks/useNetWorthSync.ts                   accounts table sync — debounced writes,
                                                visibilitychange/pagehide flush
src/hooks/useFinancialProfile.ts               optional income/savings/goal profile — mirrors
                                                useNetWorthSync.ts pattern
src/hooks/useCryptoPrices.ts                   live crypto pricing — dormant for new accounts
                                                (Aug 4, 2026 decision), still active for any
                                                legacy live-priced row
src/hooks/useRetirementProfile.ts              retirement_profile table sync — mirrors
                                                useFinancialProfile.ts pattern
src/hooks/useIndexValue.ts                     live index values (client-side) + history +
                                                constituent fetchers
src/lib/newsRanking.ts                         pure rankFrontPage() + selectWithDiversityCap()
src/lib/indexCalc.ts                           AI Index pure math (computeIndexValue) +
                                                membership/eligibility by primary sector
src/lib/analysisFreshness.ts                   getAnalysisFreshness() — see section above; consumed
                                                only by PriceTable/index.tsx as of Aug 16, 2026
src/lib/supabase.ts                            Supabase client singleton + sendMagicLink() +
                                                signOut()
src/components/SidePanel/index.tsx             What's New sidebar — Today's Wire teaser, Upcoming
                                                Earnings (date-driven, uses extractSnippet() for
                                                Recently Analyzed snippets only)
src/components/PriceTable/index.tsx            Dashboard watchlist table — STALE badge driven
                                                by getAnalysisFreshness()
src/components/NewsFeed/index.tsx              News-tab Lead/Also Moving/Feed renderer
src/components/IndexTicker/index.tsx           News-tab AI Index widget (composite hero +
                                                sub-index pills + sparkline)
src/components/IndexDetail/index.tsx           /index/:indexName drill-down — hand-rolled SVG
                                                chart w/ hover crosshair + constituent table
src/components/compare/PortfolioTab.tsx        main portfolio component (default export)
src/components/compare/SectorTargetsPanel.tsx  sector target weights slide-in panel
src/components/compare/ThematicFrameworkPanel.tsx theme + non-theme sector conviction slide-in
src/components/networth/NetWorthTab.tsx        net worth aggregation + financial profile panel
                                                + AI analysis card
src/components/networth/AddAccountPanel.tsx    add-account form (crypto = manual $ field only)
src/components/networth/NetWorthAuthGate.tsx   Net Worth admin magic-link gate
src/components/networth/kindDisplay.ts         account-kind label/icon mapping
src/components/retirement/RetirementTab.tsx    Retirement tab — inputs form + waterfall AI card
src/components/retirement/RetirementAuthGate.tsx Retirement admin magic-link gate
src/components/common/MarkdownCard.tsx         shared AI-output Markdown renderer
src/components/PortfolioAuthGate.tsx           Portfolio-tab anonymous/admin gate (distinct from
                                                the Net Worth / Retirement auth gates — Portfolio
                                                itself is publicly readable, this only gates admin
                                                write actions)
src/components/AuthGate.tsx                    /admin route login screen
src/components/Onboarding/OnboardingModal.tsx  per-tab onboarding cards (NOT per-feature)
api/prices.ts                                  Yahoo Finance proxy (+ crypto short-circuit branch)
api/analyze.ts                                 Anthropic streaming proxy, stock analysis
api/edgar-proxy.ts                             CORS proxy for SEC /Archives/ URLs
api/portfolio.ts                               portfolio + net worth API — macro_risk ·
                                                macro_scenario · trim · trim_memo ·
                                                sector_explore · cash_deploy · networth_analysis
                                                (self-contained; no api/_shared import — see
                                                Aug 6 hotfix)
api/retirement.ts                              retirement API — single retirement_analysis
                                                one-shot (own 15/hr bucket); net-worth prompt
                                                helpers inlined, not imported (see Aug 6 hotfix)
scripts/newswire.mjs                           RSS pull + classification cron; own
                                                TICKERS/COMPANY_ALIASES (does not import
                                                tickers.ts — plain .mjs, no build step)
scripts/indexCalc.mjs                          daily index close writer (post-market cron);
                                                own PRIMARY_SECTOR + TICKER_INTRO_MONTH maps;
                                                exports helpers for backfill
scripts/indexBackfill.mjs                      one-time manual ~1yr history backfill
                                                (approximated caps); NOT in CI
.github/workflows/newswire.yml                 newswire cron (weekdays 7:30am ET) + index calc
                                                step (post-market leg only, 5pm ET / 21:00 UTC)

Deleted — do not recreate:
  src/pages/Compare.tsx
  src/components/compare/ResearchCompare.tsx
  src/components/compare/StockPicker.tsx
  api/edgar.ts  (confirmed dead code — actually deleted, not just deprioritized)
  api/_shared/  (any shared module under api/ — breaks silently on Vercel)

---
## GICS Sector Taxonomy (Portfolio Use Only)

Defined in src/config/gics.ts. SEPARATE from dashboard filter pill sectors and
from the thematic conviction taxonomy (src/config/themes.ts). Do NOT conflate
the three.

classifyTicker(ticker): priority → UNIVERSE_SECTOR_MAP → KNOWN_TICKERS → 'other'
For any ticker where classifyTicker returns 'other', PortfolioTab falls back to
yahooSector from the live prices response via YAHOO_TO_GICS mapper.

### Top-Level Sectors (12)
  information_technology  #a259ff  violet
  industrials             #f97316  orange
  energy                  #00e676  green
  communication_services  #00c8ff  cyan
  financials              #fbbf24  yellow
  consumer_discretionary  #f59e0b  amber
  consumer_staples        #84cc16  lime
  health_care             #06b6d4  teal
  materials               #a78bfa  lavender
  real_estate             #fb923c  orange-light
  utilities               #34d399  emerald
  other                   #8b93a8  muted gray

### Tracked Universe → GICS Mapping (current, 49 tickers — SATS removed Aug 6, 2026)
RKLB  → industrials / space_launch
FLY   → industrials / space_launch
SPCX  → industrials / space_launch
RDW   → industrials / space_systems
LUNR  → industrials / space_systems
KTOS  → industrials / aerospace_defense
LHX   → industrials / aerospace_defense
AVAV  → industrials / aerospace_defense
ASTS  → communication_services / satellite_comms
PL    → communication_services / earth_observation
BKSY  → communication_services / earth_observation
NVDA  → information_technology / semiconductors
MU    → information_technology / semiconductors
AVGO  → information_technology / semiconductors
INTC  → information_technology / semiconductors
PLTR  → information_technology / it_services
ANET  → information_technology / it_services
CRWV  → information_technology / internet_infrastructure
IREN  → information_technology / internet_infrastructure
NBIS  → information_technology / internet_infrastructure
CIFR  → information_technology / internet_infrastructure
RIOT  → information_technology / internet_infrastructure
VRT   → information_technology / electronic_equipment
MOD   → information_technology / electronic_equipment
SMCI  → information_technology / hardware
DELL  → information_technology / hardware
MSFT  → information_technology / software
CRWD  → information_technology / software
PANW  → information_technology / software
NET   → information_technology / software
ZS    → information_technology / software
FTNT  → information_technology / software
GOOGL → communication_services / interactive_media
META  → communication_services / interactive_media
AMZN  → consumer_discretionary / ecommerce
CEG   → energy / nuclear_power
VST   → energy / nuclear_power
BWXT  → energy / nuclear_components
GEV   → energy / power_equipment
BE    → energy / fuel_cells
CCJ   → energy / uranium_mining
LEU   → energy / uranium_mining
NXE   → energy / uranium_mining
OKLO  → energy / advanced_reactors
NNE   → energy / advanced_reactors
PWR   → industrials / construction_engineering
ETN   → industrials / electrical_equipment
GNRC  → industrials / electrical_equipment
EQIX  → real_estate / data_center_reits

Note: SPCX and PWR carry crossover tags on the dashboard-pill taxonomy
(SPCX → space primary / ai_infrastructure crossover; PWR → ai_infrastructure
primary / clean_energy crossover) — this GICS table shows only the single
primary GICS sector/subSector, a separate axis from that crossover tagging.

---

## Portfolio Page — Full Spec

### Purpose
Four connected workflows on one page:
  1. Portfolio view — positions, live values, unrealized gains, sector
     concentration chart with target dual-bars, macro risk narrative.
  2. Simulation panel — candidate ticker or existing position, target allocation
     slider (0–100%), auto-detected add vs. trim mode, sector impact table,
     trim/exit/add memo and redeployment suggestions.
  3. Sector explore — Claude suggests 3-4 stocks for any underweight sector,
     each with a "Simulate →" button that pre-fills the simulation panel.
     Web-search-grounded (varies across repeated calls), excludes recently
     suggested tickers per sector (sessionStorage-tracked, capped 6/sector),
     and respects theme/sector conviction (AVOID is a hard exclusion).
  4. Scenario analysis — investor proposes new sector target weightings,
     Claude analyzes how the shift fits the current macro environment.

### Data Model — PortfolioPosition
Stored in sessionStorage (SESSION_KEY: 'portfolio_session_v2', TTL: 60 min).
NOT localStorage, NOT Zustand.

interface PortfolioPosition {
  id: string                // `${ticker}-${Date.now()}`
  ticker: string            // any valid ticker
  shares: number
  costBasisPerShare: number
  // computed at render — never stored or sent to API:
  // currentValue, unrealizedGainPct, portfolioWeightPct
}

Tickers outside the tracked universe get an "EXT" badge.

### Privacy Rules — Hard (do not relax)
Never send dollar amounts, share counts, or cost basis to the API.
Send only: ticker, sector, subSector, weightPct, gainPct, inUniverse.

This rule is scoped to the Portfolio tab specifically (built for eventual
semi-public sharing). It does NOT apply to the Net Worth or Retirement tabs —
see their sections above for the deliberate dollar-figure exceptions. Do not
let those exceptions bleed back into Portfolio prompt-building code.

### Account Type
Stored in sessionStorage. Passed as accountType + accountContext to all calls.
buildAccountBlock() injects account-specific hard rules into every prompt.
  roth_ira / 401k_roth        → whole share counts only, no tax language
  traditional_ira / sep_ira   → whole shares, ordinary income note, RMD context
  taxable                     → short vs long-term gain callouts, TLH where applicable
  hsa                         → whole shares preferred, limited TLH benefit

### Thematic + Sector Conviction (three-state lean)
Two independent, persisted preference sets — both `'lean_in' | 'neutral' |
'avoid'` (`ThemeStance`), both default `neutral`, both surfaced in
`ThematicFrameworkPanel.tsx`:
  - **Theme conviction** — one stance per curated theme (space_economy,
    ai_infrastructure, defense, clean_energy_nuclear). No numeric target here;
    conviction is directional only.
  - **Sector conviction** — one stance per remaining 8 non-theme GICS sector
    (financials, health_care, materials, real_estate, consumer_discretionary,
    consumer_staples, utilities, communication_services). utilities/
    communication_services mean the BROAD sector beyond the nuclear-operator/
    satellite names already in the tracked universe.
Both persist through `usePortfolioSync` (Supabase `user_preferences.theme_preferences`
/ `.sector_conviction` jsonb columns for signed-in users; sessionStorage for
anonymous). LEAN IN is a priority signal; AVOID is a hard prohibition (never
recommend, even to fill a gap) in `cash_deploy`, `macro_risk`, and
`sector_explore`. The four curated themes are a conviction OVERLAY, not a
boundary — non-theme sectors are judged on diversification merit and are not
in competition with a LEAN IN theme pick.

### Portfolio Page Layout

Account type bar (above everything):
  - Colored account type button → opens AccountTypePanel slide-in
  - Constraint pills from ACCOUNT_TYPES config

Left column (2fr):
  1. Positions table — TICKER · SECTOR · PRICE · COST BASIS · GAIN/LOSS · ALLOCATION · ×
  2. Sector concentration chart
     - ▶/▼ expand for sub-sectors
     - Dual bars when targets set (solid actual, outline target)
     - Delta label: red = overweight, green = underweight
     - "↗ explore" button on each underweight row (≥2pp under target)
     - "↗ Explore gaps" button in chart header when any sector is underweight
     - "Set targets / Edit targets" button → SectorTargetsPanel
     - "Theme conviction" button (neutral violet #9a7dff) → ThematicFrameworkPanel
  3. Macro risk — red left-border card, MarkdownCard rendering, account type badge,
     re-run button, "⟳ Run scenario analysis" button (purple, appears after macro runs)

Right column (3fr):
  1. Simulation panel (covers add AND trim/exit — see spec below)
  2. Should I? / Trim memo card — purple left-border, MarkdownCard rendering
  3. Trim suggestion card — amber left-border card, MarkdownCard rendering

Grid: `minmax(0,2fr) minmax(0,3fr)`.

### Simulation Panel — Full Spec

Mode is auto-detected — no toggle needed.

**Mode detection (derived at render, never stored):**
  simExistingPos  — computed.find(p => p.ticker === simTicker) or null
  simCurrentPct   — existingPos.portfolioWeightPct or 0
  simIsHeld       — simExistingPos != null
  simIsTrim       — simIsHeld && simAlloc < simCurrentPct
  simIsExit       — simIsHeld && simAlloc === 0
  simIsAdd        — !simIsHeld || simAlloc > simCurrentPct

**Slider behavior:**
  - Range: 0–100% (0% = full exit)
  - Slider accent color: red at 0% exit, amber when trimming, white when adding
  - Target allocation label shows "(currently X.X%)" when ticker is held

**Sector impact math:**
  For NEW positions: scaleFactor = (100 - targetPct) / 100; existing sectors
  scale down, simSector gains targetPct.
  For EXISTING positions: remainingBase = 100 - currentPct; scaleFactor =
  (100 - newTargetPct) / remainingBase; prevents double-counting and correctly
  zeroes out a full exit.

**Action buttons — labels change by mode:**
  Primary: "✦ Should I? — get memo" (add) / "✦ Trim memo — should I reduce?"
  (trim) / "✦ Full exit — where should proceeds go?" (exit)
  Secondary: "Quick trim suggestion" (add) / "Where should proceeds go?" (trim)

**Auto sector explore on trim/exit:** after running either button in trim
mode, automatically finds the most underweight sector (≥2pp gap, different
from trimmed sector) and opens SectorExplorePanel. Only fires when
`hasTargets` is true.

### SectorTargetsPanel
Width: 460px. Grid: 24px 1fr 60px 80px 64px.
Number spinners hidden. Must sum to exactly 100% to enable Save.
ALL 12 GICS sectors are always shown — not filtered to only sectors currently
held, so targets can be set for sectors you don't yet own.

### Sector Explore Panel
Slide-in from right. Shows the underweight gap. Claude returns a JSON array of
`{ ticker, rationale, marketCapRange }`. Each card has a "Simulate →" button.
`api/portfolio.ts` request type: `"sector_explore"`.

### Scenario Analysis Panel
Width: 500px. Opened via "⟳ Run scenario analysis" below the Macro Risk card.
Sector weight editor grid (Sector · Actual · Current target · Proposed),
running total row (green ✓ at 100%, yellow within 5pp, red otherwise), "✦
Analyze proposed weightings" button disabled until total = 100%.

---

## api/portfolio.ts — Request Types

POST body shape:
{
  type: "macro_risk" | "macro_scenario" | "trim" | "trim_memo" |
        "sector_explore" | "cash_deploy" | "networth_analysis"
  positions: PositionPayload[]       // includes keyMetrics?: string
  accountType?: string
  accountContext?: string
  sectorTargets?: Record<string, number | null>
  sectorActuals?: Record<string, number>
  subSectorActuals?: Record<string, number>
  projectedTargets?: Record<string, number | null>  // macro_scenario only
  candidate?: CandidatePayload                       // trim + trim_memo
  exploreSector?: string                             // sector_explore only
  themePreferences?: ThemePreferences                // cash_deploy/macro_risk/sector_explore
  themeActuals?: Record<string, number>
  sectorConviction?: SectorConviction
  recentlySuggested?: string[]                       // sector_explore only
  accounts?: NetWorthAccountPayload[]                 // networth_analysis only
}

macro_risk prompt structure (### sections, no top-level ##):
  ### Concentration Risks
  ### Macro Sensitivities
  ### Tail Risks
  ### Rebalancing Priority
  ### Sector Opportunity Watchlist

macro_scenario prompt structure:
  ### What Changes → ### Macro Fit → ### Execution Path → ### Risks of This Shift

trim / trim_memo — BRANCH on isTrimMode (add vs. trim/exit), see full detail
in the July session log entries for exact section headers per branch.

sector_explore response is validated as JSON before returning to client (slice
from first `[` to last `]` to survive web-search narration around the array).

networth_analysis — Net Worth tab only, real dollar figures permitted per the
deliberate exception. Shares this endpoint's 20-calls/hour bucket.

---

## Known Issues

- **Supabase analysis sync (`pushAnalysis`) is unwired — see "KNOWN OPEN BUG"
  section above.** This is the single most important open item; re-verify it
  still reproduces before making any further changes to sync/timing logic.
- Stocks analyzed in the old 5-section format (IREN, MOD) lack a snapshot
  block. Re-run to upgrade to the current 4-section + snapshot format.
- Toast notifications not built — no success/error feedback on analysis
  completion.
- FLY (Firefly Aerospace) and SPCX (SpaceX) — both newly public, thin
  registration-heavy EDGAR history. A thin/empty "most recent 8-K item 2.02"
  result is expected, not a bug. Not added to SPECULATIVE/SEDAR_ONLY/
  TRAINING_ONLY (those are for pre-revenue or non-EDGAR-filing names).
- SATS's stale Yahoo-quote-fetch failure (noted in the Aug 4 index entry) is
  now moot — SATS was removed from the tracked universe entirely on Aug 6.

---

## Next Session Priorities (in order)

1. **Fix the `pushAnalysis` Supabase write** (see "KNOWN OPEN BUG" above) —
   highest-priority open item; blocks correct public/shared analysis state.
2. **Financial Overview / net-worth architecture** — the app currently models
   "one portfolio" per user, not "multiple accounts." Net Worth and Retirement
   both now exist and pull from a proper `accounts`/`asset_holdings` +
   `retirement_profile` shape, so this item is largely superseded by shipped
   work — revisit only if a genuinely new asset-tracking gap appears.
3. **Sharpen AI portfolio recommendations further** — `sector_explore` was
   sharpened (patch 4, July 28: web search, conviction-aware, recent-exclusion,
   deeper rationale). Re-evaluate whether `cash_deploy` needs the same
   deepening pass, and whether token cost at that depth is worth it.
4. **Dead code cleanup** — confirm no other stale `api/*.ts` files or
   `_shared`-style modules have crept back in; `api/edgar.ts` is deleted.

---

## Claude Behavior Rules

### Read actual source files before writing any prompt or fix
Documentation drifts; the codebase is ground truth. TypeScript compilation
passing is not a proxy for correctness — silent runtime failures (missing CIK
entries, wrong file paths, an unwired hook return value like `pushAnalysis`)
won't be caught by `tsc`.

### Never re-diagnose already-fixed bugs from theory
Before modifying sync/timing/seeding logic a prior session claimed to have
fixed, verify the bug still reproduces on the current deployed build. Do not
layer architectural changes on top of an unverified diagnosis.

### Universe-change checklist — update ALL of these on every ticker add/remove
  1. `src/config/tickers.ts` — TICKERS array
  2. `src/config/gics.ts` — UNIVERSE_SECTOR_MAP
  3. `src/config/themes.ts` — TICKER_THEME_MAP (+ new sub-themes if needed)
  4. `src/types/index.ts` + `src/components/Layout/index.tsx` — Sector type,
     SECTOR_LABELS/COLORS, and the Layout SECTORS pill array (only on a new pill)
  5. `src/components/StockDetail.tsx` — CIK_MAP + SECTOR_COLOR_MAP/SECTOR_LABEL_MAP.
     If the new ticker is foreign-domiciled and files 6-K instead of 8-K, also
     add a `FILING_REGIME` + `FPI_CONFIG` entry (see the Foreign Private Issuer
     framework section above and the Aug 16 2026 session log) — mirrors how
     CIK_MAP already requires an entry per ticker.
  6. `scripts/newswire.mjs` — TICKERS + COMPANY_ALIASES
  7. `scripts/indexCalc.mjs` — PRIMARY_SECTOR map (+ TICKER_INTRO_MONTH entry
     for a newly-added ticker, so it "floats on" the AI Index the following
     month). `src/lib/indexCalc.ts` derives membership from tickers.ts
     directly and needs no manual edit, but ITS OWN `TICKER_INTRO_MONTH` copy
     must be kept hand-in-sync with the .mjs one (see Aug/July 30 patch).
Skipping any of these causes a silent failure that `tsc`/`npm run build`
cannot catch.

### Do not factor shared code into an api/_shared/ (or any underscore-prefixed)
module and import it across Vercel functions — it deploys broken with no
local-build signal. Duplicate small `api/` helpers inline instead (see Aug 6,
2026 hotfix). Always curl the production endpoint after deploying a
new/changed `api/*.ts` function rather than trusting tsc/build alone.

### Ticker counts should not be hardcoded in UI copy
Use "the full tracked universe" to stay resilient to future changes.

### Index math is hand-synced, not imported
`.ts` and `.mjs` copies of ticker/sector/theme constants are kept in sync by
convention across the api↔src and src↔scripts boundaries — never introduce a
shared import across those boundaries for this reason.

### Supabase migrations are always handed off for manual execution
In the Supabase SQL Editor — never auto-run by Claude Code.

### File delivery preference
Complete replacement files or Claude Code prompts with exact file/line
references, not diffs or partial snippets. `npx tsc --noEmit` (and, for `api/`
changes, a standalone strict typecheck plus a post-deploy curl) is the
correctness gate before every deploy.

### After every file delivery
Whenever Claude produces modified files for this project (whether via
present_files, artifacts, or inline code blocks), it must automatically
append deploy commands at the end of its response without being asked.

Format:
  **Deploy commands:**
  cd "/Users/jared/Downloads/Claude Projects/space-tracker"
  cp ~/Downloads/<filename> <destination/path>   # repeat for each file
  npm run build

  If build passes:
  git add <changed files>
  git commit -m "<description of what changed>"
  git push origin main
  vercel --prod

Claude must fill in the actual filenames, destination paths, and a meaningful
commit message based on what was just built. Never use placeholder text —
always use the real paths from the session.

### CLAUDE.md's session log
Is the record of what actually shipped and when — check it before assuming a
feature is or isn't built, but treat the current source files as ground truth
when the two disagree (this rewrite was done for exactly that reason — see
the header note below).

---

**Note on this rewrite (Aug 16, 2026):** the sections above were reconciled
directly against the current zipped project source, not just against the
prior session log. Two corrections of note: (1) `pushAnalysis` — documented in
places as an active/recent issue — was re-verified against the actual code and
is confirmed STILL UNWIRED (see "KNOWN OPEN BUG"); do not assume it was fixed
in an undocumented session. (2) Everything else in the session log below
(SATS removal, 31→50 expansion, AI Index, Net Worth, Retirement, the
`api/_shared` revert) was verified to match the current source exactly and is
kept as an accurate historical record — no content changes below this line
apart from this note.

**Correction (Aug 16, 2026, later same day):** this rewrite's source snapshot
predated commit `c48a728` ("Generalize NBIS 6-K fix into reusable Foreign
Private Issuer filing framework"), which had already been committed to git
with its own CLAUDE.md update. Committing this rewrite as originally written
would have silently regressed that documentation — the "Foreign Private Issuer
filing framework" doc section, the `Speculative Names`/universe-checklist
mentions of `FILING_REGIME`/`FPI_CONFIG`, and the corresponding session log
entry were all missing. Restored during the CCJ-enablement session (see the
two "August 16, 2026" session log entries near the end of this file) before
this rewrite was ever committed — the live CLAUDE.md you're reading now
includes that restoration. Lesson: a source-snapshot-based rewrite can silently
regress documentation for work committed after the snapshot was taken; diff
against `git show HEAD:CLAUDE.md` before treating a full rewrite as safe to
commit, not just against the session log narrative.

---

## Session Log
---

### July 22, 2026 — Thematic Framework panel + web-search-grounded cash deploy & macro risk

**New: thematic conviction layer (theme taxonomy + panel)**
  Adds a third classification axis alongside the dashboard Sector pills and the
  portfolio GICS taxonomy — do NOT conflate the three. `src/config/themes.ts`
  (parallel to gics.ts) defines 4 top-level themes (space_economy,
  ai_infrastructure, defense, clean_energy_nuclear) and 12 sub-themes, with
  `THEME_DISPLAY` / `SUBTHEME_DISPLAY` / `THEME_COLORS` (reuses SECTOR_COLORS
  from src/types — not redefined), a static `TICKER_THEME_MAP` for the tracked
  universe (crossover names RDW/BKSY resolve to space_economy primary, KTOS to
  defense), and `classifyTickerTheme()` which returns null off-universe.
  `ThematicFrameworkPanel.tsx` (modeled on SectorTargetsPanel) is a 460px
  slide-in with one card per theme: color-coded left border, actual-weight bar,
  collapsible sub-theme breakdown, and a 3-state segmented control
  (Lean in / Neutral / Avoid). NO numeric target here — conviction is
  directional; the numeric side stays in SectorTargetsPanel. Opened from a new
  "Theme conviction" button (neutral violet #9a7dff) next to Set/Edit targets
  in the Sector Concentration chart header. Onboarding modal left unchanged —
  its cards are strictly per-tab, not per-feature.

**Data model — ThemePreferences (three-state lean)**
  `type ThemeStance = 'lean_in' | 'neutral' | 'avoid'` + `ThemePreferences`
  (one stance per theme) in PortfolioTab.tsx. Defaults all four to `neutral`
  (`DEFAULT_THEME_PREFERENCES`) — no assumed lean-in. Persisted through the
  existing usePortfolioSync path (same debounce + visibilitychange/pagehide
  flush): `savePreferences()` gained a 5th `themePreferences` arg, written to a
  new `user_preferences.theme_preferences` jsonb column. Anonymous users fall
  back to sessionStorage (`SessionCache.themePreferences`), consistent with the
  rest of Portfolio-tab state.

**New: web search grounding for cash_deploy + macro_risk ONLY**
  Those two request types now include `tools: [{ type: 'web_search_20250305',
  name: 'web_search' }]` in the Anthropic call; every other type stays
  tool-free (no added latency). The handler branches: for the two web types it
  filters `data.content` for `type === 'text'` blocks and joins them (tool-use
  blocks can now precede text); all other types keep the single-block
  `content[0].text` read. `buildFreshnessBlock(hasWebAccess)` gained a
  parameter — the two web calls pass `true` (instructing 2-4 targeted searches,
  cite briefly), everything else defaults to the old no-live-access wording.

**New: buildThemeBlock() + external-ticker permission**
  `buildThemeBlock(themePreferences, themeActuals)` (near buildPreferenceBlock)
  emits a THEMATIC CONVICTION block wired into `buildCashDeployPrompt()` and
  `buildMacroRiskPrompt()` only (not trim/trim_memo/sector_explore). LEAN IN is
  a priority signal; **AVOID is a HARD prohibition** (never recommend, even to
  fill a gap) — same enforcement posture as CASH_GROUNDING_RULE. Both prompts'
  new-idea sections now explicitly permit tickers outside the tracked 31-stock
  universe (marked "not currently tracked in this app", allocation expressed as
  % of cash since they have no SHARE PURCHASE ESTIMATE), with a direct
  instruction not to default to generic mega-caps — the fix for the recurring
  MSFT/AMZN/BRK.B pattern.

**Privacy:** `themeActuals` (percentages) and `themePreferences` (stance enums)
  are the only new payload fields — no dollars, no share counts. Portfolio-tab
  percentage-only rule holds; the net-worth dollar exception was not touched.

**Verification:** `npx tsc --noEmit` and `npm run build` both pass.

**Migration handed off (NOT run by Claude Code):**
  `supabase_migration_theme_preferences.sql` — `ADD COLUMN IF NOT EXISTS
  theme_preferences jsonb` on user_preferences (idempotent, nullable, existing
  RLS covers it). usePortfolioSync selects '*', so a missing column degrades to
  null (all-neutral) rather than crashing until the migration runs.

**Files created:** src/config/themes.ts ·
  src/components/compare/ThematicFrameworkPanel.tsx ·
  supabase_migration_theme_preferences.sql
**Files modified:** api/portfolio.ts · src/components/compare/PortfolioTab.tsx ·
  src/hooks/usePortfolioSync.ts · src/pages/Portfolio.tsx · CLAUDE.md

---

### July 22, 2026 (patch) — Decouple theme conviction from sector breadth

**Bug:** cash_deploy / macro_risk only ever surfaced names inside the four
curated themes — never the other 8 GICS sectors. Two root causes in
`api/portfolio.ts`, both fixed here (server-only patch, no client edits):

  1. `buildThemeBlock()` had no counterbalance — it instructed on LEAN IN /
     AVOID but said nothing about the 8 non-theme sectors, so they were
     silently crowded out. Added an explicit "these four themes are a
     conviction OVERLAY, not the boundary" paragraph: non-theme sectors carry
     NO stance and are judged on diversification merit; a good non-theme pick
     is not in competition with a LEAN IN pick.
  2. The sector-alignment table was built from `Object.entries(sectorActuals)`,
     which only contains HELD sectors — an unheld sector (even one with a
     target set) was invisible to the prompt, so Claude couldn't recommend
     into a gap it was never shown.

**New shared helper `buildSectorAlignmentBlock()`** replaces the duplicated
`targetSection` logic in both `buildCashDeployPrompt()` (texture hints ON) and
`buildMacroRiskPrompt()` (hints OFF — its watchlist is tighter on word budget).
It always lists ALL 12 GICS sectors from a new local `ALL_GICS_SECTORS` literal
(duplicated, not imported across api/↔src/ — same convention as
`ThemePreferences` / `SECTOR_ETF_MAP`), tagging zero-exposure sectors
`UNEXPLORED`. `SECTOR_TEXTURE_HINTS` gives per-sector sub-sector examples for
the 8 non-theme sectors so Claude reaches for specific names, not a generic
mega-cap. Outer behavior preserved: the client only sends
`sectorTargets`/`sectorActuals` when `hasTargets` is true (both gated on it),
so a user who never set targets still gets no wall of no-target rows —
`buildSectorAlignmentBlock`'s `if (!sectorTargets && !sectorActuals) return ''`
handles that, so the call-site guard was dropped.

**Also:** extended the existing "not restricted to the 31-stock universe"
paragraph (both prompts) with one clause making explicit that external/untracked
names in the 8 non-theme sectors are just as valid as external names inside a
theme.

**Scope:** only `buildThemeBlock()`, `buildCashDeployPrompt()`, and
`buildMacroRiskPrompt()` touched. No change to sector_explore, trim, trim_memo,
or macro_scenario. `SECTOR_TEXTURE_HINTS` / `ALL_GICS_SECTORS` are static
literals — no user data, no dollar figures introduced. `npx tsc --noEmit` and
`npm run build` pass.

**Files modified:** api/portfolio.ts · CLAUDE.md

---

### July 22, 2026 (patch 2) — Sector conviction: lean/neutral/avoid on the 8 non-theme GICS sectors

**Why:** theme conviction only covered the four curated themes, so the other 8
GICS sectors could only ever be picked up "on merit" by the model. The investor
wanted to actively express lean-in / avoid on those sectors too and have it flow
into "where to deploy my cash?". This makes a diversification bet (e.g. lean in
to health care) a first-class input, not something the model reaches for on its
own.

**Model:** `NON_THEME_SECTORS` (financials, health_care, materials, real_estate,
consumer_discretionary, consumer_staples, utilities, communication_services) +
`SectorConviction` (Partial<Record<TopLevelSector, ThemeStance>>) +
`DEFAULT_SECTOR_CONVICTION` (all neutral) in PortfolioTab.tsx. Same ThemeStance
vocabulary as themes. utilities/communication_services mean the BROAD sector
beyond the nuclear-operator / satellite names already in the tracked universe
(clarified in panel copy and prompt).

**Persistence:** mirrors theme_preferences exactly (proven-safe additive
pattern, per the sync-regression lessons) — new independent
`user_preferences.sector_conviction` jsonb column, threaded through
usePortfolioSync (`savedSectorConviction`, 6th `savePreferences` arg),
Portfolio.tsx, and the anonymous SessionCache. Seed merges the persisted row
over DEFAULT_SECTOR_CONVICTION so a row missing a newly-added sector key still
resolves to neutral. The working theme-sync path was NOT modified.

**Panel:** ThematicFrameworkPanel gained an "Other GICS sectors" section below
the four theme cards — one compact card per sector (SECTOR_DISPLAY color/label,
actual-weight bar, lean/neutral/avoid segmented control). onSave now returns
both `(themePrefs, sectorConviction)`.

**Server (api/portfolio.ts):** `buildThemeBlock()` now emits BOTH a THEMATIC
CONVICTION list and a SECTOR CONVICTION list under one shared rule set (LEAN IN
prioritized, AVOID hard-blocked, NEUTRAL fully eligible on merit, LEAN-IN theme
and LEAN-IN sector not in competition). Sector actual weights are derived from
the `positions` payload — no new actuals field sent. Wired into cash_deploy +
macro_risk only (both already call buildThemeBlock). Also fixed the earlier
cosmetic "12 GICS sectors" → "11" wording in buildSectorAlignmentBlock.

**Privacy:** only new payload field is `sectorConviction` (stance enums) — no
dollars, no share counts. Portfolio-tab percentage-only rule holds.

**Verification:** `npx tsc --noEmit` and `npm run build` pass.

**Migration handed off (NOT run by Claude Code):**
  `supabase_migration_sector_conviction.sql` — `ADD COLUMN IF NOT EXISTS
  sector_conviction jsonb` on user_preferences (idempotent, nullable, existing
  RLS covers it). Missing column degrades to null (all-neutral) until run.

**Files created:** supabase_migration_sector_conviction.sql
**Files modified:** api/portfolio.ts · src/components/compare/PortfolioTab.tsx ·
  src/components/compare/ThematicFrameworkPanel.tsx · src/hooks/usePortfolioSync.ts ·
  src/pages/Portfolio.tsx · CLAUDE.md

---

### July 24, 2026 — Production URL corrected · newswire pipeline discovered undocumented · silent-empty-state diagnostics added

**Production URL resolved (July 21's open item):** Confirmed via live inspection
that `stock-tracker-five-tau.vercel.app` (the previously documented URL) is
DEAD — missing `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` env vars, throws a
fatal Supabase client init exception on load, nothing renders past a blank
shell. `portfolio-analysis-six.vercel.app` is confirmed live and correct:
`/api/prices`, `newswire_items`, and `analyses` all return HTTP 200. These are
NOT aliases of the same deployment — five-tau is stale/misconfigured and
should not be used for testing or referenced in deploy docs going forward.

**Undocumented feature discovered: full newswire pipeline already exists.**
While investigating why no news feed was visible in the sidebar, found that
`.github/workflows/newswire.yml` (cron, weekdays 7:30am ET), `scripts/
newswire.mjs` (pulls Yahoo Finance RSS per ticker, zero Claude API cost,
zero API key, filters to last 24h, upserts to a `newswire_items` Supabase
table), and `src/hooks/useNewswire.ts` (reads latest run's items, wired into
SidePanel's "TODAY'S WIRE" section) were all already built and deployed —
none of this was ever logged in this file. Origin/session of the original
build is unknown. This CLAUDE.md entry is the first documentation of it.

**Bug found: TODAY'S WIRE renders nothing on the live site.** The Supabase
`newswire_items` query returns 200 (not an error) but the sidebar section
never appears, meaning `newswireItems.length === 0` after a successful query.
Two possible causes, not yet distinguished:
  1. The GitHub Actions cron has never successfully written rows (never
     triggered, missing repo secrets `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`,
     or failing silently before the write)
  2. RLS on `newswire_items` allows the `service_role` insert (used by the
     script) but has no SELECT policy for `anon` (used by the browser), so
     every write succeeds and every read comes back empty
  Root cause NOT yet confirmed — next session should check GitHub Actions run
  history for "Daily Newswire" and row count in Supabase Table Editor for
  `newswire_items` before making further changes here.

**Fix applied regardless of root cause:** `useNewswire.ts` previously failed
completely silently — no console output on either an error or a successful-
but-empty result, making this exact bug undiagnosable without manually
inspecting the network tab. Added permanent `console.info('[newswire] load
result: ...')` diagnostic logging for all three outcomes (error / 0 rows /
success with counts), mirroring the `usePortfolioSync` diagnostic pattern
from July 20. No UI changes — matches the established preference for
console-level diagnostics over visible banners for this class of issue.

**Verification:** Not yet deployed/tested against live Supabase state —
`npx tsc --noEmit` should be run before deploy per usual.

**Files modified:** src/hooks/useNewswire.ts · CLAUDE.md

**Next session:** confirm root cause via the two checks above, then apply the
actual fix — either an `anon` SELECT policy migration on `newswire_items`, or
a manual `workflow_dispatch` trigger + secrets check on the GitHub Actions
side. Also still open from earlier sessions: delete `api/edgar.ts` (confirmed
dead code), and the Net Worth AI Analysis Claude Code prompt (spec'd July 17,
execution status unconfirmed).

---

### July 27, 2026 — News tab is the new landing page (front-page ranking, zero API cost)

**New: full News tab at `/`, Dashboard moved to `/dashboard`.** The sidebar's
"TODAY'S WIRE" teaser grew into a front-page-style News tab. Ranking uses only
data already in hand — `LivePrice.marketCap` / `changePercent` from the store
plus the existing `newswire_items` archive — so NO LLM calls and no new API
cost. Three tiers, computed by a pure, unit-testable `rankFrontPage()`:
  - **Lead stories** — highest market-cap tickers with coverage in the last 72h.
  - **Also moving** — any ticker (regardless of cap) with an outsized 1-day move
    (≥5% abs), so a big event at a small name surfaces even though it can't
    out-rank NVDA on cap alone.
  - **Feed** — everything else, reverse-chronological, paginated (300/page).
  Stories are deduped by URL (same story fetched under multiple tickers merges
  its ticker/sector badges; first-seen headline/timestamp wins).

**Price fetch hoisted to App level.** `useLivePrice()` now runs once in
`App.tsx` (alongside `useSupabaseSync()`) instead of only in `Dashboard.tsx` —
the News landing page needs prices for ranking, and the hook is
staleness-guarded so hoisting causes no duplicate fetches. `Dashboard.tsx` no
longer calls it.

**published_at added to the newswire pipeline.** New nullable
`newswire_items.published_at timestamptz` column (+ published_at / created_at
indexes). `scripts/newswire.mjs` now captures each RSS item's `pubDate` into it;
rows whose pubDate fails to parse (and all existing rows) stay null and fall
back to `created_at` for sorting — harmless. **Migration was run manually in
Supabase this session**; real timestamps populate once the cron next fires.

**SidePanel shrunk to a teaser.** "TODAY'S WIRE" now renders only the first 3
items plus a "See all news →" link to `/`. `sentimentColor()` moved from
SidePanel into `useNewswire.ts` and exported as the single source of truth
(SidePanel + NewsFeed both consume it). NEEDS ATTENTION / RECENTLY ANALYZED
unchanged.

**Nav + routing:** NAV_LINKS reordered to News · Dashboard · Portfolio · Net
Worth. Sector filter pill bar gate changed from `location.pathname === '/'` to
`=== '/dashboard'` (it's Dashboard-specific and Dashboard no longer lives at
`/`). Logo `<Link to="/">` now doubles as "go to News".

**Also fixed:** `scripts/newswire.mjs` User-Agent string still pointed at the
dead `stock-tracker-five-tau.vercel.app` — corrected to the live
`portfolio-analysis-six.vercel.app` (cosmetic UA identifier only).

**Privacy:** untouched — News ranking reads only public market data + the
newswire archive; no dollars/shares involved anywhere.

**Verification:** `npx tsc --noEmit` and `npm run build` pass. Browser-verified
locally (dummy Supabase env): `/` renders News with no pill bar, `/dashboard`
renders the unchanged Watchlist with the pill bar, nav order correct, News
error path degrades gracefully to an inline message (no crash). Committed
(`4ef8178`), pushed, and deployed to Vercel production (READY).

**Files created:** `supabase_migration_newswire_published_at.sql` ·
  src/hooks/useNewsArchive.ts · src/lib/newsRanking.ts ·
  src/components/NewsFeed/index.tsx · src/pages/News.tsx
**Files modified:** scripts/newswire.mjs · src/hooks/useNewswire.ts ·
  src/App.tsx · src/pages/Dashboard.tsx · src/components/Layout/index.tsx ·
  src/components/SidePanel/index.tsx · CLAUDE.md
---

### July 28, 2026 — Filter generic/listicle noise out of the News tab

**Root cause:** the RSS newswire pipeline had no materiality signal — every
Yahoo RSS item was written verbatim, so content-mill listicles ("3 Stocks to
Buy," "X vs Y," dividend roundups) sat alongside real material news. Worse,
`rankFrontPage()` ranked Lead Stories purely by `maxMarketCap`, so NVDA's
largest-cap headline always won Lead regardless of whether anything actually
happened.

**Heuristic classification at ingestion (zero Claude cost).** Added a
classification section to `scripts/newswire.mjs` after `parseRssItems()`:
  - `MATERIAL_PATTERNS` — regex per material category (earnings, guidance,
    contract_partnership, regulatory_legal, ma_corporate, executive,
    product_technology, analyst_rating_change, recall). A material match ALWAYS
    wins — sets `category`, `is_generic=false` — even over a known content-mill
    domain.
  - `GENERIC_HEADLINE_PATTERNS` — listicle/"stocks to buy"/"vs"/"here's why"
    shapes.
  - `GENERIC_SOURCE_DOMAINS` — soft signal only (fool.com, zacks.com,
    insidermonkey.com, 247wallst.com, simplywall.st, gurufocus.com,
    moneymorning.com); checked only after material patterns, overridable by a
    material match.
  - `classifyHeadline(title, link)` returns `{ category, isGeneric }`; items
    matching neither pass through unflagged (category null, is_generic false) —
    we only drop what we're fairly confident is noise. No Claude API calls,
    consistent with the rest of this pipeline.
  Each ingested item is now tagged with `category` + `is_generic`; a run log
  reports how many were flagged. Generic items are still WRITTEN to Supabase
  (flagged, not dropped at ingestion) so the heuristic stays adjustable without
  re-running ingestion and leaves a debugging trail.

**Schema:** new `category text` + `is_generic boolean not null default false`
columns on `newswire_items` (plus an `is_generic` index).
`supabase_migration_newswire_classification.sql` handed off — NOT run by Claude
Code. MUST be run in the Supabase SQL Editor before the next scheduled cron
fires, or the insert will fail on the unknown columns. Existing rows default to
`is_generic=false` / `category=null` and simply age out of the 72h window rather
than being retroactively reclassified.

**Filtering + ranking (app side).** `NewswireItem` (useNewswire.ts) and
`NewsStory` (newsRanking.ts) gained `category` / `is_generic`. `dedupeByUrl()`
now `continue`s past any `is_generic` item — flagged content is DROPPED entirely
from the News tab (not demoted to a toggle), so lead/movers/feed all inherit the
filter automatically. Lead Stories now sort by materiality-category-presence
FIRST (has a category → ranks above uncategorized), market cap as tiebreaker —
previously market cap only. Category is carried through the dedupe merge
(first-seen category wins).

**Revisit if needed:** the heuristic can be tuned (add/remove patterns or
domains) without a schema change if it proves too aggressive or too loose in
practice.

**Privacy:** untouched — only public headline metadata (category / is_generic)
added; no dollar/share figures anywhere.

**Verification:** `npx tsc --noEmit` and `npm run build` pass.

**Files created:** supabase_migration_newswire_classification.sql
**Files modified:** scripts/newswire.mjs · src/hooks/useNewswire.ts ·
  src/lib/newsRanking.ts · CLAUDE.md

---

### July 28, 2026 (patch) — Fix ticker mis-attribution in News classification + per-ticker diversity cap

**Live bug after the significance-filter deploy:** all 6 Lead Stories rendered
tagged "NVDA" but the headlines were about unrelated companies — CTS
Corporation, HF Sinclair, Corning, Starbucks, Microsoft. Root cause: Yahoo's
per-symbol RSS feed isn't strictly "news about this ticker" — it also
syndicates a general earnings-calendar / market-wrap block onto every symbol's
page, tagged with whatever ticker the feed was requested under regardless of
subject. `classifyHeadline()` correctly matched these as `category: 'earnings'`
(they do contain earnings language) but never checked whether the headline was
actually about the ticker it got filed under, so mis-tagged content passed the
generic filter and then won Lead via NVDA's market cap.

**Relevance gate (scripts/newswire.mjs):** added `COMPANY_ALIASES` (name
aliases per tracked ticker) + `isAboutTicker(title, ticker)` — true if a
case-insensitive alias matches OR the ticker symbol appears as a standalone
case-sensitive token (symbols stay uppercase in headlines, avoiding false
positives on short tickers that are also words, e.g. BE). `classifyHeadline()`
now takes `ticker` and requires relevance before trusting ANY classification:
a material-pattern match that isn't about its own company is dropped as
`is_generic: true` rather than kept; an item matching no pattern is also
flagged generic if it doesn't mention the company. Call site passes the loop's
`ticker`.

**Diversity cap (src/lib/newsRanking.ts):** `MAX_PER_TICKER = 3` +
`selectWithDiversityCap()` applied to both Lead and Movers — skips a story once
its primary ticker has hit the cap, preserving sort order otherwise. Prevents
one ticker's news day from sweeping every slot without re-ranking anything.
`feed` construction unchanged.

**Note:** existing pre-classification rows in `newswire_items` aren't
retroactively reclassified — they age out of the 72h recent window naturally.
The classification migration from the earlier entry still must be applied for
new cron writes to carry `category` / `is_generic`.

**Privacy:** untouched — only public headline metadata; no dollars/shares.

**Verification:** `npx tsc --noEmit` and `npm run build` pass.

**Files modified:** scripts/newswire.mjs · src/lib/newsRanking.ts · CLAUDE.md

---

### July 28, 2026 (patch 2) — Universe expansion 31 → 50 + new Cyber dashboard pill

**What:** added 19 tickers and a 5th dashboard sector pill, CYBER. All three
classification taxonomies were updated in sync (kept deliberately separate — do
NOT conflate): the dashboard `Sector` type/pills, the portfolio GICS
`UNIVERSE_SECTOR_MAP`, and the thematic `TICKER_THEME_MAP`.

**New tickers (19):**
  - Space (+1): SPCX (SpaceX — IPO'd Nasdaq June 2026; `space` primary,
    `ai_infrastructure` crossover via the early-2026 xAI/Colossus acquisition).
  - AI-infra hyperscalers (4): MSFT, GOOGL, AMZN, META.
  - AI-infra compute/networking/hardware (6): ANET, MU, SMCI, AVGO, INTC, DELL.
  - AI-infra power & buildout (4): PWR (crossover `clean_energy`), ETN, EQIX, GNRC.
  - Cyber (5): CRWD, PANW, NET, ZS, FTNT — the only names on the new `cyber` pill.

**Dashboard pill layer (`src/types/index.ts` + Layout):** `Sector` gained
`'cyber'`; SECTOR_LABELS/SECTOR_COLORS gained a Cyber entry reusing the existing
red/pink accent `#ff4b6e` (no new hex). Layout's `SECTORS` array appended
`'cyber'` — the pill loop is generic, no other Layout change.

**GICS (`src/config/gics.ts`):** 19 entries added to `UNIVERSE_SECTOR_MAP` —
promotions of tags already present in the `KNOWN_TICKERS` fallback (only SPCX and
GNRC genuinely new). No `SubSector`/`SECTOR_DISPLAY` changes — every subSector
used already existed. Header comment de-counted ("31-stock" → "Tracked universe").

**Themes (`src/config/themes.ts`):** cyber + hyperscaler names stay under the
existing `ai_infrastructure` THEME (NOT a 5th theme — the 5th category is a
dashboard-pill concept only). Three new sub-themes added: `hyperscale_cloud`,
`ai_networking_and_hardware`, `cybersecurity` (union + SUBTHEME_DISPLAY). 19 new
`TICKER_THEME_MAP` entries + SPCX under space_economy.

**Count de-hardcoding (per Jared):** stopped treating the universe size as a
fixed number in prose. Replaced verbatim "31-stock"/"31 stocks" current-state
references in CLAUDE.md and PROJECT_INSTRUCTIONS.md with "tracked universe"
phrasing, and updated the two `api/portfolio.ts` prompt strings ("tracked
31-stock universe" → "tracked universe") so the model isn't told a stale count.
Historical session-log entries were left as-is (they record what was true then).
`api/edgar.ts`'s stale "31 stocks" comment left untouched — it's confirmed dead
code slated for deletion.

**No API/EDGAR changes:** analyze.ts / portfolio.ts / prices.ts are
ticker-agnostic; all 19 names are normal domestic 10-K/10-Q/8-K filers (SPCX
included — a US domestic issuer, not a foreign private issuer), so no EDGAR
special-casing.

**Privacy:** untouched — no dollar/share data involved anywhere in this change.

**Verification:** `npx tsc --noEmit` and `npm run build` both pass.

**Files modified:** src/types/index.ts · src/components/Layout/index.tsx ·
  src/config/tickers.ts · src/config/gics.ts · src/config/themes.ts ·
  api/portfolio.ts · CLAUDE.md · PROJECT_INSTRUCTIONS.md

---

### July 28, 2026 (patch 3) — Finish 31→50: StockDetail CIK/sector maps + newswire pipeline

**Two files were missed in the initial 31→50 pass** (patch 2) and still only had
the old 31-ticker universe. Both keep manually-duplicated ticker constants that
do NOT import from `tickers.ts`, so they don't inherit universe changes:

  - **`src/components/StockDetail.tsx`** — keeps local copies "to avoid circular
    issues." Its `CIK_MAP` had no entry for any of the 19 new tickers, so
    "Run Analysis" threw `Unknown ticker: <X>` (line ~171) immediately for every
    one of them on the live site — a runtime gap tsc/build can't catch. Added all
    19 CIKs (verified against SEC `company_tickers.json`). Also added the `cyber`
    entry to `SECTOR_COLOR_MAP` (#ff4b6e) and `SECTOR_LABEL_MAP` ('Cyber') so
    Cyber pills render with the right accent/label instead of the fallback.
  - **`scripts/newswire.mjs`** — plain `.mjs`, no build step, can't import
    `tickers.ts`, so keeps its own `TICKERS` array + `COMPANY_ALIASES`. Added all
    19 (with name aliases — needed for the `isAboutTicker()` relevance gate, esp.
    short tickers NET/MU/PWR). Until the next GitHub Actions cron fires (weekdays
    7:30am ET), the 19 won't appear in Today's Wire/News — expected, not a bug.
    Also de-counted the stale header comment ("each of the 31 tickers" → "each
    tracked ticker").

**Correction to patch 2's wording:** that entry said the expansion was
"ticker-agnostic — no API changes." True for the three API files
(analyze/portfolio/prices), but NOT app-wide: StockDetail.tsx and newswire.mjs
both hard-code ticker constants by hand. SPCX added to the Known Issues note
(newly public June 2026, thin EDGAR history — like FLY; not added to
SPECULATIVE/SEDAR_ONLY/TRAINING_ONLY).

**Universe-change checklist (update ALL of these on every universe change):**
  1. `src/config/tickers.ts` — TICKERS array
  2. `src/config/gics.ts` — UNIVERSE_SECTOR_MAP
  3. `src/config/themes.ts` — TICKER_THEME_MAP (+ new sub-themes)
  4. `src/types/index.ts` + `src/components/Layout/index.tsx` — Sector type,
     SECTOR_LABELS/COLORS, and the Layout SECTORS pill array (only on new pill)
  5. `src/components/StockDetail.tsx` — CIK_MAP + SECTOR_COLOR_MAP/SECTOR_LABEL_MAP
  6. `scripts/newswire.mjs` — TICKERS + COMPANY_ALIASES
  7. `scripts/indexCalc.mjs` — PRIMARY_SECTOR map (+ TICKER_INTRO_MONTH for any
     newly-added ticker, so it "floats on" the AI Index the next month). Added
     July 30 2026 with the AI Index feature. `src/lib/indexCalc.ts` derives
     membership from tickers.ts directly and needs no manual edit.

**Verification:** `npx tsc --noEmit` and `npm run build` pass. Runtime CIK gap
verified fixed by code inspection (map lookup at StockDetail.tsx:170-171).

**Files modified:** src/components/StockDetail.tsx · scripts/newswire.mjs · CLAUDE.md

---

### July 28, 2026 (patch 4) — Sharpen sector_explore: web search + conviction + recent-suggestion exclusion + deeper rationale

**Why:** `sector_explore` produced recurring tickers, ignored theme/sector
conviction, and gave shallow one-sentence rationales. Root-caused against three
specific gaps (NOT `cash_deploy`, which already handled all three correctly
since the July 22 fixes):
  1. **Recurring tickers** — `sector_explore` was the only new-idea request
     type WITHOUT the `web_search_20250305` tool. It called `buildFreshnessBlock()`
     with no arg (no-live-access branch), so it reasoned from frozen training
     priors every call — same inputs, same output.
  2. **Ignored conviction** — server: `buildSectorExplorePrompt` never called
     `buildThemeBlock()`. Client: `runSectorExplore()` never sent
     `themePreferences`/`themeActuals`/`sectorConviction` (unlike `runCashDeploy()`
     directly above it).
  3. **Shallow rationale** — `max_tokens: 600` + an explicit "One concise
     sentence" instruction in both prompt branches.

**Server (`api/portfolio.ts`):** `buildSectorExplorePrompt` now prepends
`buildThemeBlock(themePreferences, themeActuals, sectorConviction, positions)`
(same position as `buildCashDeployPrompt`) and calls `buildFreshnessBlock(true)`
in both fund/non-fund branches. Rationale instruction deepened to 2-3 sentences
(sector fit + one concrete consideration + non-fund: differentiation from the
obvious larger name). Non-fund branch gained the "not restricted to tracked
universe / don't default to generic mega-caps" language from `cash_deploy`. New
optional `recentlySuggested?: string[]` on `RequestBody` → emits a "PREVIOUSLY
SUGGESTED FOR THIS SECTOR" exclusion block (prefer a different name unless one
is clearly the single best fit). `max_tokens` 600 → 1000. `useWebSearch` now
includes `sector_explore`.

**JSON-parsing hardening (general robustness, not sector_explore-specific):**
with web search on, the joined text can carry incidental preamble around the
JSON array, and a stray sentence of search narration would break `JSON.parse`.
Two defenses: (a) an explicit "use search silently, respond with nothing but the
JSON array" instruction in both branches; (b) the handler now slices from the
first `[` to the last `]` before parsing (`const result` → `let result`, uses
the trimmed slice downstream). Reuse this slice pattern for any future
JSON-returning request type that also gets web search.

**Client (`src/components/compare/PortfolioTab.tsx`):** `runSectorExplore()`
now sends `themeActuals`/`themePreferences`/`sectorConviction` (copied from
`runCashDeploy`) plus `recentlySuggested: getRecentSuggestions(sector)`. New
sessionStorage-backed recent-suggestion tracker (`RECENT_EXPLORE_KEY =
'portfolio_recent_explore_v1'`, `getRecentSuggestions`/`pushRecentSuggestions`,
capped 6/sector, keyed by sector) — ephemeral, not synced, matching the tab's
sessionStorage convention. `pushRecentSuggestions(sector, parsed.map(s =>
s.ticker))` runs after a successful parse.

**Privacy:** untouched — only `themeActuals`/stance enums + a ticker string
array added to the payload; no dollars/shares. Portfolio-tab percentage-only
rule holds.

**Verification:** `npx tsc --noEmit` and `npm run build` pass. Behavior change
(picks vary across repeated same-sector explores; JSON path survives search
narration; AVOID conviction excludes a sector) depends on live model output —
verify by running explore twice for one underweight sector post-deploy.

**Files modified:** api/portfolio.ts · src/components/compare/PortfolioTab.tsx ·
  CLAUDE.md

---

### July 28, 2026 (patch 5) — Live-priced crypto accounts in Net Worth

**What:** the `crypto` AccountKind was wired identically to `balance` — a manual
dollar figure needing hand-updates. Now a crypto account can hold a Yahoo Finance
ticker (`BTC-USD`, `ETH-USD`, any Yahoo-supported symbol — not a fixed coin list)
plus a quantity, and its displayed value is computed live as `quantity ×
livePrice`, refreshed like stock prices.

**Backward compatible:** a crypto account switches to the live-priced path ONLY
when BOTH `cryptoSymbol` and `cryptoQuantity` are set. Existing manual-balance
crypto rows (and any pre-migration rows) keep using their stored `balance`
via `BalanceCell`, unchanged.

**Schema:** new nullable `crypto_symbol text` + `crypto_quantity numeric` on
`public.accounts`. `supabase_migration_crypto_holdings.sql` (idempotent, additive,
existing RLS covers it). NOTE: the migration file did not actually exist in the
repo despite an earlier hand-off claim — it was (re)created this session. It MUST
be applied in the Supabase SQL Editor before this ships, or crypto
insert/update fails on the unknown columns. `useNetWorthSync` selects `'*'`, so a
missing column degrades a READ to null (manual-balance behavior); only WRITES
that reference the columns fail.

**New hook `src/hooks/useCryptoPrices.ts`:** deliberately separate from
`useLivePrice.ts` (which is hardcoded to `ALL_TICKERS` and writes the Zustand
store). Takes a dynamic per-user symbol set, dedupes/uppercases, fetches through
the same `/api/prices` endpoint, caches in local component state with a 5-min
staleness window (matches the endpoint's `s-maxage=300`), and keeps last-known
prices on fetch error rather than clearing to zero. Effect keyed on the
normalized sorted symbol string so a fresh array identity each render doesn't
re-fetch.

**`useNetWorthSync.ts`:** `NetWorthAccount` + `AccountRow` + `mapRow` gained
`cryptoSymbol`/`cryptoQuantity` (snake_case in DB). New `CryptoFields { symbol,
quantity }`; `addAccount` gained an optional 6th `crypto?` arg threaded into both
anon and Supabase-insert branches (mirrors `creditCard`). New immediate-write
`updateCryptoHolding(id, symbol, quantity)` modeled on `updateCreditCard`
(discrete commit, not the 800ms balance debounce) — writes symbol/quantity +
reuses `balance_updated_at`.

**`AddAccountPanel.tsx`:** when `kind === 'crypto'`, the dollar-balance field is
replaced by Symbol (text, uppercased, helper "Yahoo Finance ticker format —
BTC-USD, ETH-USD, SOL-USD, etc.") + Quantity (number, step any, ≥0). `canSave`
requires symbol + valid quantity for crypto; on save, `balance` is passed as `0`
(unused placeholder) and the crypto fields go as the new 6th `onAdd` arg.

**`NetWorthTab.tsx`:** `useCryptoPrices` wired in from live-priced crypto symbols.
Helpers `isLivePricedCrypto()` + `cryptoValue(account, prices)` (falls back to
`balance` when no live price yet — never NaN). Totals `useMemo`, AI-analysis
`accountPayload`, and row rendering all route crypto through `cryptoValue`.
Live-priced rows render a read-only `CryptoValueCell` (computed value + a
`{qty} {symbol} @ {unitPrice}` context line) with click-to-edit QUANTITY (symbol
edit deferred to v1 — remove/re-add to switch coins). Analysis payload also
carries `cryptoSymbol`/`cryptoQuantity` so the prompt can name the holding.

**`api/prices.ts`:** added an `isCrypto = quoteType === 'CRYPTOCURRENCY'` branch
that short-circuits the stock-only `quoteSummary` round-trip (all those fields
are meaningless for crypto) — a small latency win. The existing try/catch
fallback already handled crypto correctly; this just avoids one wasted call.

**`api/portfolio.ts`:** `NetWorthAccountPayload` gained optional
`cryptoSymbol`/`cryptoQuantity`; `buildNetWorthPrompt`'s account line renders
live-priced crypto as `label | crypto (0.5 BTC-USD) | $X` for better grounding.

**Privacy:** Net Worth tab is the deliberate dollar-figure exception (admin-only)
— unchanged. This adds symbol/quantity to that same payload; no bleed into the
Portfolio-tab percentage-only rule.

**Verification:** `npx tsc --noEmit` and `npm run build` pass. Live behavior is
NOT locally verifiable — `/api/prices` is a Vercel function not served by plain
`vite dev`, and the tab is admin-gated. Post-deploy: add a `BTC-USD` crypto
account with a quantity, confirm the row shows a live computed value (not $0),
confirm net-worth totals include it, confirm a typo symbol degrades to
"price unavailable" + last-known balance (no NaN/crash), and confirm an existing
manual-balance crypto row is unaffected.

**Files created:** src/hooks/useCryptoPrices.ts ·
  supabase_migration_crypto_holdings.sql
**Files modified:** src/hooks/useNetWorthSync.ts ·
  src/components/networth/AddAccountPanel.tsx ·
  src/components/networth/NetWorthTab.tsx · api/prices.ts · api/portfolio.ts ·
  CLAUDE.md

---

### July 30, 2026 — AI Index (composite + 5 sub-indices), zero-API market-cap index

**What:** a market-cap-weighted index layer — one composite "AI Index" across
the full tracked universe plus one sub-index per dashboard sector pill (Space,
AI Infrastructure, Defense, Clean Energy, Cyber). Pure math on data already
fetched by useLivePrice() — ZERO Claude API cost, no new external API. Same
weighting principle as the S&P 500: `value = Σ(price × sharesOutstanding) /
divisor`, uncapped, divisor absorbs constituent changes so the value never
jumps when a ticker floats on. Base = 100 on `INDEX_BASE_DATE` ('2026-07-31').

**Membership — PRIMARY sector only (do NOT use crossover tags).** A ticker
belongs to exactly one sub-index (its `ticker.sectors[0]`) and to the composite
once. Verified programmatically that the scripts/indexCalc.mjs `PRIMARY_SECTOR`
duplicate matches `tickers.ts` sectors[0] for all 50 tickers, and that the five
sub-index counts (space 9 · ai_infrastructure 23 · defense 3 · clean_energy 10 ·
cyber 5) sum to exactly 50 = composite (no double-counting). NOTE: the
index_name enum values ARE the dashboard Sector values, NOT gics.ts sectors —
the sub-indices follow the dashboard pills, membership by primary dashboard
sector.

**"Float on" rule (per Jared: "include the stock in the next month after it is
introduced").** A newly-added ticker enters at the first close AFTER its
introduction month; the divisor is recalculated at entry so the value doesn't
jump, and the entrant is excluded from that day's day-change basis (no prior
in-index close). `TICKER_INTRO_MONTH` in scripts/indexCalc.mjs currently tags
the 20 July-2026 universe-expansion names ('2026-07' → they float on from the
first Aug 2026 close); original-universe names have no intro and are present
from the base date. Remove a name's entry to make it enter immediately.

**Pure calc module (`src/lib/indexCalc.ts`)** mirrors the rankFrontPage()
pattern — I/O-free, unit-testable `computeIndexValue()`. Verified: base seeds to
100, day-change and per-ticker contributions sum correctly, and a new entrant
leaves the index value continuous. scripts/indexCalc.mjs re-implements the same
math (plain .mjs can't import .ts — the established TICKERS/COMPANY_ALIASES
duplication convention); scripts/indexBackfill.mjs imports the helpers from
indexCalc.mjs (.mjs→.mjs) rather than a third copy — indexCalc.mjs guards its
`main()` with an `import.meta.url === file://argv[1]` check and creates its
Supabase client inside main() so importing it is side-effect-free.

**Live headline number is client-side, NOT read from index_history.**
`useIndexValue.ts` (`useIndexValues`) computes composite + 5 sub-index values in
-browser from the store's already-fetched prices (marketCap/price → shares,
price − change → prevClose) against the most recent STORED divisor from
index_history. index_history is only for the historical chart + prior closes.
Before any divisor is stored the value bootstraps to 100 (graceful, flagged
`isBootstrapped`). Same file also exports `useIndexHistory` (chart/sparkline)
and `useIndexConstituents` (drill-down table).

**Charts are hand-rolled inline SVG — deliberately NO charting dependency.**
This project hand-rolls to avoid deps (see the RSS parser); package.json has no
chart lib and "Stack — Do Not Deviate Without Discussion" applies. Both the
30-day sparkline (IndexTicker) and the 1M/3M/1Y line chart (IndexDetail) are
plain SVG polylines. If a charting lib is ever wanted, that's a separate stack
discussion.

**UI:** `IndexTicker` widget mounts on the News tab (`/`) above Lead Stories —
composite hero (value + day% + sparkline) + 5 clickable sub-index pills. New
route `/index/:indexName` (composite | space | ai_infrastructure | defense |
clean_energy | cyber), wrapped in ErrorBoundary, → `IndexDetail`
(pages/IndexDetail.tsx re-exports components/IndexDetail, same split as
StockDetail). Detail page: header, range toggle, SVG line chart, sortable
constituent-contribution table (TICKER · WEIGHT% · DAY% · CONTRIBUTION pp,
default sort by contribution), and the current-share-count approximation caveat
text. Composite accent = brand cyan; sub-indices reuse SECTOR_COLORS.

**Daily persistence — piggybacks the Daily Newswire cron.** Added a "Run index
calc (post-market close only)" step to `.github/workflows/newswire.yml`, gated
`if: github.event.schedule == '0 21 * * 1-5' || workflow_dispatch` so it fires
ONLY on the 5pm-ET leg (one daily close, not two) + manual runs. Gets only
SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — no ANTHROPIC_API_KEY.

**Backfill (`scripts/indexBackfill.mjs`) — run MANUALLY once, NOT in CI.**
Fetches ~1yr daily closes (yahoo-finance2 chart), approximates historical cap as
CURRENT shares × historical close (flagged in code + UI caveat), applies the
same float-on rule, bulk-upserts ~252 days × 6 indices. Needs no API key.

**Migration handed off (NOT run by Claude Code):**
`supabase_migration_index_history.sql` — `index_history` + `index_constituents`
tables, `(index_name, date)` indexes, RLS mirroring newswire_items (public
SELECT, service_role write). MUST be applied in the Supabase SQL Editor before
the first index cron fires or the write fails on the missing tables.

**Privacy:** untouched — index math reads only public market data; no
dollars/shares of the user's own holdings anywhere.

**Verification:** `npx tsc --noEmit` + `npm run build` pass. Pure-math and
membership unit-checks pass (see above). Browser-verified locally (dummy
Supabase env, no /api/prices): News shows the widget with all 6 indices,
`/index/composite` (50 constituents) + `/index/cyber` (5, SUB-INDEX badge)
render with correct empty/bootstrap states, invalid `/index/bogus` shows the
unknown-index guard, no console errors. Live values + history are NOT locally
verifiable (needs the Vercel /api/prices function + real Supabase) — post-deploy:
apply the migration, run `node scripts/indexBackfill.mjs` once, confirm the
widget shows non-zero values and the chart draws after the first cron/backfill.

**Files created:** src/lib/indexCalc.ts · src/hooks/useIndexValue.ts ·
  src/components/IndexTicker/index.tsx · src/components/IndexDetail/index.tsx ·
  src/pages/IndexDetail.tsx · scripts/indexCalc.mjs · scripts/indexBackfill.mjs ·
  supabase_migration_index_history.sql
**Files modified:** src/App.tsx · src/components/NewsFeed/index.tsx ·
  .github/workflows/newswire.yml · CLAUDE.md

---

### July 30, 2026 (patch) — Fix AI Index float-on gate, backfill divisor anchoring, completeness logging, chart hover

**Root bug (float-on gate excluded all 20 expansion tickers from history).** The
`TICKER_INTRO_MONTH` map in scripts/indexCalc.mjs tagged the 20 July-28-expansion
names (SPCX + the hyperscalers/compute/power/cyber adds) with `'2026-07'`, making
them eligible only from the first close AFTER July 2026 — i.e. Aug 1, 2026, one
day past `INDEX_BASE_DATE` ('2026-07-31'). Consequences: (1) the entire ~1-year
backfill window ends before Aug 1, so NONE of the 20 were ever eligible in
backfilled history — history was silently stuck on the old 31-ticker universe;
(2) worse, the LIVE client path (src/lib/indexCalc.ts) had NO eligibility gate at
all and counted all 50, so the live headline value and per-ticker weights (esp.
an inflated apparent NVDA weight) never matched the stored chart/history. Per
Jared: he wants all 50 tracked tickers in NOW, not gradually. Emptied
`TICKER_INTRO_MONTH` in scripts/indexCalc.mjs (kept as the empty pattern for
future expansions — add a `'TICKER': 'YYYY-MM'` entry to float a new name on the
following month).

**Live/history parity — added the eligibility gate to the client path too.**
src/lib/indexCalc.ts gained a mirrored (hand-synced, per the app's
TICKERS/COMPANY_ALIASES duplication convention) `TICKER_INTRO_MONTH` +
`isEligible(ticker, dateStr)` + `eligibleTickersForIndex(indexName, todayISODate)`.
`useIndexValue.ts` (`useIndexValues`) now calls `eligibleTickersForIndex(name,
todayISODate)` instead of `tickersForIndex(name)`, so any FUTURE float-on name is
gated identically live-side and can't reintroduce the live-vs-history mismatch.
Both maps are currently empty (all 50 eligible), so today the gate is a no-op —
the fix is structural.

**Backfill divisor anchored to INDEX_BASE_DATE (was: first date in the lookback
window).** scripts/indexBackfill.mjs previously seeded `divisor=null` on whatever
date happened to be first in its trailing-365-day window, silently rebasing
"value = 100" to a year before launch. Now it exports/imports `INDEX_BASE_DATE`
from indexCalc.mjs, finds the anchor index (first backfilled date ≥ base date;
falls back to the last available date if the base date is still in the future),
runs a FORWARD pass anchor→end that establishes the divisor at the base date, then
a BACKWARD pass anchor→start holding that same anchor divisor fixed (no
entrant/exit continuity adjustment walking backward — a name lacking price history
that far back, e.g. SPCX pre-IPO, just drops out of that date's numerator, already
covered by the UI's "approximated, not exact reconstruction" caveat). Result: the
whole series is continuous and consistent with the live/cron path, which always
seeds against INDEX_BASE_DATE.

**Composite completeness logging (both scripts).** A silent quote/chart-fetch
failure for any ticker drops it from every index it belongs to via the existing
per-ticker `[warn]` lines, but nothing summarized the net result — the July-30
float-on gap was only discoverable through the UI. Both scripts/indexCalc.mjs
(daily cron) and scripts/indexBackfill.mjs now log `Composite completeness:
N/{total} tracked tickers present` and a `⚠ MISSING: <tickers>` warning when any
are absent, so a universe/coverage gap surfaces immediately in the Action log.

**Chart hover tooltip (src/components/IndexDetail/index.tsx).** The hand-rolled
SVG `LineChart` (no charting dep — stack rule unchanged) gained an `onMouseMove`
crosshair: maps screen X → viewBox X (accounting for the fixed viewBox width vs.
rendered width), snaps to the nearest data point, and draws a dashed vertical
guide + marker dot + a date/value tooltip box. Tooltip flips to the left of the
crosshair past the chart midpoint and clamps vertically so it never renders
clipped off an edge.

**Privacy:** untouched — index math reads only public market data; no
dollars/shares of the user's own holdings.

**Verification:** `npx tsc --noEmit` + `npm run build` pass; `node --check` passes
on both scripts/indexCalc.mjs and scripts/indexBackfill.mjs. Live values +
backfilled history are NOT locally verifiable (need the Vercel /api/prices
function + real Supabase). Jared to run `node scripts/indexBackfill.mjs` manually
against Supabase after this deploy — Claude Code did NOT run it.

**Files modified:** scripts/indexCalc.mjs · scripts/indexBackfill.mjs ·
  src/lib/indexCalc.ts · src/hooks/useIndexValue.ts ·
  src/components/IndexDetail/index.tsx · CLAUDE.md

---

### July 30, 2026 (patch 2) — sharesOutstanding fallback (fixes 5 tickers dropping from the index)

**Symptom (surfaced by patch 1's completeness logging):** the first successful
backfill wrote only **45/50** tracked tickers into the composite —
`⚠ MISSING: FLY, SATS, MU, ETN, CCJ`. Root cause: Yahoo's plain `quote()`
endpoint returns NO `sharesOutstanding` AND no `marketCap` for those names, so
both the primary read and the existing `marketCap / price` fallback yielded 0,
and a 0-share ticker is filtered out of the cap-weighted numerator entirely
(dropped to 0 weight). MU/ETN/CCJ are not small — their absence materially
skewed the index.

**Fix — shared `quoteSummary` fallback (`sharesFromQuoteSummary()` in
scripts/indexCalc.mjs, exported, imported by scripts/indexBackfill.mjs).** Only
invoked when the primary quote path resolves to 0 shares, so it adds at most one
extra request per affected ticker. Resolution order:
  1. `defaultKeyStatistics.sharesOutstanding` (true count, preferred)
  2. `price.marketCap / price.regularMarketPrice` (second derivation)
  3. `defaultKeyStatistics.floatShares` (last-resort PROXY — logged with a
     `[warn]`). Verified live: for these 4 names Yahoo omits (1) and (2)
     entirely but DOES return floatShares. Float understates total shares
     (excludes insider/restricted), so it slightly under-weights these names —
     acceptable, and covered by the UI's existing "approximation, not exact
     reconstruction" caveat; far better than a 0-weight drop.
  Uses `{ validateResult: false }` — the strict schema would otherwise reject
  the whole payload for names missing these optional fields. Wired into BOTH the
  daily cron path (`fetchQuote` in indexCalc.mjs) and the backfill
  (`loadTicker` in indexBackfill.mjs), so the daily 5pm-ET close write gets the
  same coverage, not just the one-time backfill.

**SATS deliberately NOT addressed** — per Jared it's being removed from the
universe for another stock, so its hard quote failure (`Cannot read properties
of undefined`) is expected to disappear with the swap. Completeness is now
**49/50** (SATS the only omission).

**Backfill re-run (by Claude Code, service-role key supplied by Jared):**
1,506 `index_history` rows + 24,154 `index_constituents` rows written, composite
completeness 49/50, anchored 2026-07-30. The divisor-anchoring + float-on fixes
from patch 1 confirmed working end-to-end against live Supabase.

**No app-bundle change** — only the two `.mjs` scripts (GitHub Actions cron +
manual backfill) changed; no `src/` edit, so no Vercel redeploy is required for
this patch.

**Verification:** `node --check` passes on both scripts; live fallback test
confirms FLY/MU/ETN/CCJ resolve to floatShares.

**Files modified:** scripts/indexCalc.mjs · scripts/indexBackfill.mjs · CLAUDE.md

---

### August 4, 2026 — Crypto Net Worth accounts revert to a manual dollar amount (no live pricing)

**Decision (per Jared):** crypto holdings should just be a manually-entered
dollar value — no symbol lookup, no live spot price. This supersedes the
live-priced crypto flow (symbol + quantity × Yahoo price) for NEW accounts.

**Change — `AddAccountPanel.tsx` only.** The crypto branch no longer renders a
Symbol + Quantity form; crypto now uses the same dollar-balance field as cash /
balance / credit-card kinds (label "Current value ($)", with a hint that it's a
manual value to update by hand). Removed the now-dead `cryptoSymbol` /
`cryptoQuantity` state, their resets, and the `symbolOk`/`quantityOk`/
`cryptoFieldsOk` derivations (`noUnusedLocals` is on). `canSave` validates on
`balanceOk` for every kind; `handleSave` passes `parsedBalance` and `undefined`
for the crypto arg. A crypto account is therefore saved with a real `balance`
and no `crypto_symbol`/`crypto_quantity`.

**Why nothing else changed:** a crypto account with no `cryptoSymbol` already
falls through `isLivePricedCrypto()` as false everywhere in `NetWorthTab.tsx`,
so it renders through the editable `BalanceCell` and `cryptoValue()` returns the
stored balance — exactly the desired manual behavior. The live-pricing
machinery (`useCryptoPrices`, `CryptoValueCell`, the `crypto_symbol`/
`crypto_quantity` columns, `api/prices.ts` crypto branch) is left in place but
dormant — not ripped out, to keep this change small and avoid touching net-worth
totals math. No schema change, no API change.

**Note on the earlier Aug 4 crypto bug-fix work:** the symbol-normalization +
`api/prices.ts` quoteType guard + `failedSymbols` surfacing changes from earlier
this session were STAGED only (never committed) and were reverted before this
change — they were in service of live pricing, which this supersedes. That
session-log entry was rolled back with them.

**Legacy rows:** any pre-existing live-priced crypto row (with a stored
`crypto_symbol` + `crypto_quantity`) will still live-price until removed and
re-added as a manual dollar account. New rows are manual only.

**Verification:** `npx tsc --noEmit` and `npm run build` pass. Not browser-
verified locally — the Net Worth tab is admin-gated (AuthGate) and this is a
pure form-field swap; tsc/build cover it.

**Files modified:** src/components/networth/AddAccountPanel.tsx · CLAUDE.md

---

### August 6, 2026 — Unified earnings-aware analysis freshness (one definition for sidebar + Dashboard)

**Problem:** three separate, both-flawed definitions of "has this stock's
analysis fallen behind its earnings." The Needs Attention sidebar compared a
run timestamp (`analyzedAt`) against Yahoo's `nextEarningsDate` (fragile —
same-day reruns and Yahoo's few-day post-release lag window both produced false
positives/negatives), while the Dashboard's "⚠ STALE" ANALYSIS badge used a
completely separate flat 30-day-since-`analyzedAt` rule (`isAnalysisStale()`)
with NO earnings awareness at all — so a stock showed STALE a month after
analysis even when no new report had come out.

**New shared helper `src/lib/analysisFreshness.ts`** — single
`getAnalysisFreshness(analysis, nextEarningsDate)` → `{ status, daysUntilEarnings }`
consumed by BOTH the sidebar and the price table, so the two can't drift again.
Statuses: `awaiting` · `reportDue` · `earningsToday` · `earningsSoon` ·
`staleFallback` · `analyzed`. Core rule: **elapsed time alone never makes an
analysis stale** — `reportDue` fires only when Yahoo's earnings date is now in
the past AND newer than the filing we actually analyzed (`analysis.lastEarningsDate`).
When Yahoo has NO earnings date for a ticker, and only then, it falls back to
the existing flat `isAnalysisStale()` / `ANALYSIS_STALE_DAYS` (unchanged in
`src/types/index.ts`). `>7d` out → `analyzed`; `0d` → `earningsToday`
(ambiguous — may not be released yet); `1–7d` → `earningsSoon`. Date-only ISO
strings parse as UTC midnight, matching SidePanel's existing `parseDate()`.

**Fixed the missing write (`src/components/StockDetail.tsx` `handleComplete`):**
the `setAnalysis({...})` object never set `lastEarningsDate`, so right after a
post-earnings re-run the in-memory analysis didn't reflect the just-analyzed
filing until a Supabase round-trip (`useSupabaseSync.rowToAnalysis` maps
`filing_date` → `lastEarningsDate`). Added `lastEarningsDate: meta.filingDate ??
undefined` (EDGAR-fetched filed date, already in hand). Grep-confirmed additive
— `lastEarningsDate` was previously only READ (from Supabase), never written
client-side, so nothing collides. No `api/analyze.ts` schema change (the value
comes from browser-side EDGAR meta, not the LLM).

**Sidebar refactor (`src/components/SidePanel/index.tsx`):** the inline
`needsAttention` computation now calls `getAnalysisFreshness()` and maps status
→ the existing `AttentionTier`. New `earningsToday` copy ("⏱ reports today —
check before re-running") reuses the amber `earningsSoon` tier slot but sorts
ahead of any 1–7d countdown (`sortKey -1`) — makes the same-day ambiguity
explicit instead of implying a re-run is safe. Existing tier priority preserved
(reportDue > earningsToday/earningsSoon > staleFallback). Removed the now-unused
`daysUntil` helper and the `isAnalysisStale` import (moved into the shared helper).

**Dashboard fix (`src/components/PriceTable/index.tsx`):** the "⚠ STALE" badge
boolean changed from `isAnalysisStale(analysis)` to
`freshness.status === 'reportDue' || 'staleFallback'`. STALE now fires only when
a new report has actually come out since the last analysis (or the flat 30-day
fallback when Yahoo has no earnings date) — never from elapsed time alone. The
`AnalysisStatus` component's rendering is untouched; only the boolean feeding it
changed.

**Privacy:** untouched — freshness reads only public earnings dates + analysis
timestamps; no dollars/shares.

**Verification:** `npx tsc --noEmit` and `npm run build` pass. Not locally
browser-verifiable (depends on live Yahoo `nextEarningsDate` + Supabase-synced
`filing_date`). Post-deploy manual checks: (1) a ticker with a past earnings
date + an analysis older than it shows reportDue/STALE in both sidebar and
table; (2) re-running it immediately clears both without a refresh (the
handleComplete write); (3) a ticker with earnings today shows the new "reports
today" wording; (4) an analyzed ticker whose next earnings is >7d out and whose
analysis is >30d old does NOT show STALE (the case that was broken).

**Files created:** src/lib/analysisFreshness.ts
**Files modified:** src/components/StockDetail.tsx ·
  src/components/SidePanel/index.tsx · src/components/PriceTable/index.tsx ·
  CLAUDE.md

---

### August 6, 2026 (patch) — Remove SATS (EchoStar) from the tracked universe

**Why:** per Jared, SATS is being dropped from the dashboard. Removed across all
taxonomy + pipeline files per the universe-change checklist (the reverse of an
add). SATS was a `space`-primary name, so no Sector type / pill change was
needed — the Space pill stays; its membership just shrinks by one.

**Index status (checked, per Jared's question):** SATS was NOT factored into the
stored indexes. The July-30 backfill wrote composite completeness 49/50 with
SATS the sole omission (its Yahoo quote fetch fails — noted in the Aug 4 index
entry), so `index_history` / `index_constituents` never contained it — nothing
to clean up in Supabase. The only place it was still counted was the CLIENT-side
live composite value (`src/lib/indexCalc.ts` derives membership directly from
`TICKERS`); removing it from `tickers.ts` drops it from the live composite +
Space sub-index automatically AND brings the live value into line with the
stored history (previously the live path could include a SATS live price the
history didn't have).

**Files modified:**
  - `src/config/tickers.ts` — removed the SATS TickerConfig entry (drives
    dashboard PriceTable rows + live index membership + the useLivePrice fetch list).
  - `src/config/gics.ts` — removed the UNIVERSE_SECTOR_MAP entry.
  - `src/config/themes.ts` — removed the TICKER_THEME_MAP entry.
  - `src/components/StockDetail.tsx` — removed the CIK_MAP entry, the SPECULATIVE
    set membership, the now-empty `TRAINING_ONLY` set (SATS was its only member),
    and the SATS-specific training-knowledge earningsText branch in
    `fetchEdgarInBrowser`.
  - `api/analyze.ts` — removed the SATS entry from `TICKER_SYSTEM_PROMPTS`.
  - `scripts/newswire.mjs` — removed SATS from `TICKERS` + `COMPANY_ALIASES`.
  - `scripts/indexCalc.mjs` — removed SATS from the `PRIMARY_SECTOR` map (daily
    cron close writer). `src/lib/indexCalc.ts` needs no edit — membership derives
    from tickers.ts.

**Not touched:** no Supabase schema/data change (nothing to migrate or delete —
SATS was never in the index tables; any stale `analyses`/`newswire_items` rows
for SATS simply age out of the recent windows and no longer have a dashboard
row to open). Historical session-log counts (e.g. "space 9") left as-is — they
record what was true then; the Space sub-index is now 8.

**Verification:** `grep` confirms zero remaining SATS / TRAINING_ONLY references
in src/ scripts/ api/. `node --check` passes on both scripts; `npx tsc --noEmit`
and `npm run build` pass.

**Files modified:** src/config/tickers.ts · src/config/gics.ts ·
  src/config/themes.ts · src/components/StockDetail.tsx · api/analyze.ts ·
  scripts/newswire.mjs · scripts/indexCalc.mjs · CLAUDE.md

---

### August 6, 2026 — New Retirement tab (AI contribution-waterfall advisor)

**What:** a fifth top-level tab (News · Dashboard · Portfolio · Net Worth ·
**Retirement**) — an AI-powered retirement-contribution advisor. It takes the
user's salary/plan/contribution inputs and applies a FIXED prioritization
waterfall (1. capture employer match → 2. high-APR debt → 3. remaining
tax-advantaged room → 4. other goals), sequencing contributions against
near-term debt pulled from the existing Net Worth data rather than treating
them independently. Single one-shot AI analysis, same shape as
`networth_analysis`.

**Explicitly OUT OF SCOPE this pass (deliberate follow-ups):** no web-search
grounding for state/municipal plan-rule specifics; no multi-year
trajectory/balance projection modeling. Tool-free single call.

**Reused three existing patterns exactly (did not invent new conventions):**
  - `useFinancialProfile.ts` → `src/hooks/useRetirementProfile.ts` (same
    auth-resolution + `.maybeSingle()` load + 800ms debounced upsert +
    visibilitychange/pagehide flush + anonymous-in-memory shape). Renamed the
    completeness flag `hasProfile` → `hasCoreInputs` (true when BOTH
    annualSalary and primaryContributionPct are set — gates the analysis
    panel). JSON array fields (`otherRetirementAccounts`,
    `otherInvestmentGoals`) upsert as jsonb directly, NOT stringified.
  - `api/portfolio.ts` `networth_analysis` / `buildNetWorthPrompt()` → new
    `api/retirement.ts` with `buildRetirementPrompt()`. Reuses
    `NETWORTH_GROUNDING_RULE` ("never invent a dollar figure, state assumptions
    explicitly") and the account-line formatting verbatim.
  - `NetWorthAuthGate.tsx` → `RetirementAuthGate.tsx` (copied with
    retirement-specific copy — the NetWorth copy reads oddly here) + a
    `src/pages/Retirement.tsx` wrapper mirroring `NetWorth.tsx`'s
    gate/anonymous/authenticated flow (session key `retirement_gate_dismissed`).

**Shared helper extraction (`api/_shared/netWorth.ts`):** rather than
reimplement or duplicate, extracted `NETWORTH_GROUNDING_RULE`, `fmtUsd`,
`buildAccountLines()`, and the `NetWorthAccountPayload` type into a new module
under `api/_shared/` (underscore-prefixed dir → excluded from Vercel's `api/*.ts`
route glob, so it's a plain module, not a function). `api/portfolio.ts` was
refactored to IMPORT these three (behavior-preserving — same strings, same
function body; its `networth_analysis` request type, rate-limit bucket, and
grounding-rule usage are otherwise untouched, per the constraint). `retirement.ts`
imports the same. This is the "extract to a shared helper" path the task asked
for; kept within the api/ boundary (not the api↔src duplication boundary the
codebase avoids).

**Endpoint (`api/retirement.ts`):** OWN rate-limit bucket — fresh `Map`,
15/IP/hr (NOT analyze.ts's 10 or portfolio.ts's 20). Model `claude-sonnet-4-6`,
`max_tokens: 1400`, no `tools` array (tool-free per scope). `vercel.json`'s
existing `api/*.ts` maxDuration:60 covers it — no config change. Validates 400
if `annualSalary` or `primaryContributionPct` is missing (mirrors the
accounts-required check). The employer-match GAP is PRE-COMPUTED server-side
(exact unclaimed-dollars figure) so the model states a real number, not an
estimate. Waterfall step 2 (debt) degrades gracefully when no `netWorthAccounts`
are sent (tier-1-only): still runs match/plan/goals, skips card-specific
language, and Watch Items notes that connecting Net Worth would sharpen it.
457(b) early-withdrawal-flexibility note fires only for a governmental 457(b)
when public-sector/pension is indicated.

**Prompt sections (### headings, no top-level ##):** Contribution Priority
Waterfall (fixed order) · Roth vs. Traditional (salary/state bracket context,
explicit not-tax-advice caveat) · Where the "Other Goals" Money Fits · Watch
Items. Ends with the required "educational information, not personalized
financial or tax advice — consult a financial planner or CPA" line.

**UI (`RetirementTab.tsx`):** input form (employment type / state / salary /
plan type / contribution % / employer-match fields / pension checkbox / birth
year) + two dynamic add/remove list editors for otherRetirementAccounts and
otherInvestmentGoals. "Analyze" pulls current Net Worth accounts
(`useNetWorthSync`, live crypto via `useCryptoPrices`) and `useFinancialProfile`
income/savings automatically when signed in — no re-entry. Result renders
through the shared `<MarkdownCard>` (extracted to `src/components/common/` from
the NetWorthTab local copy — reused, not reimplemented) inside a teal
(`#06b6d4`, GICS health_care accent) left-border card, distinct from Portfolio's
purple/amber and Net Worth's cards. Re-run button once a result exists;
empty-state copy before `hasCoreInputs`. The live-priced equity portfolio
(`holdings_link`) is intentionally excluded from the payload — tangential to the
debt-vs-contribution waterfall and its live value isn't wired into this tab.

**Nav + routing:** `NAV_LINKS` gained `{ to: '/retirement', label: 'Retirement' }`
after Net Worth; `App.tsx` gained the `/retirement` route wrapped in
`ErrorBoundary` (same pattern as /networth, /portfolio).

**Privacy:** this is the SAME deliberate dollar-figure exception as the Net
Worth tab (admin-only, magic-link-gated) — real salary/balances by design. Does
NOT bleed into the Portfolio-tab percentage-only rule; the shared helper carries
a matching privacy note.

**Migration handed off (NOT run by Claude Code):**
`supabase_migration_retirement_profile.sql` — `retirement_profile` table (one
row per user_id, mirrors user_financial_profile's shape + RLS: `for all using
(auth.uid() = user_id)`). All fields nullable/additive, jsonb for the two array
columns. MUST be applied in the Supabase SQL Editor before this ships or
read/write fails on the missing table (`useRetirementProfile` selects '*', so a
missing table surfaces as a load error, never silently swallowed).

**Verification:** `npx tsc --noEmit` (covers src/) and `npm run build` pass. The
api/ files are NOT in the root tsconfig's `include` (src only) — they're
typechecked by Vercel at deploy — so verified separately with a standalone strict
+ noUnusedLocals tsc pass over `api/**/*.ts` (clean, confirming the portfolio.ts
refactor left no dangling locals). NOT browser-verified locally: the tab is
magic-link-gated and `/api/retirement` is a Vercel function not served by plain
`vite dev`. Post-deploy manual checks: (1) salary + contribution % below match
threshold → waterfall step 1 states the exact unclaimed dollar amount; (2) a
high-APR card in Net Worth → step 2 names that card + APR; (3) an
otherInvestmentGoals entry → addressed in its own section vs. remaining
tax-advantaged room; (4) no Net Worth data connected → still completes
gracefully (tier-1-only).

**Files created:** supabase_migration_retirement_profile.sql · api/retirement.ts ·
  api/_shared/netWorth.ts · src/hooks/useRetirementProfile.ts ·
  src/components/retirement/RetirementTab.tsx ·
  src/components/retirement/RetirementAuthGate.tsx ·
  src/components/common/MarkdownCard.tsx · src/pages/Retirement.tsx
**Files modified:** api/portfolio.ts · src/components/Layout/index.tsx ·
  src/App.tsx · CLAUDE.md

---

### August 6, 2026 (hotfix) — Retirement/Net Worth 500s: revert the api/_shared module, inline the helpers

**Symptom:** running Retirement analysis returned the client error `Unexpected
token 'A', "A server e"... is not valid JSON` — the endpoint returned Vercel's
plain-text `A server error has occurred` / `FUNCTION_INVOCATION_FAILED` (HTTP
500), and the client's `res.json()` choked on the non-JSON body. Confirmed by
curling production: BOTH `/api/retirement` AND `/api/portfolio`
(networth_analysis) 500'd — meaning the just-shipped Retirement feature also
REGRESSED the live Net Worth tab's analysis.

**Root cause:** the shared helper module `api/_shared/netWorth.ts`. Vercel does
NOT deploy underscore-prefixed paths under `api/` — but it also does not treat
them as bundleable dependencies of a function, so both functions failed to
resolve the import at init → invocation failure before any handler code ran.
The earlier assumption ("underscore dir = excluded from routing but still
importable") was wrong for this Vercel setup; `npm run build`/`tsc` can't catch
it because api/ isn't in the root tsconfig and Vercel builds api/ only at deploy.

**Fix:** deleted `api/_shared/netWorth.ts`. Reverted `api/portfolio.ts` to its
original self-contained inline form (NETWORTH_GROUNDING_RULE + kindLabel +
accountLines mapping + NetWorthAccountPayload interface — byte-for-byte the
pre-Retirement version). Inlined the same four pieces (NETWORTH_GROUNDING_RULE,
fmtUsd, buildAccountLines, NetWorthAccountPayload) directly into
`api/retirement.ts`. This is the api-file DUPLICATION convention the codebase
already documents (ThemePreferences / SECTOR_ETF_MAP) — the correct pattern for
sharing across Vercel functions here; a shared import module is not. A comment
in retirement.ts records why, to prevent a repeat.

**Lesson for future api/ work:** do NOT factor shared code into an
`api/_shared/` (or any underscore-prefixed) module and import it across
functions — it deploys broken with no local-build signal. Duplicate small
helpers inline instead, and always curl the production endpoint after deploying
a new/changed api/ function rather than trusting tsc/build alone.

**Verification:** `npx tsc --noEmit` + `npm run build` pass; standalone strict
api/ typecheck (noUnusedLocals) passes; grep confirms no remaining `_shared`
import. Post-deploy: re-curl both endpoints to confirm they no longer 500.

**Files modified:** api/portfolio.ts (reverted) · api/retirement.ts (helpers
inlined) · CLAUDE.md
**Files deleted:** api/_shared/netWorth.ts

---

### August 16, 2026 — Generalize NBIS into a reusable Foreign Private Issuer filing framework

**Note:** this entry documents work from commit `c48a728`, whose CLAUDE.md
update was accidentally dropped by an unrelated same-day documentation rewrite
(see the header note near the top of this file) before being committed —
restored here from git history because the code it describes is real, live,
and directly relevant to the CCJ entry immediately below.

**Context:** a prior session added an `api/analyze.ts` `TICKER_SYSTEM_PROMPTS`
entry for NBIS (Nebius Group N.V.) noting it "files 6-K forms on EDGAR rather
than 8-K earnings releases, so no automated filing fetch is available" — i.e. a
documented gap, not a shipped fetch fix. Grep + git-log confirmed no
NBIS-specific fetch logic ever existed in `StockDetail.tsx` — NBIS just fell
through the standard domestic 8-K item 2.02 path, which finds nothing for it
(live-verified: NBIS's EDGAR history is 241 6-Ks + 16 20-Fs, zero 8-Ks). This
session builds the actual fetch path, generalized from the start rather than as
an NBIS-only patch, since CCJ (Cameco) is a second real 6-K filer already
present in `TICKER_SYSTEM_PROMPTS` and more will likely follow.

**New parallel classification axis — `FILING_REGIME` / `FPI_CONFIG`.** Explicitly
NOT a replacement for `SPECULATIVE`/`SEDAR_ONLY` — those control how many
filings to fetch; regime controls which SEC form to look for. A ticker can be
both (structurally unblocked, not implemented as a combination yet).
  ```
  type FilingRegime = 'domestic' | 'foreign_private_issuer' | 'sedar_only';
  interface FPIConfig { annualForm: '20-F' | '40-F'; exhibitHints: string[]; }
  ```
  `filingRegimeFor(ticker)` defers to the existing `SEDAR_ONLY` set first so the
  two axes can't disagree about NXE. Only NBIS was populated in `FILING_REGIME`/
  `FPI_CONFIG` this session — CCJ was deliberately left out (see below; enabled
  the same day in the follow-up entry directly below this one).

**Shared fetch path (`fetchForeignIssuerFiling`), branched once in
`fetchEdgarInBrowser`** before the domestic 8-K lookup:
  `if (filingRegimeFor(ticker) === 'foreign_private_issuer') return
  fetchForeignIssuerFiling(ticker, cik, FPI_CONFIG[ticker]);`
  No per-ticker logic inside it — adding a new FPI is one `FILING_REGIME` line +
  one `FPI_CONFIG` line.

**Bug found and fixed during verification, not assumed:** the naive "take the
most recent 6-K" plan is unreliable in practice. Live-traced CCJ (used only as
a design proof this session — not activated yet): its most recent 6-K
(2026-07-31) was a Westinghouse registration-statement press release, not
earnings; the actual quarterly-results 6-K was filed the same day, one entry
back. NBIS happened to work with "most recent" that day (its latest 6-K was the
earnings release), but nothing in EDGAR guarantees that going forward — 6-Ks
carry no `items` code distinguishing earnings from routine press releases (8-Ks
have `2.02`; 6-Ks have nothing). Fix: `fetchForeignIssuerFiling` pulls the
`SIX_K_SCAN_LIMIT = 5` most recent 6-Ks via a new `findFilings()` (plural,
`findFiling` now delegates to it with limit 1) and tests each candidate's
resolved exhibit text with `looksLikeEarningsFiling()` (regex for "results of
operations" / "three months ended" / "reports Q_ results" / etc.), returning the
first match. Falls back to the literal most-recent 6-K (with a console warning)
if none of the scanned candidates look like earnings, then to the annual
form (20-F/40-F) only if the filer has no 6-K on record at all. Live-verified
against both NBIS (matches on the first candidate, zero extra fetches — same
outcome as the naive version) and CCJ (correctly skips the Westinghouse 6-K,
selects the earnings one on the second candidate).

**Exhibit resolution (`resolveForeignExhibitUrl` + `parseIndexEntries`):**
separate from the existing domestic `resolveExhibitUrl` (left untouched) because
FPI exhibit filenames are inconsistent in ways the domestic regex didn't cover —
live-checked NBIS's own filing uses `ex99d1` (not `ex99-1`/`ex-99.1`), which a
literal hint list on filename alone would have missed. `parseIndexEntries()`
parses the SEC index table's Description + Type columns (both carry a clean
"EX-99.1" label regardless of filename mangling) in addition to the filename, so
`exhibitHints` matches against `"${description} ${filename}"` — hint-match
succeeds even when the filename doesn't contain the hint text. `FPI_EXHIBIT_HINTS`
covers the filename variants seen across NBIS/CCJ: `ex-99.1`, `ex99.1`, `ex99-1`,
`ex99d1`, `ex991`. Falls back to the first non-cover exhibit (index entry 1)
with a logged warning if no hint matches, same graceful-degradation shape as the
domestic path.

**Proxy generalized (`api/edgar-proxy.ts`):** was `/Archives/` only; NBIS/future
FPI fetches need `data.sec.gov/submissions/` too (previously called directly,
unproxied, from the browser — bypassing the declared SEC User-Agent). Added
`ALLOWED_PATH_PREFIXES = ['/Archives/', '/submissions/']` and a shorter edge
cache for submissions (`s-maxage=300` vs. Archives' unchanged `3600`) since a
filing index can change same-day and a stale cache would hide a just-filed 6-K
right after it posts. `secFetch()` in StockDetail.tsx now routes every SEC
request (`data.sec.gov` included) through the proxy — previously
`data.sec.gov` calls went direct.

**UI (Meta row):** the filing-type badge now reads `filingFormLabel(ticker)`,
derived from `FILING_REGIME` — renders "6-K" for any `foreign_private_issuer`
ticker generically (not NBIS-specific), "8-K + 10-Q" for SPECULATIVE names,
"8-K" for standard domestic, nothing for SEDAR_ONLY.

**Untouched, per scope:** `SPECULATIVE`/`SEDAR_ONLY` sets and their fetch logic,
and every `CIK_MAP` entry other than the one already-present NBIS row (unchanged
value, just now consumed by the FPI path instead of the dead domestic path).

**Verification:** `npx tsc --noEmit` and `npm run build` pass. Standalone strict
+ noUnusedLocals tsc pass on `api/edgar-proxy.ts` clean. NBIS traced end-to-end
against live SEC data through the actual new code path (not just compiled):
resolves accession `0001104659-26-094844` (filed 2026-08-12), exhibit
`nbis-20260812xex99d1.htm` via the EX-99.1 hint match, 39,324 chars of real Q2
MD&A text, correctly identified as earnings-shaped on the first scanned
candidate.

**Files modified:** src/components/StockDetail.tsx · api/edgar-proxy.ts ·
  CLAUDE.md

---

### August 16, 2026 (patch) — Enable CCJ in the FPI framework, fix stale training-knowledge-only system prompt

**Live bug reported:** running "Run Analysis" on CCJ (Cameco) on production
threw `No earnings 8-K (item 2.02) found for CCJ`. Root cause confirmed against
live SEC EDGAR (CIK `0001009001`, verified correct): Cameco is a Canadian
foreign private issuer — it has never filed an 8-K, only 6-K (quarterly/interim
results) and 40-F (annual). The prior session's FPI framework (entry directly
above) had already built and live-verified the exact fetch path CCJ needs —
CCJ was used as that session's own test case for the "6-K scan" bug fix — but
left CCJ unpopulated in `FILING_REGIME`/`FPI_CONFIG` deliberately, deferring
enablement as a separate decision because `api/analyze.ts` still carried a CCJ
system prompt that explicitly says "no automated filing fetch is available,
you are working from training knowledge" — flipping on live fetch without
addressing that sentence would have shipped a prompt actively contradicting the
real filing text now being passed to the model.

**Change 1 — `src/components/StockDetail.tsx`:** added `CCJ:
'foreign_private_issuer'` to `FILING_REGIME` and `CCJ: { annualForm: '40-F',
exhibitHints: FPI_EXHIBIT_HINTS }` to `FPI_CONFIG` — the exact one-line-each
follow-up the prior entry called out. Removed the now-obsolete comment
explaining why CCJ was excluded. `CIK_MAP`'s existing CCJ entry
(`0001009001`) was verified correct directly against SEC EDGAR and left
unchanged. No other set (`SPECULATIVE`, `SEDAR_ONLY`) touched.

**Change 2 — `api/analyze.ts` `TICKER_SYSTEM_PROMPTS.CCJ`:** removed "It...
files 6-K forms on EDGAR rather than 8-K earnings releases, so no automated
filing fetch is available. You are working from training knowledge." (now
false) and the closing "Be explicit about data limitations where your training
knowledge may be incomplete or outdated" (now backwards — the filing text is
the primary source, training knowledge is the fallback for context gaps).
Replaced with a short pointer that the EARNINGS FILING text below is the real
6-K press-release exhibit and should ground the analysis the same way an 8-K
exhibit does for a domestic filer. All the CCJ-specific coverage guidance
(production volumes, contracting book, Westinghouse stake, uranium macro
outlook) was left untouched — that framing is correct regardless of source.
NBIS's `TICKER_SYSTEM_PROMPTS` entry has the identical stale "no automated
fetch" sentence (also now false, since the entry above already enabled NBIS's
live fetch) but was left untouched — out of scope for a CCJ-scoped fix; flagged
as a follow-up.

**Re-verified live against SEC EDGAR before assuming the fix works** (per the
"never re-diagnose from theory" rule): curled `data.sec.gov/submissions/
CIK0001009001.json` directly — confirms CIK belongs to CAMECO CORP, and that
the two most-recent 6-Ks (both filed 2026-07-31) are exactly the interleaved
case the prior session's scan logic was built for: the more-recent one
(`0001193125-26-327250`) is "Cameco Announces Westinghouse's Confidential
Submission of Draft Registration Statement..." (not earnings), the one filed
just before it (`0001193125-26-326768`) is "Cameco reports second quarter
results..." (the actual earnings release, EX-99.1 through EX-99.4). Confirmed
`looksLikeEarningsFiling()`'s `reports?\s+(first|second|third|fourth)\s+quarter`
pattern matches the second one's headline, so the existing scan-and-skip logic
correctly selects it over the newer Westinghouse filing.

**Meta-row filing-type label:** no code change needed — `filingFormLabel()`
already derives "6-K" generically from `FILING_REGIME` for any
`foreign_private_issuer` ticker (built in the prior session), so CCJ picks up
the correct badge automatically once added to the map.

**Also found and flagged (not fixed here — separate from this task):** the
current on-disk CLAUDE.md had an uncommitted rewrite in progress (see the
header note near the top of this file) that was generated from a source
snapshot predating commit `c48a728`, and had silently dropped that commit's
entire "Generalize NBIS..." session log entry, its "Foreign Private Issuer
filing framework" doc section, and its `Speculative Names`/universe-checklist
updates. Restored all of it (entry directly above, plus the corresponding doc
sections earlier in this file) as part of this session rather than losing real,
verified history to an unrelated in-progress rewrite.

**Verification:** `npx tsc --noEmit` and `npm run build` pass. Standalone
strict + noUnusedLocals tsc pass over `api/analyze.ts` (and the other `api/*.ts`
files) clean. Live-verified against current SEC EDGAR data as described above.
Not browser-verified locally — Run Analysis is admin-gated and `/api/analyze`
+ `/api/edgar-proxy` are Vercel functions not served by plain `vite dev`.
Post-deploy: open CCJ, Run Analysis, confirm it completes (no error), the Meta
row shows a "6-K" badge, and Filed date is 2026-07-31 pointing at the earnings
6-K's exhibit — not the Westinghouse one.

**Files modified:** src/components/StockDetail.tsx · api/analyze.ts · CLAUDE.md

---

### August 16, 2026 (patch 2) — Replace sidebar "Needs Attention" with a date-driven "Upcoming Earnings" section

**Why:** per Jared, the sidebar's staleness-driven "Needs Attention" section
(reportDue / earningsToday / earningsSoon / staleFallback tiers via
`getAnalysisFreshness()`) is replaced with a simpler "Upcoming Earnings"
section — the next 5 tracked-universe tickers with a known upcoming earnings
date, soonest first. No staleness/re-run signal in the sidebar anymore; that
job stays solely on the Dashboard price table's STALE badge
(`PriceTable/index.tsx`), which is untouched by this change.

**`src/components/SidePanel/index.tsx` rewritten:** removed
`AttentionTier`/`AttentionItem`/`TIER_COLORS`/the `needsAttention` useMemo/the
`getAnalysisFreshness` import/the now-unused `daysSince()` helper. Added a
purely date-driven `upcomingEarnings` useMemo: iterates `TICKERS`, reads
`prices[ticker].nextEarningsDate` (already in the store via `useLivePrice` /
`api/prices.ts` — no new fetch), skips tickers with no date or a date already
in the past, sorts ascending by days-until, takes the top 5.

**Day-count math (`daysUntilFromToday()`):** date-only ISO strings parse as a
UTC-midnight instant (`new Date('2026-08-20')` → midnight UTC). Reconstructing
the target's calendar date from its UTC components (not local components) and
diffing against today's local calendar date avoids the off-by-one that a naive
local-timezone read of the parsed UTC instant would produce for readers west
of UTC (e.g. US timezones) — the existing `fmtEarningsDate()` display helper
in this file was already subject to that same class of edge case and was left
as-is (display only, not used for the day-count comparison).

**Section renamed "UPCOMING EARNINGS"; row layout unchanged in shape** (sector
dot + ticker, secondary line, right-aligned badge) but now shows the formatted
earnings date as the secondary line and a new `earningsBadgeText()`/
`earningsBadgeColor()` badge: today = red (`#ff4b6e`), 1–7 days = amber
(`#ffd166`), >7 days = neutral/muted text — text "⏱ today" / "⏱ tomorrow" /
"⏱ in Xd". Empty state: "No known upcoming dates". The page-level empty-state
condition at the bottom of the file now checks `upcomingEarnings.length === 0`
in place of the old `needsAttention.length === 0`.

**Not touched:** `src/lib/analysisFreshness.ts` (still the single source of
truth for the Dashboard STALE badge — see the "Analysis Freshness" section
above, updated to reflect it's now consumed only by `PriceTable/index.tsx`),
`PriceTable/index.tsx` itself, and the "Recently Analyzed" / "Today's Wire"
sidebar sections (both left as-is).

**Verification:** `npx tsc --noEmit` and `npm run build` both pass.

**Files modified:** src/components/SidePanel/index.tsx · CLAUDE.md