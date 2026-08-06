import type { TickerConfig } from '../types';

// ── Sector filter logic depends on sectors[0] being the PRIMARY sector. ──────
// Crossover tags come second and are displayed on rows but do not drive
// sector tab membership. Keep this ordering intentional for every entry.

export const TICKERS: TickerConfig[] = [
  // ── Space (9) ────────────────────────────────────────────────────────────
  {
    ticker: 'RKLB',
    name: 'Rocket Lab',
    sectors: ['space', 'defense'],
    description: 'End-to-end space company; Electron launch vehicle and Neutron in development',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'PL',
    name: 'Planet Labs',
    sectors: ['space', 'defense'],
    description: 'Daily Earth-imaging satellite constellation; defense and commercial data analytics',
    fiscalYearEnd: 'January',
  },
  {
    ticker: 'RDW',
    name: 'Redwire',
    sectors: ['space', 'defense'],
    description: 'Space infrastructure manufacturer; solar arrays, structures, and payloads',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'LUNR',
    name: 'Intuitive Machines',
    sectors: ['space', 'defense'],
    description: 'Lunar delivery and surface operations services; NASA prime contractor',
    fiscalYearEnd: 'December',
    specialNotes: 'Only commercial company to successfully land on the Moon',
  },
  {
    ticker: 'ASTS',
    name: 'AST SpaceMobile',
    sectors: ['space'],
    description: 'Building direct-to-smartphone satellite broadband constellation',
    fiscalYearEnd: 'December',
    specialNotes: 'BlueBird constellation; AT&T and Verizon commercial agreements',
  },
  {
    ticker: 'BKSY',
    name: 'BlackSky',
    sectors: ['space', 'defense'],
    description: 'High-frequency Earth observation constellation; defense and intelligence focus',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'FLY',
    name: 'Firefly Aerospace',
    sectors: ['space'],
    description: 'Small/medium launch vehicles and lunar landers; Blue Ghost Moon mission',
    fiscalYearEnd: 'December',
    specialNotes: '$75M NASA subcontract (May 2026) for MoonFall lunar drone delivery (2028)',
  },
  {
    ticker: 'KTOS',
    name: 'Kratos Defense',
    // Primary sector is defense; space is crossover (satellite ground infrastructure)
    sectors: ['defense', 'space'],
    description: 'Unmanned systems, satellites, and high-performance electronics for US military',
    fiscalYearEnd: 'December',
    specialNotes: 'Drone and hypersonics programs; HASTE competitor to RKLB',
  },
  {
    ticker: 'SPCX',
    name: 'SpaceX (Space Exploration Technologies)',
    sectors: ['space', 'ai_infrastructure'],
    description: 'Reusable rockets, Starship, and Starlink satellite broadband',
    fiscalYearEnd: 'December',
    specialNotes: "IPO'd on Nasdaq June 2026. Acquired xAI (Grok) in early 2026, adding a gigawatt-scale AI data center business (Colossus) — the source of the ai_infrastructure crossover tag.",
  },

  // ── AI Infrastructure (9) ─────────────────────────────────────────────────
  {
    ticker: 'NVDA',
    name: 'Nvidia',
    sectors: ['ai_infrastructure'],
    description: 'GPU leader for AI training and inference; CUDA ecosystem dominance',
    fiscalYearEnd: 'January',
  },
  {
    ticker: 'PLTR',
    name: 'Palantir',
    // Primary sector is ai_infrastructure; defense is crossover
    sectors: ['ai_infrastructure', 'defense'],
    description: 'AI and data analytics platform for defense and commercial enterprise; AIP platform',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'CRWV',
    name: 'CoreWeave',
    sectors: ['ai_infrastructure'],
    description: "GPU cloud; $15.1B Microsoft contract; recently IPO'd",
    fiscalYearEnd: 'December',
    specialNotes: 'GPU-accelerated cloud infrastructure for AI workloads; Nvidia-backed',
  },
  {
    ticker: 'IREN',
    name: 'Iris Energy',
    // Primary sector is ai_infrastructure; clean_energy is crossover (renewable-powered)
    sectors: ['ai_infrastructure', 'clean_energy'],
    description: 'Bitcoin miner → Bare-Metal AI Cloud; $9.7B Microsoft deal; renewable-powered',
    fiscalYearEnd: 'June',
  },
  {
    ticker: 'NBIS',
    name: 'Nebius Group',
    sectors: ['ai_infrastructure'],
    description: 'Full-stack AI cloud; formerly Yandex; $27B Meta deal',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'CIFR',
    name: 'Cipher Mining',
    sectors: ['ai_infrastructure'],
    description: 'Bitcoin miner; early-stage AI pivot; higher execution risk than peers',
    fiscalYearEnd: 'December',
    specialNotes: 'AI pivot less advanced than IREN — still primarily a Bitcoin miner',
  },
  {
    ticker: 'RIOT',
    name: 'Riot Platforms',
    sectors: ['ai_infrastructure'],
    description: 'Large-scale Bitcoin miner; AI pivot less advanced than IREN',
    fiscalYearEnd: 'December',
    specialNotes: 'AI pivot less advanced than IREN — still primarily a Bitcoin miner',
  },
  {
    ticker: 'VRT',
    name: 'Vertiv',
    sectors: ['ai_infrastructure'],
    description: 'Data center power and cooling infrastructure; picks-and-shovels AI play',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'MOD',
    name: 'Modine',
    sectors: ['ai_infrastructure'],
    description: 'Thermal management and data center cooling systems',
    fiscalYearEnd: 'March',
  },

  // ── Clean Energy / Nuclear (10) ───────────────────────────────────────────
  {
    ticker: 'CEG',
    name: 'Constellation Energy',
    // Primary sector is clean_energy; ai_infrastructure is crossover (clean power for AI data centers)
    sectors: ['clean_energy', 'ai_infrastructure'],
    description: 'Largest US nuclear fleet; Three Mile Island restart; clean power for AI',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'VST',
    name: 'Vistra Energy',
    sectors: ['clean_energy', 'ai_infrastructure'],
    description: 'Second-largest nuclear fleet; 20yr Meta PPA signed 2026',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'BWXT',
    name: 'BWX Technologies',
    // Primary sector is clean_energy; defense is crossover (naval reactors)
    sectors: ['clean_energy', 'defense'],
    description: 'Naval reactor components and SMR developer; only Navy nuclear supplier',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'GEV',
    name: 'GE Vernova',
    sectors: ['clean_energy'],
    description: 'Power generation and grid infrastructure; spun off from GE in 2024',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'BE',
    name: 'Bloom Energy',
    sectors: ['clean_energy'],
    description: 'Solid oxide fuel cells; $2.6B Nebius deal; fast-to-power for data centers',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'CCJ',
    name: 'Cameco',
    sectors: ['clean_energy'],
    description: "World's largest publicly traded uranium producer; ~15% of global supply",
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'LEU',
    name: 'Centrus Energy',
    // Primary sector is clean_energy; defense is crossover (HALEU for naval/weapons programs)
    sectors: ['clean_energy', 'defense'],
    description: 'Only US HALEU enrichment licensee; $900M DOE contract',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'NXE',
    name: 'NexGen Energy',
    sectors: ['clean_energy'],
    description: 'Pre-production; Rook I = lowest-cost uranium deposit globally',
    fiscalYearEnd: 'December',
    specialNotes: 'Pre-production uranium — focus analysis on milestones and regulatory progress',
  },
  {
    ticker: 'OKLO',
    name: 'Oklo',
    // Primary sector is clean_energy; ai_infrastructure is crossover (Meta data center deal)
    sectors: ['clean_energy', 'ai_infrastructure'],
    description: 'Pre-revenue microreactors; Sam Altman chairman; Meta deal for Ohio data center',
    fiscalYearEnd: 'December',
    specialNotes: 'Pre-revenue — focus analysis on milestones, partnerships, burn rate',
  },
  {
    ticker: 'NNE',
    name: 'Nano Nuclear',
    sectors: ['clean_energy'],
    description: 'Pre-revenue portable microreactors; highly speculative early-stage',
    fiscalYearEnd: 'December',
    specialNotes: 'Pre-revenue — focus analysis on milestones, partnerships, burn rate',
  },

  // ── Defense (pure-play; crossovers listed above in their primary sectors) ──
  {
    ticker: 'LHX',
    name: 'L3Harris',
    // Primary sector is defense; space is crossover (sensors + Golden Dome)
    sectors: ['defense', 'space'],
    description: 'Defense electronics and space sensors; Golden Dome candidate',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'AVAV',
    name: 'AeroVironment',
    sectors: ['defense'],
    description: 'Small UAS and Switchblade loitering munition; proven combat use in Ukraine',
    fiscalYearEnd: 'April',
  },

  // ── AI Infrastructure: Hyperscalers (4) ──────────────────────────────────
  {
    ticker: 'MSFT',
    name: 'Microsoft',
    sectors: ['ai_infrastructure'],
    description: 'Azure hyperscaler; largest OpenAI infrastructure partner and backer',
    fiscalYearEnd: 'June',
  },
  {
    ticker: 'GOOGL',
    name: 'Alphabet',
    sectors: ['ai_infrastructure'],
    description: 'Google Cloud hyperscaler; custom TPU silicon and Gemini models',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'AMZN',
    name: 'Amazon',
    sectors: ['ai_infrastructure'],
    description: 'AWS hyperscaler; Trainium/Inferentia custom AI chips, Anthropic partnership',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'META',
    name: 'Meta Platforms',
    sectors: ['ai_infrastructure'],
    description: 'Self-build AI infrastructure at hyperscale; Llama models, massive GPU capex',
    fiscalYearEnd: 'December',
  },

  // ── AI Infrastructure: Compute, Networking & Hardware (6) ─────────────────
  {
    ticker: 'ANET',
    name: 'Arista Networks',
    sectors: ['ai_infrastructure'],
    description: 'High-speed networking switches for AI data center clusters',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'MU',
    name: 'Micron Technology',
    sectors: ['ai_infrastructure'],
    description: 'HBM and DRAM memory supplier for AI accelerators',
    fiscalYearEnd: 'August',
  },
  {
    ticker: 'SMCI',
    name: 'Super Micro Computer',
    sectors: ['ai_infrastructure'],
    description: 'AI server and rack integration; Nvidia reference-design manufacturer',
    fiscalYearEnd: 'June',
  },
  {
    ticker: 'AVGO',
    name: 'Broadcom',
    sectors: ['ai_infrastructure'],
    description: 'Custom AI ASICs (Google TPU, Meta MTIA) and networking silicon',
    fiscalYearEnd: 'October',
  },
  {
    ticker: 'INTC',
    name: 'Intel',
    sectors: ['ai_infrastructure'],
    description: 'x86 CPUs and Gaudi AI accelerators; 18A foundry buildout',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'DELL',
    name: 'Dell Technologies',
    sectors: ['ai_infrastructure'],
    description: 'AI server and infrastructure integrator with a large enterprise AI backlog',
    fiscalYearEnd: 'January',
  },

  // ── AI Infrastructure: Power & Buildout (4) ──────────────────────────────
  {
    ticker: 'PWR',
    name: 'Quanta Services',
    sectors: ['ai_infrastructure', 'clean_energy'],
    description: 'Electrical grid and power infrastructure construction for data centers and utilities',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'ETN',
    name: 'Eaton Corporation',
    sectors: ['ai_infrastructure'],
    description: 'Electrical power management and distribution equipment for data centers',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'EQIX',
    name: 'Equinix',
    sectors: ['ai_infrastructure'],
    description: 'Data center colocation and interconnection REIT; direct AI infrastructure landlord',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'GNRC',
    name: 'Generac Holdings',
    sectors: ['ai_infrastructure'],
    description: 'Backup power generators and energy systems for data center resilience',
    fiscalYearEnd: 'December',
  },

  // ── Cyber (5) ─────────────────────────────────────────────────────────────
  {
    ticker: 'CRWD',
    name: 'CrowdStrike',
    sectors: ['cyber'],
    description: 'Cloud-native endpoint detection and response; Falcon platform',
    fiscalYearEnd: 'January',
  },
  {
    ticker: 'PANW',
    name: 'Palo Alto Networks',
    sectors: ['cyber'],
    description: 'Network security platform; increasingly AI-driven SOC tooling',
    fiscalYearEnd: 'July',
  },
  {
    ticker: 'NET',
    name: 'Cloudflare',
    sectors: ['cyber'],
    description: 'Edge network security and performance; growing AI inference/edge compute business',
    fiscalYearEnd: 'December',
  },
  {
    ticker: 'ZS',
    name: 'Zscaler',
    sectors: ['cyber'],
    description: 'Cloud-native zero trust security platform',
    fiscalYearEnd: 'July',
  },
  {
    ticker: 'FTNT',
    name: 'Fortinet',
    sectors: ['cyber'],
    description: 'Network security hardware and software; SASE and firewall appliances',
    fiscalYearEnd: 'December',
  },
];

export const TICKER_MAP = Object.fromEntries(
  TICKERS.map((t) => [t.ticker, t]),
) as Record<string, TickerConfig>;

export const ALL_TICKERS = TICKERS.map((t) => t.ticker);