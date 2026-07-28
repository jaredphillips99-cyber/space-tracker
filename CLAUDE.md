# InvestAI — CLAUDE.md

## What This Project Is
A curated-universe investment analysis dashboard tracking five sectors: space
economy, AI infrastructure, defense, clean energy/nuclear, and cyber. Built in
React + Vite + Tailwind, deployed on Vercel. Personal research tool, eventually
semi-public. (Ticker count is intentionally not treated as a fixed number in
prose — the universe grows; say "tracked universe," not a hard-coded count.)

## Site Name
InvestAI — displayed in the header as INVEST (cyan #00c8ff) + AI (white #e2e4ef)
in Space Mono font.

## Current Build Stage
Stage 1.5 (active): React app with on-demand Claude analysis, live prices from
Yahoo Finance, Supabase persistence for shared analyses, admin magic-link auth,
sessionStorage for portfolio. No scheduled automation.

Stage 2 (not started): Python backend, SEC EDGAR monitoring, scheduled
analysis pipeline.

## Stack — Do Not Deviate Without Discussion
- React + Vite + TypeScript
- Tailwind CSS
- Zustand for global state
- React Router v6
- Vercel serverless functions in /api/ for all external API calls
- localStorage for stock analysis cache (Stage 1 fallback)
- Supabase for shared analysis persistence (Stage 1.5)
- sessionStorage for portfolio data (privacy — clears on browser close)
- Supabase magic-link auth for admin access (admin-only write, public read)
- react-markdown + remark-gfm for rendering all AI output cards

## Production URL
https://portfolio-analysis-six.vercel.app
(Corrected July 24, 2026 — the previously documented stock-tracker-five-tau.vercel.app
is confirmed DEAD: missing VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY env vars,
throws a fatal Supabase init exception on load. Do not test against it or use
it in deploy instructions. See July 24 session log entry for how this was
diagnosed.)

---

## App Layout — Two Pages

### Page 1: Dashboard (/)
Two zones:
1. Price Table: the full tracked universe, sortable, scannable. Default sort: 1D% change
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
           analystTargetPrice, recommendationMean, yahooSector, yahooIndustry
  Works for ANY ticker symbol — used by Portfolio for external positions too.
  yahooSector/yahooIndustry sourced from assetProfile module — used to classify
  external tickers that fall outside the GICS KNOWN_TICKERS map.

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
  Request types: "macro_risk" | "macro_scenario" | "trim" | "trim_memo" | "sector_explore" | "cash_deploy" | "networth_analysis"
  max_tokens: 1200 (macro_risk) · 1000 (macro_scenario) · 800 (trim) · 800 (trim_memo) · 600 (sector_explore) · 900 (networth_analysis Tier 1) · 1400 (networth_analysis Tier 2)
  vercel.json maxDuration: 60s covers all api/* functions.
  cash_deploy and macro_risk are the ONLY calls with live web access — they
  include the web_search_20250305 tool, so a round-trip can take 10-20s
  (well within the 60s limit). Every other request type is tool-free. Their
  responses can interleave server_tool_use / web_search_tool_result / text
  blocks, so the handler filters for type === 'text' and joins; tool-free
  types keep the single-block content[0].text read.
  networth_analysis shares this same 20-calls/hour bucket — it does not get
  its own rate limit; it's the same endpoint as everything else above.

  networth_analysis is the ONE exception to the percentage-only privacy rule
  below — see "Net Worth Privacy Exception" section further down. Do not use
  this exception as precedent for any other request type on this endpoint.

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
  Should I? memo      — purple left border (#a259ff), purple tint background
  Trim/Exit memo      — purple left border (#a259ff), purple tint background

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

---

## Key File Locations
src/types/index.ts                             canonical data schema + SECTOR_COLORS
src/config/tickers.ts                          tracked universe, sector assignments
src/config/gics.ts                             GICS two-tier taxonomy + classifyTicker()
src/store/useStore.ts                          Zustand store, all global state
src/App.tsx                                    router — routes: / · /stock/:ticker · /portfolio · /admin
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
api/portfolio.ts                               portfolio API — macro_risk · macro_scenario · trim · trim_memo · sector_explore
src/lib/supabase.ts                            Supabase client singleton + sendMagicLink() + signOut()
src/hooks/useSupabaseSync.ts                   hydrates Zustand from Supabase on mount; pushAnalysis() after run
src/hooks/useNetWorthSync.ts                   accounts table sync — debounced writes, visibilitychange/pagehide flush
src/hooks/useFinancialProfile.ts               optional income/savings/goal profile — mirrors useNetWorthSync.ts pattern
src/components/networth/NetWorthTab.tsx        net worth aggregation + financial profile panel + AI analysis card
src/components/AuthGate.tsx                    admin magic-link login screen (/admin route)

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
  2. Simulation panel — candidate ticker or existing position, target allocation
     slider (0–100%), auto-detected add vs. trim mode, sector impact table,
     trim/exit/add memo and redeployment suggestions.
  3. Sector explore — Claude suggests 3-4 stocks for any underweight sector,
     each with a "Simulate →" button that pre-fills the simulation panel.
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
semi-public sharing). It does NOT apply to the Net Worth tab — see
"Net Worth AI Analysis" section below for the one deliberate exception.
Do not let that exception bleed back into Portfolio prompt-building code.

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

Left column (2fr):
  1. Positions table — TICKER · SECTOR · PRICE · COST BASIS · GAIN/LOSS · ALLOCATION · ×
     Tighter row padding (6px 10px) and smaller fonts than original.
  2. Sector concentration chart
     - ▶/▼ expand for sub-sectors
     - Dual bars when targets set (solid actual, outline target)
     - Delta label: red = overweight, green = underweight
     - "↗ explore" button on each underweight row (≥2pp under target)
     - "↗ Explore gaps" button in chart header when any sector is underweight
     - "Set targets / Edit targets" button → SectorTargetsPanel
  3. Macro risk — red left-border card, MarkdownCard rendering, account type badge,
     re-run button, "⟳ Run scenario analysis" button (purple, appears after macro runs)

Right column (3fr):
  1. Simulation panel (was "Add simulation" — now covers add AND trim/exit)
     See "Simulation Panel — Full Spec" section below.
  2. Should I? / Trim memo card — purple left-border, MarkdownCard rendering,
     re-run button. Header shows context: "Should I? — META at 20%" or
     "Trim memo — NVDA 17.0% → 8%" or "Exit memo — NVDA".
  3. Trim suggestion card — amber left-border card, MarkdownCard rendering,
     account type badge, re-run button.

Grid: `minmax(0,2fr) minmax(0,3fr)` — left column narrower, right column wider.
This replaced the old fixed `minmax(0,1fr) 320px` layout.

### Simulation Panel — Full Spec

The simulation panel handles both adding new positions AND trimming/exiting
existing ones. Mode is auto-detected — no toggle needed.

**Mode detection (derived at render, never stored):**
  simExistingPos  — computed.find(p => p.ticker === simTicker) or null
  simCurrentPct   — existingPos.portfolioWeightPct or 0
  simIsHeld       — simExistingPos != null
  simIsTrim       — simIsHeld && simAlloc < simCurrentPct
  simIsExit       — simIsHeld && simAlloc === 0
  simIsAdd        — !simIsHeld || simAlloc > simCurrentPct

**Slider behavior:**
  - Range: 0–100% (0% = full exit)
  - When ticker entered that IS already held: slider snaps to current weight
  - When ticker entered that is NOT held: slider defaults to 8%
  - Slider accent color: red at 0% exit, amber when trimming, white when adding
  - Labels: "0% exit" on left, "▲ X% now" marker when ticker is held, "100%" on right
  - Target allocation label shows "(currently X.X%)" when ticker is held

**Sector impact math:**
  For NEW positions (not held):
    scaleFactor = (100 - targetPct) / 100
    newWeight[sector] = existing * scaleFactor
    newWeight[simSector] += targetPct

  For EXISTING positions (already held):
    // Removes current weight, rescales remainder, applies new target
    remainingBase = 100 - currentPct
    scaleFactor = (100 - newTargetPct) / remainingBase
    newWeight[simSector] = (existing[simSector] - currentPct) * scaleFactor + newTargetPct
    newWeight[otherSectors] = existing * scaleFactor

  This prevents double-counting when simulating an existing position.
  Full exit (0%) correctly removes the position entirely.

**Action buttons — labels change by mode:**
  Primary (purple in add mode, amber in trim mode):
    Add mode:   "✦ Should I? — get memo"
    Trim mode:  "✦ Trim memo — should I reduce?"
    Exit mode:  "✦ Full exit — where should proceeds go?"

  Secondary (subtle):
    Add mode:   "Quick trim suggestion"
    Trim mode:  "Where should proceeds go?"

**Auto sector explore on trim/exit:**
  After running either button in trim mode, the code automatically finds the
  most underweight sector (≥2pp gap vs target, different from trimmed sector)
  and opens SectorExplorePanel. This surfaces redeployment candidates without
  an extra click.
  Only fires when hasTargets is true (sector targets have been set).

### SectorTargetsPanel
Width: 460px. Grid: 24px 1fr 60px 80px 64px.
% symbol is a sibling span outside the input (not inside) — prevents clipping.
Number spinners hidden. Must sum to exactly 100% to enable Save.
Columns: ▶/▼ · SECTOR · ACTUAL · TARGET · DELTA
Sub-sectors: collapsible, show actual only, no target input.

ALL 12 GICS sectors are always shown — not filtered to only sectors currently
held. This allows setting targets for sectors you don't yet own (e.g. setting
a 10% health_care target before adding any healthcare stocks).
Previously the panel only showed sectors where actuals > 0.05% — this was a
bug that prevented setting targets for unowned sectors. Fixed June 4, 2026.

### Sector Explore Panel
Slide-in from right (same style as AccountTypePanel and SectorTargetsPanel).
Shows the underweight gap (e.g. "You're 8pp underweight vs 15% target").
Claude returns a JSON array of { ticker, rationale, marketCapRange }.
Each card has a "Simulate →" button that closes the panel and pre-fills
the simulation ticker input.
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
  type: "macro_risk" | "macro_scenario" | "trim" | "trim_memo" | "sector_explore"
  positions: PositionPayload[]       // includes keyMetrics?: string
  accountType?: string
  accountContext?: string
  sectorTargets?: Record<string, number | null>
  sectorActuals?: Record<string, number>
  subSectorActuals?: Record<string, number>
  projectedTargets?: Record<string, number | null>  // macro_scenario only
  candidate?: CandidatePayload                       // trim + trim_memo; includes keyMetrics?: string
  exploreSector?: string                             // sector_explore only
}

CandidatePayload shape:
{
  ticker: string
  sector: string
  subSector?: string
  targetWeightPct: number        // desired new weight (0 = full exit)
  currentWeightPct?: number      // current weight if already held
  isTrimMode?: boolean           // true when reducing an existing position
  inUniverse: boolean
  keyMetrics?: string
}

PositionPayload includes keyMetrics?: string — populated from localStorage
(space-tracker-analyses → state.analyses[ticker].keyMetrics).
getKeyMetrics(ticker) helper in PortfolioTab.tsx reads this at call time.

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

trim prompt structure — BRANCHES on isTrimMode:
  Add mode (isTrimMode false):
    ### Trim Plan to Fund {ticker} ({pct}%)
    ### Post-Rebalance Sector Weights  (markdown table)

  Trim/exit mode (isTrimMode true):
    ### Exit Plan — {ticker}  OR  ### Trim Plan — {ticker} (X% → Y%)
    ### Redeployment Suggestions   (2-3 sectors/tickers for freed capital)
    ### Post-Rebalance Sector Weights  (markdown table)

trim_memo prompt structure — BRANCHES on isTrimMode:
  Add mode:
    ### The Case For
    ### The Case Against
    ### Verdict  (Buy / Pass / Watch)

  Trim/exit mode:
    ### The Case For Exiting/Trimming
    ### The Case Against
    ### Verdict  (Exit / Hold  OR  Trim / Hold)
    — suggests redeployment target for freed pp

  Under 200 words. Opinionated — one clear verdict sentence.
  References keyMetrics from localStorage for candidate and existing positions.
  Card color: purple left border (#a259ff), purple tint background.

sector_explore response is validated as JSON before returning to client.
Returns { error } if Claude output is not parseable.

---

## GICS Sector Taxonomy (Portfolio Use Only)

Defined in src/config/gics.ts. SEPARATE from dashboard filter pill sectors.
Do NOT conflate them.

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

## Known Issues (as of June 4, 2026)

- Stocks analyzed in old 5-section format (IREN, MOD) lack snapshot block.
  Re-run to upgrade to current 4-section + snapshot format.

- Toast notifications not built — no success/error feedback on analysis completion.

- FLY (Firefly Aerospace) — IPO'd Aug 8 2025, CIK 0001860160. Verify EDGAR
  pipeline pulls filings correctly when analyzed.

---

## Next Session Priorities (in order)

1. **Financial Overview tab (idea captured, not scoped)** — new top-level tab
   for whole-picture net worth, separate from the Portfolio tab's stock/fund
   tracking. Central hub for asset types the app doesn't touch yet: crypto,
   401k balance, cash on hand (separate from Portfolio's "dry powder" cash).
   Roth IRA / brokerage holdings would pull from the existing Portfolio tab
   rather than being re-entered. Architectural note: the app currently models
   "one portfolio" per user, not "multiple accounts" — a real net-worth hub
   needs a proper `accounts`/`asset_holdings` table scoped to user_id, rather
   than extending the single-portfolio schema. Scope as its own project —
   likely bigger than it looks from the UI description alone.

2. **Sharpen AI portfolio recommendations** — current suggestions read as
   generalist and low-diversity (same 2-of-3 stocks recur across cash-deploy
   runs regardless of amount). Want more in-depth, theme-based
   recommendations (a few stocks/funds per theme, one line each), accepting
   higher token cost for deeper, more varied reasoning. Need to figure out
   token cost of that level of prompt detail and how to structure it.

---

## Claude Behavior Rules

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
commit message based on what was just built. Never use placeholder text — always
use the real paths from the session.

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
