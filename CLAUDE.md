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
  Request types: "macro_risk" | "macro_scenario" | "trim" | "trim_memo" | "sector_explore"
  max_tokens: 1200 (macro_risk) · 1000 (macro_scenario) · 800 (trim) · 800 (trim_memo) · 600 (sector_explore)
  No vercel.json maxDuration needed — all calls complete in <10s.
  trim_memo takes 10-15s due to web search round-trip — expected, within 60s limit.

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

### July 16, 2026 — Portfolio Table UX & Sync Reliability Fixes

**New: Editable Shares / Avg Price columns**
  Positions table now shows Shares and Avg Price as separate, click-to-edit
  columns instead of a single static Cost Basis field. Values commit inline
  via handleUpdatePosition() — no more remove-and-re-add to adjust a holding.

**Bug fixed: removed positions reappearing after refresh (anonymous users)**
  usePortfolioSync's sessionStorage-persist effect skipped writing whenever
  the portfolio ended up fully empty with no sector targets set — clearing
  your last position(s) looked like it worked but silently reverted on
  reload. Removed the guard; an emptied portfolio now persists correctly.

**Bug fixed: remove (×) button clipped off-screen**
  Adding the Shares/Avg Price columns widened rows past the container, and
  `overflow:hidden` silently clipped the × column entirely. Table now scrolls
  horizontally in its own wrapper with the remove column pinned via
  `position: sticky; right: 0`, always reachable regardless of width.

**Layout: widened positions table, shrank simulation panel**
  Grid ratio flipped from `2fr/3fr` to `13fr/7fr` (left/right), and the table
  now uses `table-layout: fixed` with an explicit `<colgroup>` so all columns
  (including Allocation) fit without horizontal scroll on normal screens.

**Bug fixed: preferences not persisting across sign-ins**
  Root cause: `user_preferences` table likely missing `cash_amount` /
  `preferences` jsonb columns from an unrun migration — Supabase silently
  rejected the upsert (console.warn only, never surfaced). Added idempotent
  `supabase_migration_preferences_fix.sql` (run manually in Supabase SQL
  Editor) and a `syncError` state shown as a red banner in the UI so a
  failed save/load is never silent again.

**Bug fixed: simulation panel crash ("site going black")**
  Reproduced via headless-browser scripting. Root cause: a failed ticker
  price lookup returned `price: 0` (not `null`); `?? null` doesn't catch `0`,
  so a failed lookup was treated as a real $0 price — dividing cash by $0
  produced Infinity/NaN inside the simulation math. Fixed fetchPrice() to
  check `entry.fetchError` explicitly. Also added a React ErrorBoundary
  around the /portfolio route so any future render crash degrades to a
  recoverable card instead of blanking the page.

**Files modified:** src/components/compare/PortfolioTab.tsx ·
  src/hooks/usePortfolioSync.ts · src/pages/Portfolio.tsx · src/App.tsx ·
  src/components/ErrorBoundary.tsx (new) ·
  supabase_migration_preferences_fix.sql (new)

---

### July 16, 2026 — Earnings-Driven "Needs Attention" Sidebar (spec'd, not yet built)

**Problem identified:** The Dashboard sidebar's staleness signal (analyzedAt > 30
days) is a weak proxy — it flags age, not whether there's actually new data
(an earnings report) to analyze. At time of writing, every analyzed stock is
already >30 days stale, making the existing flag useless for prioritization.

