# InvestAI — CLAUDE.md

## What This Project Is
A 31-stock investment analysis dashboard tracking four sectors: space economy,
AI infrastructure, defense, and clean energy/nuclear. Built in React + Vite +
Tailwind, deployed on Vercel. Personal research tool, eventually semi-public.

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
src/config/tickers.ts                          31-stock universe, sector assignments
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

Tickers outside the 31-stock universe get an "EXT" badge.

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

### July 17, 2026 — Net Worth AI Analysis (two-tier) — spec'd via Claude Code prompt

**Project state check:** Pulled the latest project export
(`space-tracker-2026-07-17T18-00-37.zip`) and confirmed the Needs Attention
sidebar and full Net Worth tab (including credit card liabilities) are
already built and routed — both were still marked "not yet executed" in
this file as of the July 16 entries. Corrected those entries above. Two
unresolved items surfaced during the review, not yet addressed:
 unresolved items surfaced during the review, not yet addressed:
  - `api/edgar.ts` (611 lines) exists alongside the documented
    `api/edgar-proxy.ts` (51 lines). Confirmed July 21: grepped the full
    frontend and every file in api/ — nothing imports or references
    edgar.ts anywhere. It's dead code, not a live alternate path. Should
    be deleted; safe to do so.

**New: Net Worth AI Analysis, two tiers**
  Extends the Net Worth tab (currently aggregation-only, no AI) with an
  analysis card following the same MarkdownCard pattern as Portfolio's
  Macro Risk card.
  - **Tier 1 — Balance Sheet Health:** runs from account data alone (no new
    inputs). Sections: Balance Sheet Health, Debt Priority (APR-avalanche
    payoff ordering across credit_card accounts), Concentration & Liquidity,
    Watch Items.
  - **Tier 2 — Financial Plan:** unlocked by an optional, collapsed-by-
    default "Financial profile" panel (monthly income, monthly savings
    target, an optional goal label/date/amount). Adds Savings Rate, Debt
    Payoff Timeline, and Runway & Trajectory sections, with an explicit
    "not financial advice" disclaimer appended. Tier selection is computed
    server-side from which fields are actually populated — never trusts a
    client-sent tier flag.
  - New request type `"networth_analysis"` on the existing `/api/portfolio.ts`
    endpoint, sharing its 20-calls/hour rate limit bucket (not a new one).
    max_tokens: 900 (Tier 1) / 1400 (Tier 2).

**Deliberate privacy exception — Net Worth only**
  Unlike the Portfolio tab's hard percentage-only rule, the user explicitly
  approved sending real dollar figures (balances, APRs, income, savings
  targets) to the API for this feature, since the Net Worth tab is
  already admin-gated and not built for sharing. This exception is scoped
  to `networth_analysis` only and must not be carried back into any
  Portfolio prompt-building code. Documented inline in `api/portfolio.ts`
  and in the "Privacy Rules — Hard" section above.

**Estimated token cost:** ~$0.014/call (Tier 1, ~1,250 input + ~675 output
tokens) and ~$0.020/call (Tier 2, ~1,300 input + ~1,050 output tokens) at
claude-sonnet-4-6 rates ($3/M input, $15/M output). Trivial at personal-use
volumes — output-dominated cost, consistent with the other request types
on this endpoint.

**Data layer:** New `user_financial_profile` table (user_id, monthly_income,
monthly_savings_target, goal_label, goal_target_date, goal_target_amount,
updated_at — all nullable except user_id), RLS-scoped to auth.uid(). SQL
migration handed to the user directly (not run by Claude Code) as
`supabase_migration_financial_profile.sql` — run manually in Supabase SQL
Editor before deploying. `useFinancialProfile.ts` should treat a missing
table/column as a `syncError`, not a crash, since Claude Code implements
the app code without running the migration itself.

