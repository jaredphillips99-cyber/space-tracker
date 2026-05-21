# Space Tracker — CLAUDE.md

## What This Project Is
A 31-stock investment analysis dashboard tracking four sectors: space economy,
AI infrastructure, defense, and clean energy/nuclear. Built in React + Vite +
Tailwind, deployed on Vercel. Personal research tool, eventually semi-public.

## Current Build Stage
Stage 1: React app with on-demand Claude analysis, live prices from Yahoo
Finance, localStorage caching. No backend, no auth, no scheduled automation.

Stage 2 (not started): Python backend, SEC EDGAR monitoring, scheduled
analysis pipeline, Supabase persistence.

## Stack — Do Not Deviate Without Discussion
- React + Vite + TypeScript
- Tailwind CSS
- Zustand for global state
- React Router v6
- Vercel serverless functions in /api/ for all external API calls
- localStorage for Stage 1 cache (Supabase in Stage 2)
- No auth in Stage 1

## The 31-Stock Universe
Four sectors. A stock can have multiple sector tags.

Space (9):                RKLB, PL, RDW, LUNR, ASTS, KTOS, BKSY, FLY, SATS
AI Infrastructure (9):   NVDA, PLTR, CRWV, IREN, NBIS, CIFR, RIOT, VRT, MOD
Clean Energy/Nuclear (10): CEG, VST, BWXT, GEV, BE, CCJ, LEU, NXE, OKLO, NNE
Defense (3 + crossovers): LHX, AVAV, KTOS

lng_export is typed as a SectorTag but no stocks are tagged with it yet
and it does not appear as a filter pill. Reserved for future expansion.

## Layout — Two Zones, This Order
1. Price Table (top, primary): All 31 stocks, sortable, scannable.
   Default sort: 1-day % change descending.
   Shows: sector pills, status dot, guidanceDirection badge, stale warning.
2. Sidebar (secondary): "What's New" — stale stocks first, recently
   analyzed second, awaiting third. Plus upcoming earnings dates.
Deep dive (StockDetail) opens on row click. Compare is a stub for now.

## Immutable Schema Decisions

impliedUpsidePercent is NEVER stored in StockAnalysis.
Always computed at render: (analystConsensusTargetPrice / livePrice) - 1
Reason: live price changes daily; storing it creates instant stale data.

businessModel has its own lastUpdated timestamp separate from analyzedAt.
Only re-extracted when ticker is new or explicitly requested.
Financials + management commentary update every earnings cycle.
Business model does not.

status has exactly three string values — computed at render, never stored:
  "awaiting"  — analysis is null in the store
  "analyzed"  — analyzedAt exists and is within 30 days of today
  "stale"     — analyzedAt exists but is more than 30 days ago

segments array is nullable at root level. When null, UI skips segment
chart entirely — no empty boxes, no broken layouts.

## API Architecture — Do Not Change

Yahoo Finance → proxied through /api/prices.ts (Vercel serverless)
  Never call yahoo-finance2 from the browser (CORS + key exposure).
  Cache 5 minutes max. On error, return fetchError: true and UI shows
  last cached values with a visual indicator.

Anthropic API → proxied through /api/analyze.ts (Vercel serverless)
  Always streaming — never switch to non-streaming.
  Rate limit: 10 calls per IP per hour, return 429 if exceeded.
  Model: claude-sonnet-4-20250514
  Two-call pattern:
    Call 1 — structured JSON extraction (financials, guidance, segments)
    Call 2 — narrative generation (management, scenarios, risks)

SEC EDGAR → not used in Stage 1. Earnings data pasted manually.
  Automated in Stage 2 via Python backend + RSS feed monitoring.

## Sector Colors — Use Exactly These Values
space:             #00c8ff   cyan
ai_infrastructure: #a259ff   violet
defense:           #f97316   orange
clean_energy:      #00e676   green
lng_export:        #fbbf24   amber (reserved, not displayed)

## Design System
Background:   #08090d     Surface:    #0f1117
Surface 2:    #161922     Border:     #1e2230
Text:         #e2e6f0     Muted text: #8b93a8
Green:        #00e676     Red:        #ff4b6e     Yellow: #ffd166

Fonts: Space Mono → labels, tickers, data, badges
       DM Sans    → body text, descriptions, narrative prose
Dark theme only. No light mode.

## Row Status Visual Rules
Awaiting:  dimmed row, "○ Awaiting" pill, no sector dot
Analyzed:  normal row, colored sector dot, guidanceDirection badge
Stale:     2px solid amber left border (#fbbf24), "⚠ Stale Xd" badge

guidanceDirection badge colors:
  raised      → green    maintained → gray
  lowered     → red      initiated  → blue

## Speculative Names — Handle Differently in Analysis Prompts
OKLO, NNE  — pre-revenue. Focus on milestones, partnerships, burn rate, TAM.
NXE        — pre-production uranium. Same treatment as above.
CIFR, RIOT — Bitcoin miners, AI pivot less advanced than IREN/CORZ.
             Be explicit about where they are on the pivot spectrum.
SATS       — satellite broadband restructuring story, not pure space infra.

## Environment Variables Required
ANTHROPIC_API_KEY   → Vercel dashboard → Settings → Environment Variables
(Yahoo Finance requires no key — uses yahoo-finance2 npm package)

## Key File Locations
src/types/index.ts       canonical data schema, source of truth
src/config/tickers.ts    31-stock universe with sector tags
src/store/useStore.ts    Zustand store, all global state
api/prices.ts            Yahoo Finance proxy (Vercel serverless)
api/analyze.ts           Anthropic streaming proxy + rate limiting

## Session Log — Update at End of Every Claude Code Session

### Built and Working
- Project scaffolded: Vite + React + TypeScript + Tailwind
- src/types/index.ts: full schema defined
- src/config/tickers.ts: 31 stocks configured
- Zustand store: all 31 tickers initialized in awaiting state
- Live prices wired through /api/prices.ts into PriceTable
- PriceTable shows implied upside computed at render
- 52-week range bar added to PriceTable
- StockDetail page built with live price and analysis shell
- "What's New" sidebar panel built with stale, recent, upcoming sections
- Default sort updated to 1-day % change descending
- App builds cleanly with `npm run build`

### In Progress / Known Issues
- /api/analyze.ts not yet built
- Toast notifications not built
- Compare page is a stub only

### Next Build Session Priority Order
1. Build /api/analyze.ts with streaming + rate limiting
2. Add toast notifications on analysis complete
3. Flesh out Compare page
4. Add better earnings calendar and scheduled analysis workflow
5. Begin Stage 2 Python backend / EDGAR monitoring planning
