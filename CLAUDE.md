# InvestAI — CLAUDE.md

## What This Project Is
A 31-stock investment analysis dashboard tracking four sectors: space economy,
AI infrastructure, defense, and clean energy/nuclear. Built in React + Vite +
Tailwind, deployed on Vercel. Personal research tool, eventually semi-public.

## Site Name
InvestAI — displayed in the header as INVEST (cyan #00c8ff) + AI (white #e2e4ef)
in Space Mono font.

## Current Build Stage
Stage 1: React app with on-demand Claude analysis, live prices from Yahoo
Finance, localStorage caching for stock analyses, sessionStorage for portfolio.
No backend, no auth, no scheduled automation.

Stage 2 (not started): Python backend, SEC EDGAR monitoring, scheduled
analysis pipeline, Supabase persistence.

## Stack — Do Not Deviate Without Discussion
- React + Vite + TypeScript
- Tailwind CSS
- Zustand for global state
- React Router v6
- Vercel serverless functions in /api/ for all external API calls
- localStorage for stock analysis cache (Stage 1)
- sessionStorage for portfolio data (privacy — clears on browser close)
- No auth in Stage 1
- react-markdown + remark-gfm for rendering all AI output cards

## Production URL
https://stock-tracker-five-tau.vercel.app

---

## App Layout — Two Pages

### Page 1: Dashboard (/)
Two zones:
1. Price Table: all 31 stocks, sortable, scannable. Default sort: 1D% change
   descending. Sector filter pills in sub-header (ALL / SPACE / AI INFRA /
   DEFENSE / CLEAN ENERGY). Pills only render on the Dashboard route — they
   disappear when on the Portfolio page.
2. Sidebar (right): "What's New" — recently analyzed with snippet, awaiting
   ticker grid, stale warnings, upcoming earnings.

StockDetail deep dive opens on row click → /stock/:ticker.

### Page 2: Portfolio (/portfolio)
Standalone page. Navigation: Dashboard ↔ Portfolio links in top nav.
The Compare page and ResearchCompare/StockPicker sub-components have been
deleted. Do not reference or rebuild them.

---

## Navigation / Layout

Top nav lives in src/components/Layout/index.tsx.
Links: Dashboard (/) · Portfolio (/portfolio)
Sector filter bar is gated with `{isDashboard && ...}` using useLocation().
Brand: INVEST (cyan) + AI (white) in Space Mono.

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
  "analyzed"  — analyzedAt within 30 days
  "stale"     — analyzedAt more than 30 days ago

segments array is nullable. When null, UI skips segment chart entirely.

businessModel has its own lastUpdated timestamp separate from analyzedAt.

---

## API Architecture — Do Not Change

Yahoo Finance → /api/prices.ts (Vercel serverless)
  Never call yahoo-finance2 from the browser.
  Cache 5 minutes. On error: fetchError: true, UI shows last cached values.
  Returns: price, change, changePercent, weekChangePercent, marketCap,
           volume, regularMarketOpen, fiftyTwoWeekHigh, fiftyTwoWeekLow,
           analystTargetPrice, recommendationMean
  Works for ANY ticker symbol — used by Portfolio for external positions too.

Anthropic API → /api/analyze.ts (stock analysis, streaming SSE)
  Rate limit: 10 calls per IP per hour.
  Model: claude-sonnet-4-6
  max_tokens: 2000 (Call 1 JSON) · 2500 (Call 2 narrative)
  vercel.json maxDuration: 60s — do not remove.
  Two-call pattern:
    Call 1 — JSON extraction (financials, guidance, segments, conviction, snapshot)
    Call 2 — narrative (What Happened, Bull Case, Bear Case, Key Catalysts)

Anthropic API → /api/portfolio.ts (portfolio features, non-streaming)
  Rate limit: 20 calls per IP per hour (separate bucket from analyze.ts).
  Model: claude-sonnet-4-6
  Request types: "macro_risk" | "macro_scenario" | "trim" | "sector_explore"
  max_tokens: 1200 (macro_risk) · 1000 (macro_scenario) · 800 (trim) · 600 (sector_explore)
  No vercel.json maxDuration needed — all calls complete in <10s.

SEC EDGAR → fetched browser-side in StockDetail.tsx
  CORS proxy at /api/edgar-proxy.ts for /Archives/ URLs.
  Normal: EX-99.1 from most recent 8-K item 2.02
  Speculative (OKLO, NNE): dual 8-K + 10-Q MD&A
  SEDAR-only (NXE): training knowledge fallback

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
  11. Re-run button (only when cached analysis exists)
  12. Re-run confirmation modal

## Narrative Structure — 4 Sections, This Order
  ## What Happened → ## Bull Case → ## Bear Case → ## Key Catalysts

Key Catalysts last — least damaging if token budget runs short.
Management tone woven into What Happened and Bull/Bear.
Risks folded into Bear Case.
Key Catalysts: 3-4 filing-grounded milestones only. No invented events.
Target: under 700 words total.

---

## Design System
Background:   #08090d     Surface:    #0f1117
Surface 2:    #161922     Border:     #1e2230
Text:         #e2e6f0     Muted text: #8b93a8
Green:        #00e676     Red:        #ff4b6e     Yellow: #ffd166

Fonts: Space Mono → labels, tickers, data, badges
       DM Sans    → body text, descriptions, narrative prose
Dark theme only. No light mode.

## Dashboard Sector Colors — Single Source of Truth
Defined in src/types/index.ts as SECTOR_COLORS. Used everywhere: filter pills,
sector dots, ticker name text, left accent bars, SidePanel ticker labels.
Do NOT use per-ticker color overrides — all color derives from primary sector.

  space:             #00c8ff   cyan
  ai_infrastructure: #a259ff   violet
  defense:           #f97316   orange
  clean_energy:      #00e676   green
  lng_export:        #fbbf24   amber (reserved, not displayed)

The `color` field on TickerConfig is deprecated and unused. Do not add new
per-ticker color overrides. accentColor in PriceTable is always derived from
SECTOR_COLORS[ticker.sectors[0]].

## Row Status Visual Rules
Awaiting:  dimmed row, "AWAITING" label, no sector dot
Analyzed:  normal row, colored sector dot, ✓ ANALYZED label
Stale:     subtle amber outline on row, "⚠ STALE" label

Second dot after sector label = crossover sector membership (intentional).
Example: RKLB shows "• SPACE •" — primary space, crossover defense.

Rating column shows Yahoo Finance recommendationMean as badge (STRONG BUY /
BUY / HOLD / SELL / STRONG SELL). Shows "—" when Yahoo has no analyst
coverage for that ticker (e.g. KTOS, AVAV) — this is correct, not a bug.

guidanceDirection badge colors:
  raised → green    maintained → gray    lowered → red    initiated → blue

## Speculative Names — Handle Differently in Analysis Prompts
OKLO, NNE  — pre-revenue. Focus on milestones, partnerships, burn rate, TAM.
NXE        — pre-production uranium. Same treatment as above.
CIFR, RIOT — Bitcoin miners, AI pivot less advanced than IREN. Be explicit.
SATS       — satellite broadband restructuring story, not pure space infra.

---

## Markdown Rendering — AI Output Cards

All AI-generated text in the Portfolio page is rendered via a shared
<MarkdownCard> component using ReactMarkdown + remark-gfm. Do not render
AI output as plain text strings anywhere.

MarkdownCard component lives in src/components/compare/PortfolioTab.tsx.
It overrides: h2 (suppressed), h3 (uppercase mono label), p, strong, ul, li,
table/thead/tbody/tr/th/td, hr, code.

Card color coding:
  Macro Risk card     — red left border (#ff4b6e), red tint background
  Trim Suggestion     — amber left border (#ffd166), amber tint background
  Scenario Analysis   — purple left border (#a259ff), purple tint background

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
ANTHROPIC_API_KEY   → Vercel dashboard → Settings → Environment Variables
(Yahoo Finance requires no key — uses yahoo-finance2 npm package)

---

## Key File Locations
src/types/index.ts                             canonical data schema + SECTOR_COLORS
src/config/tickers.ts                          31-stock universe, sector assignments
src/config/gics.ts                             GICS two-tier taxonomy + classifyTicker()
src/store/useStore.ts                          Zustand store, all global state
src/App.tsx                                    router — routes: / · /stock/:ticker · /portfolio
src/components/Layout/index.tsx                top nav, brand, sector filter bar (dashboard-only)
src/pages/Dashboard.tsx                        dashboard page
src/pages/Portfolio.tsx                        portfolio page (thin wrapper over PortfolioTab)
src/pages/StockDetail.tsx                      re-export only — logic in components/StockDetail
src/components/StockDetail.tsx                 stock deep dive — canonical component
src/components/ConvictionBadge.tsx             conviction rating badge
src/hooks/useAnalysis.ts                       SSE stream parsing, localStorage cache
src/components/SidePanel/index.tsx             What's New sidebar — uses extractSnippet()
src/components/PriceTable/index.tsx            dashboard watchlist table
src/components/compare/PortfolioTab.tsx        main portfolio component (default export)
src/components/compare/SectorTargetsPanel.tsx  sector target weights slide-in panel
api/prices.ts                                  Yahoo Finance proxy
api/analyze.ts                                 Anthropic streaming proxy, stock analysis
api/edgar-proxy.ts                             CORS proxy for SEC /Archives/ URLs
api/portfolio.ts                               portfolio API — macro_risk · macro_scenario · trim · sector_explore

Deleted — do not recreate:
  src/pages/Compare.tsx
  src/components/compare/ResearchCompare.tsx
  src/components/compare/StockPicker.tsx

---

## Portfolio Page — Full Spec

### Purpose
Four connected workflows on one page:
  1. Portfolio view — positions, live values, unrealized gains, sector
     concentration chart with target dual-bars, macro risk narrative.
  2. Add simulation — candidate ticker, target allocation %, target-aware
     sector impact table, trim suggestion.
  3. Sector explore — Claude suggests 3-4 stocks for any underweight sector,
     each with a "Simulate →" button that pre-fills the Add Simulation panel.
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

Tickers outside the 31-stock universe get an "EXT" badge.

### Privacy Rules — Hard (do not relax)
Never send dollar amounts, share counts, or cost basis to the API.
Send only: ticker, sector, subSector, weightPct, gainPct, inUniverse.

### Account Type
Stored in sessionStorage. Passed as accountType + accountContext to all calls.
buildAccountBlock() injects account-specific hard rules into every prompt.
  roth_ira / 401k_roth        → whole share counts only, no tax language
  traditional_ira / sep_ira   → whole shares, ordinary income note, RMD context
  taxable                     → short vs long-term gain callouts, TLH where applicable
  hsa                         → whole shares preferred, limited TLH benefit

### Portfolio Page Layout

Account type bar (above everything):
  - Colored account type button → opens AccountTypePanel slide-in
  - Constraint pills from ACCOUNT_TYPES config

Left column:
  1. Positions table — TICKER · SECTOR · PRICE · COST BASIS · GAIN/LOSS · ALLOCATION · ×
  2. Sector concentration chart
     - ▶/▼ expand for sub-sectors
     - Dual bars when targets set (solid actual, outline target)
     - Delta label: red = overweight, green = underweight
     - "↗ explore" button on each underweight row (≥2pp under target)
     - "↗ Explore gaps" button in chart header when any sector is underweight
     - "Set targets / Edit targets" button → SectorTargetsPanel
  3. Macro risk — red left-border card, MarkdownCard rendering, account type badge,
     re-run button, "⟳ Run scenario analysis" button (purple, appears after macro runs)

Right column (320px):
  1. Add simulation panel
     - Ticker input, debounced price fetch (600ms)
     - Target allocation slider: 1–30%
     - Sector impact table: before% → after% + target delta badge + direction arrow
       · Green ✓ badge = within 1pp of target
       · Amber badge = moving toward but still off
       · Red +Xpp badge = worsening overweight
  2. Trim suggestion — amber left-border card, MarkdownCard rendering,
     account type badge, re-run button

### SectorTargetsPanel
Width: 460px. Grid: 24px 1fr 60px 80px 64px.
% symbol is a sibling span outside the input (not inside) — prevents clipping.
Number spinners hidden. Must sum to exactly 100% to enable Save.
Columns: ▶/▼ · SECTOR · ACTUAL · TARGET · DELTA
Sub-sectors: collapsible, show actual only, no target input.

### Sector Explore Panel
Slide-in from right (same style as AccountTypePanel and SectorTargetsPanel).
Shows the underweight gap (e.g. "You're 8pp underweight vs 15% target").
Claude returns a JSON array of { ticker, rationale, marketCapRange }.
Each card has a "Simulate →" button that closes the panel and pre-fills
the Add Simulation ticker input.
API call type: "sector_explore" in api/portfolio.ts.
Claude is instructed to skip tickers already held, growth-style framing,
target gap context when available.

### Scenario Analysis Panel
Width: 500px. Slide-in from right, opened via "⟳ Run scenario analysis" button
that appears below the Macro Risk card after macro risk has been run.

Layout:
  - Header: title + description
  - Sector weight editor grid: Sector · Actual · Current target · Proposed
    · Proposed column: number inputs, purple-tinted when filled, pre-filled
      from current targets (or rounded actuals if no targets set)
    · Delta pp shown inline next to sector name (green = increase, red = decrease)
  - Running total row: turns green ✓ at 100%, yellow within 5pp, red otherwise
  - Warning text if total ≠ 100%
  - "✦ Analyze proposed weightings" button — purple, disabled until total = 100%
  - Result: purple left-border MarkdownCard with 4 sections

initProjectedTargets() pre-fills proposed weights from sectorTargets (or
rounded actuals for sectors without a current target).

---

## api/portfolio.ts — Request Types

POST body shape:
{
  type: "macro_risk" | "macro_scenario" | "trim" | "sector_explore"
  positions: PositionPayload[]
  accountType?: string
  accountContext?: string
  sectorTargets?: Record<string, number | null>
  sectorActuals?: Record<string, number>
  subSectorActuals?: Record<string, number>
  projectedTargets?: Record<string, number | null>  // macro_scenario only
  candidate?: CandidatePayload                       // trim only
  exploreSector?: string                             // sector_explore only
}

macro_risk prompt structure (### sections, no top-level ##):
  ### Concentration Risks
  ### Macro Sensitivities
  ### Tail Risks
  ### Rebalancing Priority
  ### Sector Opportunity Watchlist
    — suggests 2-3 tickers for any sector ≥3pp underweight
    — format: **TICKER** — rationale · Risk: Low/Medium/High

macro_scenario prompt structure (### sections, no top-level ##):
  ### What Changes
  ### Macro Fit
  ### Execution Path
  ### Risks of This Shift

trim prompt structure (### sections, no top-level ##):
  ### Trim Plan to Fund {ticker} ({pct}%)
  ### Post-Rebalance Sector Weights  (markdown table)

sector_explore response is validated as JSON before returning to client.
Returns { error } if Claude output is not parseable.

---

## GICS Sector Taxonomy (Portfolio Use Only)

Defined in src/config/gics.ts. SEPARATE from dashboard filter pill sectors.
Do NOT conflate them.

classifyTicker(ticker): priority → UNIVERSE_SECTOR_MAP → KNOWN_TICKERS → 'other'

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

### 31-Stock Universe → GICS Mapping
RKLB → industrials / space_launch
FLY  → industrials / space_launch
RDW  → industrials / space_systems
LUNR → industrials / space_systems
KTOS → industrials / aerospace_defense
LHX  → industrials / aerospace_defense
AVAV → industrials / aerospace_defense
ASTS → communication_services / satellite_comms
SATS → communication_services / satellite_comms
PL   → communication_services / earth_observation
BKSY → communication_services / earth_observation
NVDA → information_technology / semiconductors
PLTR → information_technology / it_services
CRWV → information_technology / internet_infrastructure
IREN → information_technology / internet_infrastructure
NBIS → information_technology / internet_infrastructure
CIFR → information_technology / internet_infrastructure
RIOT → information_technology / internet_infrastructure
VRT  → information_technology / electronic_equipment
MOD  → information_technology / electronic_equipment
CEG  → energy / nuclear_power
VST  → energy / nuclear_power
BWXT → energy / nuclear_components
GEV  → energy / power_equipment
BE   → energy / fuel_cells
CCJ  → energy / uranium_mining
LEU  → energy / uranium_mining
NXE  → energy / uranium_mining
OKLO → energy / advanced_reactors
NNE  → energy / advanced_reactors

---

## Known Issues (as of June 3, 2026)

- Stocks analyzed in old 5-section format (IREN, MOD) lack snapshot block.
  Re-run to upgrade to current 4-section + snapshot format.

- Toast notifications not built — no success/error feedback on analysis completion.

- FLY (Firefly Aerospace) — IPO'd Aug 8 2025, CIK 0001860160. Verify EDGAR
  pipeline pulls filings correctly when analyzed.

---

## Next Session Priorities (in order)

1. Stage 1.5 evaluation — Supabase auth + storage to enable sharing with
   trusted users without full Stage 2 backend

---

## Session Log

### June 3, 2026 — Color System Unification + Sidebar Snippet Fix

**Problem solved (1): Sidebar snippets showed raw markdown headings**
  Every "Recently Analyzed" entry in the SidePanel displayed
  "## What Happened Vertiv…" instead of the first prose sentence.
  Root cause: a.summary stores the entire narrative string starting with
  the ## What Happened heading. The old code did a.summary.slice(0, 80)
  which grabbed that heading text verbatim.

**src/components/SidePanel/index.tsx** — updated
  - Added extractSnippet() helper function:
    · Splits narrative on newlines, filters all lines starting with #
    · Collapses blank lines, takes first non-empty paragraph
    · Strips **bold** markers for clean plain-text display
    · Truncates to 90 chars with ellipsis
  - Added SECTOR_COLORS import from types
  - Replaced a.summary.slice(0, 80) with extractSnippet(a.summary)
  - Replaced t.color ?? '#e2e4ef' with SECTOR_COLORS[t.sectors[0]] in
    both "Recently Analyzed" and "Upcoming Earnings" ticker labels

**Problem solved (2): Ticker name/accent colors did not match sector colors**
  PL (Space) was showing violet (#a259ff — AI color), RDW (Space+Defense)
  was showing orange (#ff6b35) — these were hardcoded per-ticker overrides
  that conflicted with the sector color system.

**src/config/tickers.ts** — updated
  - Removed all hardcoded color overrides (RKLB #00c8ff, PL #a259ff,
    RDW #ff6b35 — the only 3 tickers that had them)
  - The color field on TickerConfig is now effectively unused/deprecated
  - All color now derives from SECTOR_COLORS[sectors[0]] at render time

**src/components/PriceTable/index.tsx** — updated
  - accentColor now derived from SECTOR_COLORS[ticker.sectors[0]] instead
    of cfg.color ?? '#8b8fa8'
  - Removed unused cfg variable (was only used for the color lookup)
  - Removed unused TICKER_MAP import (was only imported for cfg)
  - Result: every ticker's left accent bar and name text now uses its
    primary sector color consistently across the entire dashboard

**Color system rule established:**
  SECTOR_COLORS in src/types/index.ts is the single source of truth for
  all dashboard coloring. Per-ticker color overrides are banned. Any new
  ticker added to tickers.ts must NOT include a color field — sector
  assignment drives color automatically.

### June 3, 2026 — Portfolio AI Output Formatting + Scenario Analysis

**Problem solved:** AI output in Macro Risk and Trim Suggestion cards was
rendering as raw markdown text (literal **, ##, --- visible to user).

**src/components/compare/PortfolioTab.tsx** — updated
  - Added ReactMarkdown + remark-gfm imports
  - New shared <MarkdownCard> component with full dark-theme styled overrides
  - Macro Risk and Trim Suggestion cards now render via <MarkdownCard>
  - Scenario Analysis feature added (ScenarioPanel slide-in, 500px wide)
  - New state: scenarioOpen, projectedTargets, scenarioResult,
    scenarioLoading, scenarioError
  - New functions: initProjectedTargets(), projectedTotal(),
    runScenarioAnalysis()

**api/portfolio.ts** — updated
  - Added "macro_scenario" request type + projectedTargets field
  - buildMacroScenarioPrompt(): 4-section structured prompt
  - buildMacroRiskPrompt() rewritten to use 5 ### sections
  - buildTrimPrompt() rewritten to use ### sections
  - max_tokens raised to 1200 for macro_risk

**package.json** — updated
  - Added remark-gfm: ^4.0.1

### June 2, 2026 — Navigation, Portfolio Integration, Sector Explore

**Site renamed:** Space Tracker → InvestAI

**Compare page removed:**
  - Deleted: src/pages/Compare.tsx
  - Deleted: src/components/compare/ResearchCompare.tsx
  - Deleted: src/components/compare/StockPicker.tsx
  - Portfolio promoted to first-class route at /portfolio

**src/App.tsx** — removed Compare, added Portfolio route

**src/components/Layout/index.tsx** — updated brand + nav links + sector
  filter bar gating with useLocation()

**src/components/compare/SectorTargetsPanel.tsx** — panel width 460px,
  grid columns updated, % symbol moved outside input

**src/components/compare/PortfolioTab.tsx** — target-aware sector impact
  table, Sector Explore feature added (SectorExplorePanel slide-in)

**api/portfolio.ts** — added sector_explore request type, JSON validation

### June 2, 2026 — GICS Taxonomy + Portfolio Enhancements (earlier session)

**src/config/gics.ts** — new file, full GICS two-tier taxonomy
**src/components/compare/SectorTargetsPanel.tsx** — initial build
**src/components/compare/PortfolioTab.tsx** — initial build with
  sessionStorage cache, account type selector, sector concentration chart
**api/portfolio.ts** — initial build, macro_risk and trim request types

### May 28, 2026 — StockDetail Rewrite + Full Pipeline

- New StockDetail layout: Yahoo stats strip, snapshot block, 4-section narrative
- Re-run confirmation modal
- EDGAR pipeline: fetch → JSON extraction → narrative stream → UI
- localStorage cache for analyses
- api/edgar.ts, api/edgar-proxy.ts, api/analyze.ts, api/prices.ts
- Confirmed working: NXE, KTOS, RDW, PL, AVAV
- Old format (needs re-run): IREN, MOD