**Status:** Claude Code prompt written and handed off, not yet executed.
Next session: confirm the Supabase migration was run → run the Claude Code
prompt → `npx tsc --noEmit` → verify Tier 1 works with zero profile fields
set and Tier 2 only activates with income/savings actually populated →
confirm no dollar figures leaked into any other portfolio.ts request type
→ deploy. Also worth using this session to resolve the two stray-file
issues noted above before they cause a second silent-drop bug.

**Files to be created/modified (not yet touched):**
  src/hooks/useFinancialProfile.ts (new) ·
  src/components/networth/NetWorthTab.tsx (modified — profile panel + analysis card) ·
  api/portfolio.ts (modified — new request type, buildNetWorthPrompt())

---
### July 19, 2026 — Onboarding modal · purchase merging · $ prefixes · dark/light theme

**New: First-visit onboarding modal**
  src/components/Onboarding/OnboardingModal.tsx — fires once, gated by
  localStorage `investai_onboarded_v1` (set on any dismiss: ×, backdrop, or
  "Got it"). One card per tab (Dashboard / Portfolio / Net Worth) with copy
  drawn from this file's tab specs, accent-colored left borders (cyan/violet/
  green). Re-openable anytime via a new "?" icon button in the top nav.

**New: Add purchase to existing position (PortfolioTab)**
  The add-position row now detects when the entered ticker is already held:
  relabels to "Add purchase to existing {TICKER} position", shows current
  shares + avg cost as read-only context, and merges on submit into the SAME
  row via weighted average:
    totalShares = oldShares + newShares
    newAvgCost = (oldShares*oldAvg + newShares*newCost) / totalShares
  No duplicate rows possible; the old "{TICKER} is already added" error is
  gone. Inline click-to-edit Shares/Avg Price columns unchanged — this is an
  additional entry path. Data stays in sessionStorage; no schema change.

**New: $ prefix on cost-basis inputs**
  Avg Price inline editor (EditableNumberCell edit mode) and the add/purchase
  cost input now render `$` as a sibling span outside the input — same
  pattern as the % in SectorTargetsPanel, so it can't be clipped. Shares
  inputs stay plain so shares vs dollars are unambiguous side by side.

