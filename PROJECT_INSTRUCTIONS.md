# Space Tracker — Claude Project Instructions

## What This Is
A 31-stock investment analysis dashboard for tracking the space economy,
AI infrastructure, defense, and clean energy/nuclear sectors. Personal
research tool built in React + Vite + Tailwind, deployed on Vercel.

The goal is a two-zone dashboard: a live price watchlist for all 31 stocks
at a glance, and a sidebar showing what's new/stale. Clicking any stock
opens a deep dive with AI-generated earnings analysis, 5-year scenarios,
and management commentary extracted from earnings transcripts.

## Build Stages
Stage 1 (in progress): React app, on-demand Claude analysis, Yahoo Finance
live prices, localStorage caching. No backend, no auth, no automation.

Stage 2 (not started): Python backend, SEC EDGAR filing monitor, scheduled
pipeline, Supabase persistence, optional auth for semi-public sharing.

## The 31-Stock Universe

### Space (9)
RKLB  Rocket Lab         — Launch + space systems; Neutron rocket Q4 2026 catalyst
PL    Planet Labs        — Earth observation SaaS; Google/NVIDIA AI satellite partnerships
RDW   Redwire            — Space hardware + defense autonomous systems
LUNR  Intuitive Machines — Lunar delivery; only commercial Moon landing success
ASTS  AST SpaceMobile    — Direct-to-phone satellite broadband constellation
KTOS  Kratos Defense     — Unmanned systems + satellite ground infrastructure
BKSY  BlackSky           — High-frequency Earth observation for defense/intel
FLY   Firefly Aerospace  — Small/medium launch + lunar lander (Blue Ghost)
SATS  EchoStar           — Satellite broadband; restructuring story

### AI Infrastructure (9)
NVDA  NVIDIA             — Dominant AI GPU; H100/Blackwell; ~80% accelerator share
PLTR  Palantir           — AI analytics for government and enterprise; AIP platform
CRWV  CoreWeave          — GPU cloud; $15.1B Microsoft contract; recently IPO'd
IREN  Iris Energy        — Bitcoin miner → Bare-Metal AI Cloud; $9.7B Microsoft deal
NBIS  Nebius Group       — Full-stack AI cloud; formerly Yandex; $27B Meta deal
CIFR  Cipher Mining      — Bitcoin miner; early-stage AI pivot; higher execution risk
RIOT  Riot Platforms     — Large-scale Bitcoin miner; AI pivot less advanced than peers
VRT   Vertiv             — Data center power + cooling; picks-and-shovels AI play
MOD   Modine             — Thermal management + data center cooling systems

### Clean Energy / Nuclear (10)
CEG   Constellation      — Largest US nuclear fleet; Three Mile Island restart
VST   Vistra             — Second-largest nuclear fleet; 20yr Meta PPA signed 2026
BWXT  BWX Technologies   — Naval reactor components + SMR; only Navy nuclear supplier
GEV   GE Vernova         — Power generation + grid; spun off GE 2024
BE    Bloom Energy        — Solid oxide fuel cells; $2.6B Nebius deal; fast-to-power
CCJ   Cameco             — World's largest public uranium producer; 15% global supply
LEU   Centrus Energy     — Only US HALEU enrichment licensee; $900M DOE contract
NXE   NexGen Energy      — Pre-production; Rook I = lowest-cost uranium deposit globally
OKLO  Oklo               — Pre-revenue microreactors; Sam Altman chairman; Meta deal
NNE   Nano Nuclear        — Pre-revenue portable microreactors; highly speculative

### Defense (3 + crossovers tagged above)
LHX   L3Harris           — Defense electronics + space sensors; Golden Dome candidate
AVAV  AeroVironment      — Small UAS + Switchblade loitering munition; proven in Ukraine
(KTOS and RDW are also tagged defense — see Space section above)

## Schema — Key Rules for Any Conversation

impliedUpsidePercent is NEVER stored. Always computed at render from
(analystConsensusTargetPrice / livePrice) - 1. Live price updates on
every page load; analyst target updates less often. This keeps it current.

status is computed at render from analyzedAt, never stored:
  "awaiting"  = analysis is null
  "analyzed"  = analyzedAt within 30 days
  "stale"     = analyzedAt more than 30 days ago

businessModel updates separately from financials. Only re-extract when
ticker is new or explicitly requested — not every earnings cycle.

segments is nullable. When null, skip segment charts entirely.

Two-call Claude pattern for analysis:
  Call 1 → structured JSON (financials, guidance, segments)
  Call 2 → narrative (management synthesis, scenarios, risks)

## Design System
Background #08090d · Surface #0f1117 · Border #1e2230
Text #e2e6f0 · Muted #8b93a8
Green #00e676 · Red #ff4b6e · Yellow #ffd166
Space Mono for data/labels · DM Sans for prose · Dark only

Sector colors:
  space #00c8ff · ai_infrastructure #a259ff · defense #f97316
  clean_energy #00e676 · lng_export #fbbf24 (reserved, not shown)

## APIs
Yahoo Finance  → /api/prices.ts (Vercel serverless, never browser-direct)
Anthropic API  → /api/analyze.ts (streaming, 10 calls/IP/hour rate limit)
SEC EDGAR      → Stage 2 only, not in scope yet

## Speculative Names — Different Analysis Treatment
OKLO, NNE, NXE: pre-revenue/pre-production. Focus analysis on milestones,
partnerships, burn rate, regulatory progress — not earnings financials.
CIFR, RIOT: still primarily Bitcoin miners. Be explicit about how far
along their AI pivot actually is vs. peers like IREN.

## Current Status (Stage 1)
Built: scaffold, schema, ticker config, Zustand store, PriceTable
       (mock data), Yahoo Finance serverless proxy, sector filter pills
Not yet built: live price wiring, /api/analyze.ts, StockDetail page,
               impliedUpsidePercent column, 52-week bar, sidebar, toasts
