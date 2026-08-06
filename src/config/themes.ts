// ─── Investment Theme Taxonomy ───────────────────────────────────────────────
// Two-tier thematic classification: Theme → SubTheme.
// SEPARATE from both the dashboard filter-pill Sector type (src/types/index.ts)
// and the portfolio GICS taxonomy (src/config/gics.ts). Do NOT conflate any of
// the three.
//
// This layer captures the four macro themes the portfolio is actually built
// around (space economy, AI infrastructure, defense, clean energy/nuclear) at a
// sub-theme granularity GICS sectors can't express — e.g. "small-sat / ISR"
// straddles GICS industrials AND communication_services, so no single GICS
// bucket captures it. Used to drive thematic-conviction reasoning in the
// cash-deploy and macro-risk prompts.
//
// Mirrors the structure of gics.ts: a type pair, display maps, a static
// ticker map for the tracked universe, and a classify helper that returns null
// for anything off-universe (external positions get no auto theme).
// ─────────────────────────────────────────────────────────────────────────────

import { SECTOR_COLORS } from '../types';

export type Theme =
  | 'space_economy'
  | 'ai_infrastructure'
  | 'defense'
  | 'clean_energy_nuclear';

export type SubTheme =
  // Space economy
  | 'launch_and_space_systems'
  | 'satellite_and_earth_observation'
  // AI infrastructure
  | 'ai_compute_and_semis'
  | 'ai_power_and_cooling'
  | 'ai_applications'
  | 'hyperscale_cloud'
  | 'ai_networking_and_hardware'
  | 'cybersecurity'
  // Defense
  | 'aerospace_defense_primes'
  | 'small_sat_and_isr'
  | 'unmanned_systems'
  // Clean energy / nuclear
  | 'utility_nuclear_operators'
  | 'nuclear_components_and_fuel'
  | 'advanced_reactors'
  | 'grid_and_alt_generation';

// ─── Display config ──────────────────────────────────────────────────────────

export const THEME_DISPLAY: Record<Theme, string> = {
  space_economy:        'Space Economy',
  ai_infrastructure:    'AI Infrastructure',
  defense:              'Defense',
  clean_energy_nuclear: 'Clean Energy & Nuclear',
};

export const SUBTHEME_DISPLAY: Record<SubTheme, { label: string; parent: Theme }> = {
  // Space economy
  launch_and_space_systems:        { label: 'Launch & Space Systems',         parent: 'space_economy' },
  satellite_and_earth_observation: { label: 'Satellite & Earth Observation',  parent: 'space_economy' },
  // AI infrastructure
  ai_compute_and_semis:            { label: 'AI Compute & Semis',             parent: 'ai_infrastructure' },
  ai_power_and_cooling:            { label: 'AI Power & Cooling',             parent: 'ai_infrastructure' },
  ai_applications:                 { label: 'AI Applications & Platforms',    parent: 'ai_infrastructure' },
  hyperscale_cloud:                { label: 'Hyperscale Cloud',               parent: 'ai_infrastructure' },
  ai_networking_and_hardware:      { label: 'AI Networking & Hardware',       parent: 'ai_infrastructure' },
  cybersecurity:                   { label: 'Cybersecurity',                  parent: 'ai_infrastructure' },
  // Defense
  aerospace_defense_primes:        { label: 'Aerospace & Defense Primes',     parent: 'defense' },
  small_sat_and_isr:               { label: 'Small-Sat & ISR',               parent: 'defense' },
  unmanned_systems:                { label: 'Unmanned Systems',              parent: 'defense' },
  // Clean energy / nuclear
  utility_nuclear_operators:       { label: 'Utility Nuclear Operators',      parent: 'clean_energy_nuclear' },
  nuclear_components_and_fuel:     { label: 'Nuclear Components & Fuel',      parent: 'clean_energy_nuclear' },
  advanced_reactors:               { label: 'Advanced Reactors (Pre-rev.)',  parent: 'clean_energy_nuclear' },
  grid_and_alt_generation:         { label: 'Grid & Alt Generation',         parent: 'clean_energy_nuclear' },
};

// Reuse the canonical dashboard sector colors so the theme layer reads as the
// same visual system as the rest of the app — do NOT redefine these hexes.
export const THEME_COLORS: Record<Theme, string> = {
  space_economy:        SECTOR_COLORS.space,             // #00c8ff cyan
  ai_infrastructure:    SECTOR_COLORS.ai_infrastructure, // #a259ff violet
  defense:              SECTOR_COLORS.defense,           // #f97316 orange
  clean_energy_nuclear: SECTOR_COLORS.clean_energy,      // #00e676 green
};

// Stable render order — matches THEME_DISPLAY declaration order.
export const THEME_ORDER: Theme[] = [
  'space_economy',
  'ai_infrastructure',
  'defense',
  'clean_energy_nuclear',
];

// ─── Universe ticker → theme map (authoritative) ─────────────────────────────
// Every entry gets exactly ONE primary theme/sub-theme, mirroring how
// tickers.ts assigns a primary sector with crossovers noted in comments.
//
// Crossover names — RDW, BKSY (space ↔ defense small-sat/ISR) and KTOS
// (defense small-sat/ISR, with a space ground-infrastructure crossover) — are
// resolved to a single primary theme here. RDW/BKSY are primarily space-economy
// hardware/imaging plays; KTOS is primarily a defense name. This keeps thematic
// weight aggregation single-counted, the same way sector membership is.