**New: Dark/light theme toggle**
  Core palette converted to CSS custom properties in src/index.css: `:root`
  holds dark defaults, `html.light` holds light overrides (--bg-base,
  --bg-surface, --bg-elevated, --bg-panel, --bg-inset, --border,
  --border-muted/-strong/-panel/-faint, --text-primary/-body/-secondary/
  -tertiary/-muted/-dim, --overlay). A codemod replaced ~531 hardcoded hex
  occurrences across all src/*.tsx with these vars — near-duplicate shades
  (#e2e4ef/#e2e6f0, #1e2030/#1e2230, #8b8fa8/#8b93a8, etc.) were collapsed
  into single tokens. Sun/moon toggle in the top nav next to the "?" button;
  choice persists in localStorage `investai_theme`, defaults to dark; an
  inline script in index.html applies the class pre-paint (no flash).

  Deliberately NOT themed: accent colors (green/red/yellow, sector colors,
  conviction/guidance badges) — same hex both modes; dark text (#08090d) on
  bright accent buttons (cyan Run Analysis, green $ CASH, violet Save) —
  correct contrast in both themes; semi-transparent grays (#8b93a866 etc.);
  accent hexes inside .ts config files (SECTOR_COLORS, ACCOUNT_TYPES) which
  are alpha-suffixed at runtime via template literals.

**Verification:** `npx tsc --noEmit` and `npm run build` pass. Privacy rule
re-checked: all six /api/portfolio call sites still send only ticker /
sector / subSector / weightPct / gainPct / inUniverse / keyMetrics — the new
purchase-merge flow writes to sessionStorage only, nothing new in any
request body.

**Files created:** src/components/Onboarding/OnboardingModal.tsx ·
  src/hooks/useTheme.ts
**Files modified:** index.html · src/index.css · CLAUDE.md ·
  src/components/Layout/index.tsx · src/components/compare/PortfolioTab.tsx ·
  plus theme-var conversion across: AuthGate, ConvictionBadge, ErrorBoundary,
  PortfolioAuthGate, PriceTable, SidePanel, StockCard, StockDetail,
  SectorTargetsPanel, networth/* (AddAccountPanel, NetWorthAuthGate,
  NetWorthTab), pages/* (Dashboard, NetWorth, Portfolio)

---

### July 20, 2026 — Preferences persistence race fix · sync diagnostics · Portfolio cash in Net Worth

**Bug fixed: Portfolio preferences not reliably loading/persisting (frontend
auth race — NOT an RLS/migration/DB issue)**
  Confirmed via direct Supabase inspection that `user_preferences` has all
  required columns, writes succeed, and SELECT/UPDATE/INSERT RLS policies all
  correctly scope to `auth.uid() = user_id` — reads/writes were never blocked.
  Root cause was two uncoordinated auth checks: `src/pages/Portfolio.tsx` ran
  its own `supabase.auth.getSession()` to gate rendering, while
  `usePortfolioSync.ts` ran a separate `getSession()` to resolve its userId.
  PortfolioTab could mount and seed from sessionStorage/defaults before the
  sync hook's own auth check resolved — timing-dependent, hence the
  "sometimes it saves, sometimes it doesn't" behavior.
  Fix: `usePortfolioSync` is now the single source of truth for auth
  resolution — it exports a new `authResolved: boolean` (true once its
  internal getSession completes, regardless of whether a session exists).
  Portfolio.tsx no longer calls getSession itself; it derives authStatus
  ('loading'/'authenticated'/'anonymous'/'gate') from the hook's
  `authResolved` + `isAuthenticated`. Gate/anonymous behavior
  (sessionStorage 'portfolio_gate_dismissed' fallback) preserved exactly;
  anonymous users still fall back to sessionStorage unchanged. PortfolioTab's
  seed effect (`if (!isAuthenticated || syncSeeded.current) return; if
  (syncedPositions === null) return;`) was already correct — it was only ever
  being fed an unreliable isAuthenticated value.

**New: permanent sync diagnostics**
  Added `console.info` logging in usePortfolioSync's load() after both the
  positions and preferences selects (`[portfolio-sync] positions/prefs load
  result:` with userId/count/found/prefRow). Permanent — makes any future
  load issue diagnosable from devtools alone.

**New: Portfolio "Cash available" now feeds Net Worth total**
  `useLinkedPortfolioValue()` in NetWorthTab now also surfaces
  `savedCashAmount` from usePortfolioSync (already persisted in
  `user_preferences.cash_amount`). A synthetic, read-only account row
  (kind `'portfolio_cash_link'`, label "Cash (Portfolio)", teal #06b6d4)
  is injected right after the holdings_link row — parallel to how
  holdings_link is handled: not editable from Net Worth, its own colored
  segment in the composition bar, included in the total, and skipped entirely
  when cash is 0/null. Inline "edit on portfolio →" link + tooltip clarify
  the sync source. NOT deduped against any manual 'cash' account by design —
  both show if present; reconciling is the user's call. Only surfaced for
  authenticated users (anonymous portfolio cash lives in sessionStorage and
  isn't read here). `AccountKind` union gained `'portfolio_cash_link'` (a
  render-only kind, never persisted) so KIND_DISPLAY type-checks; ADDABLE_KINDS
  in AddAccountPanel is unchanged so it's never user-addable.

**Optional RLS dedupe migration — handed off, NOT run by Claude Code**
  `supabase_migration_dedupe_preferences_policies.sql` (idempotent) drops the
  older duplicate `user_preferences` policy set (verbose "Users can …" names)
  and keeps one concise SELECT/UPDATE/INSERT each. Pure cleanup — access is
  unchanged. Run manually in the Supabase SQL Editor.

**Verification:** `npx tsc --noEmit` and `npm run build` pass. No behavior
change for anonymous Portfolio users (still sessionStorage). Net Worth total
includes Portfolio cash without double-counting a manual cash account (they're
intentionally separate rows). Cash-available debounce + visibilitychange/
pagehide flush in usePortfolioSync untouched.

**Files modified:** src/hooks/usePortfolioSync.ts · src/pages/Portfolio.tsx ·
  src/hooks/useNetWorthSync.ts · src/components/networth/kindDisplay.ts ·
  src/components/networth/NetWorthTab.tsx · CLAUDE.md
**Files created (handed off):** supabase_migration_dedupe_preferences_policies.sql

### July 21, 2026 — Portfolio Sync Regression: Introduced, Diagnosed, Reverted

**What happened:** Session started to fix two reported bugs — Net Worth's
cash figure auto-pulling from Portfolio with no way to zero it out, and
investor preferences (account type, sector targets, cash, risk profile)
resetting when navigating away from the Portfolio tab and back.

**Cash decoupling — implemented, then reverted as collateral:**
Removed the synthetic, read-only "Cash (Portfolio)" row that NetWorthTab
auto-injected from Portfolio's cash_amount on every render, plus the
`portfolio_cash_link` account kind. Net Worth cash was meant to become a
normal, independently editable `cash` account (already supported by
AddAccountPanel). This part worked correctly but got bundled into the same
file changes as the regression below and was reverted along with it —
**still needs to be redone**, carefully, on its own.

**Preferences fix — regressed the app, root-caused, reverted:**
Misdiagnosed the preferences bug as a sequential-`await` race in
`usePortfolioSync`'s load() (positions resolving before preferences), and
changed PortfolioTab's seed effect to gate on `syncLoading` instead of
`syncedPositions === null`. This was a mistake: it hadn't been confirmed
against the live app first, and it coupled `syncSeeded.current` (shared by
both the seed effect AND the positions-save effect) to preferences loading
— so positions stopped saving too. The actual preferences bug had **already
been correctly fixed** in the July 20 session ("Improving site onboarding
and portfolio management") via the `authResolved` single-source-of-truth
fix in `usePortfolioSync`/`Portfolio.tsx` — that seed-effect gate had been
explicitly reviewed and confirmed fine at the time. This session's change
overrode working logic without re-verifying the bug still existed.

Compounded the mistake by layering a Context Provider (hoisting
`usePortfolioSync` to mount once at the app root instead of per-page) and
optimistic local-state updates on top of the unverified first change,
before confirming root cause. Architecturally reasonable ideas, wrong time
to introduce them.

**Resolution:** Reverted all 7 touched files (`PortfolioTab.tsx`,
`NetWorthTab.tsx`, `useNetWorthSync.ts`, `kindDisplay.ts`,
`usePortfolioSync.ts`, `App.tsx`, `Portfolio.tsx`) to their exact
pre-session state from a clean project zip, and deleted the new
`PortfolioSyncContext.tsx` file entirely. App is back to the known-good
July 20 state.

**Still open / not addressed this session:**
- The Net Worth cash decoupling fix (see above) — redo on top of the
  restored baseline, in isolation.
- A `portfolio:1` 404 seen in console during debugging — cause never
  identified, may be unrelated to the sync bugs above.
- Testing occurred against `portfolio-analysis-six.vercel.app`, which does
  NOT match the documented canonical production URL
  (`stock-tracker-five-tau.vercel.app`). Never confirmed whether these are
  the same Vercel project under different aliases or genuinely different
  deployments — worth resolving before further debugging, since testing
  against a stale/different deployment would produce misleading symptoms.

**Lesson:** Before changing sync/timing-sensitive logic that a prior
session already fixed and confirmed, re-verify the bug still reproduces on
the current deployed build first — don't re-diagnose from theory alone,
and don't layer further architecture changes on an unverified fix.
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