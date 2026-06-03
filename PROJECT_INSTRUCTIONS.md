# Space Tracker — Claude Project Instructions

## What This Is
A 31-stock investment analysis dashboard for tracking the space economy,
AI infrastructure, defense, and clean energy/nuclear sectors. Personal
research tool built in React + Vite + Tailwind, deployed on Vercel.

The goal is a two-zone dashboard: a live price watchlist for all 31 stocks
at a glance, and a sidebar showing what's new/stale. Clicking any stock
opens a deep dive with AI-generated earnings analysis — a snapshot of key
numbers, a What Happened summary, Bull Case, Bear Case, and Key Catalysts
extracted from the most recent SEC filing.

## Production URL
https://stock-tracker-five-tau.vercel.app
Do not use space-tracker-six.vercel.app — that is a stale deployment.

## Build Stages
Stage 1 (active): React app, on-demand Claude analysis, Yahoo Finance live
prices, SEC EDGAR fetched browser-side, localStorage caching. No backend,
no auth, no scheduled automation.

Stage 2 (not started): Python backend, SEC EDGAR filing monitor, scheduled
pipeline, Supabase persistence, optional auth for semi-public sharing.

## The 31-Stock Universe

### Space (9)
RKLB  Rocket Lab          — Launch + space systems; Neutron rocket Q4 2026 catalyst
PL    Planet Labs         — Earth observation SaaS; Google/NVIDIA AI satellite partnerships
RDW   Redwire             — Space hardware + defense autonomous systems
LUNR  Intuitive Machines  — Lunar delivery; only commercial Moon landing success
ASTS  AST SpaceMobile     — Direct-to-phone satellite broadband constellation
KTOS  Kratos Defense      — Unmanned systems + satellite ground infrastructure
BKSY  BlackSky            — High-frequency Earth observation for defense/intel
FLY   Firefly Aerospace   — Small/medium launch + lunar lander; IPO'd Aug 2025
SATS  EchoStar            — Satellite broadband; restructuring story

### AI Infrastructure (9)
NVDA  NVIDIA              — Dominant AI GPU; H100/Blackwell; ~80% accelerator share
PLTR  Palantir            — AI analytics for government and enterprise; AIP platform
CRWV  CoreWeave           — GPU cloud; $15.1B Microsoft contract; IPO'd 2025
IREN  Iris Energy         — Bitcoin miner → Bare-Metal AI Cloud; $9.7B Microsoft deal
NBIS  Nebius Group        — Full-stack AI cloud; formerly Yandex; $27B Meta deal
CIFR  Cipher Mining       — Bitcoin miner; early-stage AI pivot; higher execution risk
RIOT  Riot Platforms      — Large-scale Bitcoin miner; AI pivot less advanced than peers
VRT   Vertiv              — Data center power + cooling; picks-and-shovels AI play
MOD   Modine              — Thermal management + data center cooling systems

### Clean Energy / Nuclear (10)
CEG   Constellation       — Largest US nuclear fleet; Three Mile Island restart
VST   Vistra              — Second-largest nuclear fleet; 20yr Meta PPA signed 2026
BWXT  BWX Technologies    — Naval reactor components + SMR; only Navy nuclear supplier
GEV   GE Vernova          — Power generation + grid; spun off GE 2024
BE    Bloom Energy         — Solid oxide fuel cells; fast-to-power data center play
CCJ   Cameco              — World's largest public uranium producer; 15% global supply
LEU   Centrus Energy      — Only US HALEU enrichment licensee; $900M DOE contract
NXE   NexGen Energy       — Pre-production; Rook I = lowest-cost uranium deposit globally
OKLO  Oklo                — Pre-revenue microreactors; Sam Altman chairman; Meta deal
NNE   Nano Nuclear         — Pre-revenue portable microreactors; highly speculative

### Defense (3 + crossovers tagged above)
LHX   L3Harris            — Defense electronics + space sensors; Golden Dome candidate
AVAV  AeroVironment       — Small UAS + Switchblade loitering munition; proven in Ukraine
(KTOS and RDW also tagged defense — see Space section above)

## Schema — Key Rules for Any Conversation

impliedUpsidePercent is NEVER stored. Always computed at render from
Yahoo Finance analystTargetPrice and livePrice:
  (analystTargetPrice - livePrice) / livePrice
Source of truth is Yahoo Finance via /api/prices.ts — NOT EDGAR extraction.
analystConsensusTargetPrice is no longer extracted from EDGAR (unreliable).

keyMetrics field in StockAnalysis stores the Claude-written snapshot string
from Call 1 JSON — a 2-4 sentence prose summary with **bold** key numbers.
Rendered via ReactMarkdown in the purple snapshot block on StockDetail.

status is computed at render from analyzedAt, never stored:
  "awaiting"  = analysis is null
  "analyzed"  = analyzedAt within 30 days
  "stale"     = analyzedAt more than 30 days ago