**Decision: replace stale-tracking with earnings-date-driven tracking**
  Two prompts were written for Claude Code (not yet executed):
  1. **Upcoming Earnings tracker** — add `calendarEvents` module to the
     yahoo-finance2 quoteSummary call in api/prices.ts, exposing
     `nextEarningsDate: string | null` per ticker. New sidebar panel listing
     tickers with upcoming earnings, sorted soonest-first, with dueSoon
     (within 7 days) and reportLikelyOut (earnings passed, analyzedAt
     predates it) status tiers.
  2. **Superseding prompt — unified "Needs Attention" panel** — this fully
     replaces the What's New stale/awaiting logic in SidePanel/index.tsx
     rather than running alongside it. Three-tier status computed at
     render (never stored):
       - `reportDue` (red, highest priority) — earnings passed,
         analyzedAt null or predates it. Tag: "⚠ re-run analysis"
       - `earningsSoon` (amber) — earnings within 7 days.
         Tag: "⏱ earnings in Nd"
       - `staleFallback` (dim gray, lowest priority) — only for tickers
         where Yahoo has no earnings date at all AND analyzedAt >30 days.
         Kept as a fallback net so tickers with no earnings-calendar
         coverage (e.g. some pre-revenue names) don't silently disappear
         from tracking.
     Sort order: reportDue → earningsSoon → staleFallback. Anything not
     matching a tier is dropped from the panel entirely (list only shows
     actionable/upcoming items, not full 31-ticker status).
     Empty state: "All caught up" instead of blank panel.

  **Rationale for not just deleting stale-tracking outright:** it still
  covers tickers Yahoo's earnings calendar doesn't reach — without a
  fallback tier, those rows would go stale forever with no indicator.

**Status:** Prompt written and reviewed, not yet run through Claude Code.
Next session: execute the "Needs Attention" prompt, verify calendarEvents
field path in yahoo-finance2's types before implementation, confirm
`npx tsc --noEmit` passes, then deploy and spot-check that the first
post-deploy render is sane (all 31 tickers currently stale, so initial
panel population should be checked by hand rather than assumed correct).

**Files to be modified (not yet touched):** api/prices.ts,
src/components/SidePanel/index.tsx

---

---

### July 16, 2026 — Net Worth Tab (Stage 1.5.1) — spec'd + credit card liabilities

**New: Net Worth tab (aggregation-only, no AI calls in v1)**
  New top-level tab at /networth alongside Dashboard/Portfolio. Introduces
  an `accounts` table (Supabase, RLS user-scoped) modeling net worth as a
  set of accounts of different kinds:
    - `holdings_link` (linked: true) — a single synthetic row whose value is
      never stored; it's read live from the existing Portfolio tab's
      positions + prices, same source PortfolioTab uses for its own total.
    - `cash` / `balance` / `crypto` — manually-entered balances with a label,
      editable inline, timestamped on edit.
  Total net worth = linked Portfolio value + sum of all other account
  balances. Breakdown shown as a stacked bar, one segment per account,
  colored by kind.

  New files: src/hooks/useNetWorthSync.ts (mirrors usePortfolioSync.ts's
  debounce + visibilitychange/pagehide flush pattern), NetWorthTab.tsx,
  NetWorthAuthGate.tsx, AddAccountPanel.tsx, kindDisplay.ts, NetWorth.tsx.
  Route wrapped in the existing ErrorBoundary, same as /portfolio.

**New: Credit card liability tracking**
  Extended `accounts.kind` to include `credit_card`, with new nullable
  columns: `apr`, `due_date`, `min_payment`, `statement_balance`. The
  existing `balance` column doubles as "amount owed" for these rows — no
  sign flip stored; liability-ness is applied only at aggregation/display
  time (net worth = assets − sum of credit_card balances).

  Accounts list shows balance/APR/due date/min payment per card, with
  left-border urgency coloring computed at render (never stored): red
  (due ≤5d), amber (due 6–14d), gray (further out or no due date). New
  "30-day cash flow" section lists upcoming due dates soonest-first with a
  rollup warning when minimum payments are due within 5 days.

  Migrations: `supabase_migration_accounts.sql`,
  `supabase_migration_credit_cards.sql` (both idempotent, run manually in
  Supabase SQL Editor before deploying the corresponding code).

**Status:** Both scoped as Claude Code prompts, not yet executed/deployed.
Next session: run migrations → run prompts → `npx tsc --noEmit` → verify
credit_card rows don't affect existing account kinds → deploy.

**Files to be created/modified (not yet touched):**
  src/hooks/useNetWorthSync.ts · src/components/networth/NetWorthTab.tsx ·
  src/components/networth/AddAccountPanel.tsx ·
  src/components/networth/kindDisplay.ts · src/components/networth/NetWorthAuthGate.tsx ·
  src/pages/NetWorth.tsx · src/App.tsx · src/components/Layout/index.tsx

---