export const TICKER_THEME_MAP: Record<string, { theme: Theme; subTheme: SubTheme }> = {
  // ── Space economy ──
  RKLB: { theme: 'space_economy', subTheme: 'launch_and_space_systems' },
  FLY:  { theme: 'space_economy', subTheme: 'launch_and_space_systems' },
  RDW:  { theme: 'space_economy', subTheme: 'launch_and_space_systems' }, // crossover: defense (small_sat_and_isr)
  LUNR: { theme: 'space_economy', subTheme: 'launch_and_space_systems' },
  ASTS: { theme: 'space_economy', subTheme: 'satellite_and_earth_observation' },
  PL:   { theme: 'space_economy', subTheme: 'satellite_and_earth_observation' },
  BKSY: { theme: 'space_economy', subTheme: 'satellite_and_earth_observation' }, // crossover: defense (small_sat_and_isr)
  SPCX: { theme: 'space_economy', subTheme: 'launch_and_space_systems' }, // crossover: ai_infrastructure via xAI/Colossus

  // ── AI infrastructure ──
  NVDA: { theme: 'ai_infrastructure', subTheme: 'ai_compute_and_semis' },
  CRWV: { theme: 'ai_infrastructure', subTheme: 'ai_compute_and_semis' },
  IREN: { theme: 'ai_infrastructure', subTheme: 'ai_compute_and_semis' },
  NBIS: { theme: 'ai_infrastructure', subTheme: 'ai_compute_and_semis' },
  CIFR: { theme: 'ai_infrastructure', subTheme: 'ai_compute_and_semis' },
  RIOT: { theme: 'ai_infrastructure', subTheme: 'ai_compute_and_semis' },
  VRT:  { theme: 'ai_infrastructure', subTheme: 'ai_power_and_cooling' },
  MOD:  { theme: 'ai_infrastructure', subTheme: 'ai_power_and_cooling' },
  PLTR: { theme: 'ai_infrastructure', subTheme: 'ai_applications' },
  MSFT: { theme: 'ai_infrastructure', subTheme: 'hyperscale_cloud' },
  GOOGL:{ theme: 'ai_infrastructure', subTheme: 'hyperscale_cloud' },
  AMZN: { theme: 'ai_infrastructure', subTheme: 'hyperscale_cloud' },
  META: { theme: 'ai_infrastructure', subTheme: 'hyperscale_cloud' },
  ANET: { theme: 'ai_infrastructure', subTheme: 'ai_networking_and_hardware' },
  MU:   { theme: 'ai_infrastructure', subTheme: 'ai_compute_and_semis' },
  SMCI: { theme: 'ai_infrastructure', subTheme: 'ai_networking_and_hardware' },
  AVGO: { theme: 'ai_infrastructure', subTheme: 'ai_compute_and_semis' },
  INTC: { theme: 'ai_infrastructure', subTheme: 'ai_compute_and_semis' },
  DELL: { theme: 'ai_infrastructure', subTheme: 'ai_networking_and_hardware' },
  PWR:  { theme: 'ai_infrastructure', subTheme: 'ai_power_and_cooling' }, // crossover: clean_energy_nuclear grid work
  ETN:  { theme: 'ai_infrastructure', subTheme: 'ai_power_and_cooling' },
  EQIX: { theme: 'ai_infrastructure', subTheme: 'ai_power_and_cooling' },
  GNRC: { theme: 'ai_infrastructure', subTheme: 'ai_power_and_cooling' },
  CRWD: { theme: 'ai_infrastructure', subTheme: 'cybersecurity' },
  PANW: { theme: 'ai_infrastructure', subTheme: 'cybersecurity' },
  NET:  { theme: 'ai_infrastructure', subTheme: 'cybersecurity' },
  ZS:   { theme: 'ai_infrastructure', subTheme: 'cybersecurity' },
  FTNT: { theme: 'ai_infrastructure', subTheme: 'cybersecurity' },

  // ── Defense ──
  LHX:  { theme: 'defense', subTheme: 'aerospace_defense_primes' },
  KTOS: { theme: 'defense', subTheme: 'small_sat_and_isr' }, // crossover: space ground infrastructure
  AVAV: { theme: 'defense', subTheme: 'unmanned_systems' },

  // ── Clean energy / nuclear ──
  CEG:  { theme: 'clean_energy_nuclear', subTheme: 'utility_nuclear_operators' },
  VST:  { theme: 'clean_energy_nuclear', subTheme: 'utility_nuclear_operators' },
  BWXT: { theme: 'clean_energy_nuclear', subTheme: 'nuclear_components_and_fuel' },
  CCJ:  { theme: 'clean_energy_nuclear', subTheme: 'nuclear_components_and_fuel' },
  LEU:  { theme: 'clean_energy_nuclear', subTheme: 'nuclear_components_and_fuel' },
  OKLO: { theme: 'clean_energy_nuclear', subTheme: 'advanced_reactors' },
  NNE:  { theme: 'clean_energy_nuclear', subTheme: 'advanced_reactors' },
  NXE:  { theme: 'clean_energy_nuclear', subTheme: 'advanced_reactors' },
  GEV:  { theme: 'clean_energy_nuclear', subTheme: 'grid_and_alt_generation' },
  BE:   { theme: 'clean_energy_nuclear', subTheme: 'grid_and_alt_generation' },
};

// ─── Classify ────────────────────────────────────────────────────────────────
// Returns null for anything outside the tracked universe. External/manual
// positions deliberately get no auto theme — they aggregate into no theme
// bucket (surfaced as untracked in the thematic panel).

export function classifyTickerTheme(ticker: string): { theme: Theme; subTheme: SubTheme } | null {
  return TICKER_THEME_MAP[ticker.toUpperCase()] ?? null;
}

export function getSubThemes(theme: Theme): SubTheme[] {
  return (Object.keys(SUBTHEME_DISPLAY) as SubTheme[]).filter(
    st => SUBTHEME_DISPLAY[st].parent === theme,
  );
}