segments is nullable. When null, skip segment charts entirely.

Two-call Claude pattern for analysis:
  Call 1 → structured JSON (financials, guidance, segments, conviction
            rating, snapshot prose string)
  Call 2 → narrative (What Happened, Bull Case, Bear Case, Key Catalysts)

Narrative is exactly 4 sections in this order. Management tone is woven
into What Happened and Bull/Bear — not a standalone section. Risks fold
into Bear Case. Key Catalysts lists 3-4 filing-grounded milestones only.

## StockDetail Page Layout
Top to bottom:
  ← All Stocks nav
  Header: ticker + sector pills · price + day change + conviction badge
  Yahoo stats strip: Analyst Target · Implied Upside · Market Cap · 52W Range
  Meta row: earnings period · filed date · SEC link · guidance badge · cache age
  Run Analysis / Cancel buttons
  Snapshot block: purple left-border card, bold prose, ReactMarkdown
  Divider
  Narrative: 4 ReactMarkdown sections with styled h2 headers
    (Bull = green tint, Bear = red tint, others neutral)
  Re-run button (bottom, only when cached analysis exists)
  Re-run confirmation modal

The metric card grid has been permanently removed. Do not re-add it.

## Design System
Background #08090d · Surface #0f1117 · Surface2 #161922 · Border #1e2230
Text #e2e6f0 · Muted #8b93a8
Green #00e676 · Red #ff4b6e · Yellow #ffd166
Space Mono for data/labels/tickers/badges · DM Sans for prose · Dark only

Sector colors:
  space #00c8ff · ai_infrastructure #a259ff · defense #f97316
  clean_energy #00e676 · lng_export #fbbf24 (reserved, not shown)

## APIs
Yahoo Finance  → /api/prices.ts (Vercel serverless, never browser-direct)
               Returns price, change, changePercent, weekChangePercent,
               marketCap, fiftyTwoWeekHigh/Low, analystTargetPrice,
               recommendationMean. Cache 5 min.
Anthropic API  → /api/analyze.ts (streaming SSE, 10 calls/IP/hour)
               Model: claude-sonnet-4-6
               Call 1 max_tokens: 2000 · Call 2 max_tokens: 2500
               vercel.json maxDuration: 60s — do not remove
SEC EDGAR      → Fetched browser-side in StockDetail.tsx to avoid Vercel
               IP blocks. CORS proxy at /api/edgar-proxy.ts for /Archives/.
               Normal: EX-99.1 from 8-K item 2.02
               Speculative (OKLO, NNE): dual 8-K + 10-Q MD&A
               SEDAR-only (NXE): training knowledge fallback

## Speculative Names — Different Analysis Treatment
OKLO, NNE, NXE: pre-revenue/pre-production. Focus on milestones,
partnerships, burn rate, cash runway, regulatory progress.
CIFR, RIOT: still primarily Bitcoin miners. Be explicit about how far
along their AI pivot actually is vs. peers like IREN.

## Current Status (Stage 1) — as of May 28 2026

### Working and Deployed
- Live price watchlist: all 31 stocks, real Yahoo Finance prices
- Sector filter pills: ALL / SPACE / AI INFRA / DEFENSE / CLEAN ENERGY
- Default sort: 1D% change descending
- 52-week range bar on every row
- Market cap column
- Upside column: live from Yahoo Finance analystTargetPrice
- Rating column: BUY/STRONG BUY/HOLD badges from Yahoo recommendationMean
- Guidance badges: RAISED / MAINTAINED / LOWERED on analyzed rows
- ANALYZED badge and colored sector dot on analyzed rows
- "What's New" sidebar: recently analyzed with snippet, awaiting ticker grid
- StockDetail deep dive: new layout with snapshot block + 4-section narrative
- Full EDGAR pipeline: fetch → JSON+snapshot extraction → narrative stream → UI
- localStorage cache: analyzed stocks load instantly on return
- Conviction badge on StockDetail header
- Re-run confirmation modal
- Speculative ticker handling (OKLO/NNE/NXE)
- 10 stocks analyzed as of May 28: NXE, KTOS, RDW, PL, AVAV, IREN, MOD
  + others. 21 awaiting.

### Known Issues
- Sidebar snippets show raw markdown heading ("## What Happened Kratos...")
  instead of first prose sentence — needs fix in SidePanel/index.tsx
- Sector dot coloring inconsistent on some rows in PriceTable — needs
  a polish pass to ensure dot only shows for analyzed rows at correct color
- Stocks analyzed pre-May 2026 (IREN, MOD) show old 5-section format
  without snapshot block — re-run to upgrade

### Not Yet Built
- Compare page (currently stub — next priority)
- Toast notifications (success/error on analysis run)
- Stale row visual (amber left border) — logic exists, verify rendering
- Stage 2 backend (Python, Supabase, scheduled pipeline)