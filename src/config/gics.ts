// ─── GICS Sector Taxonomy ────────────────────────────────────────────────────
// Two-tier classification: TopLevelSector → SubSector
// Follows GICS (Global Industry Classification Standard) conventions.
// Used by PortfolioTab to classify both universe tickers and external positions.
//
// IMPORTANT: The dashboard filter pills (SPACE / AI INFRA / DEFENSE / CLEAN ENERGY)
// use the legacy tickers.ts Sector type and are NOT changed by this file.
// This taxonomy is portfolio-only.
// ─────────────────────────────────────────────────────────────────────────────

export type TopLevelSector =
  | 'industrials'
  | 'information_technology'
  | 'energy'
  | 'communication_services'
  | 'consumer_discretionary'
  | 'consumer_staples'
  | 'financials'
  | 'health_care'
  | 'materials'
  | 'real_estate'
  | 'utilities'
  | 'diversified'
  | 'other';

export type SubSector =
  // Industrials
  | 'aerospace_defense'
  | 'space_launch'
  | 'space_systems'
  | 'commercial_services'
  | 'industrial_machinery'
  | 'transportation'
  | 'electrical_equipment'
  | 'construction_engineering'
  | 'waste_management'
  | 'staffing'
  // Information Technology
  | 'semiconductors'
  | 'semiconductor_equipment'
  | 'it_services'
  | 'internet_infrastructure'
  | 'software'
  | 'hardware'
  | 'electronic_equipment'
  // Energy
  | 'nuclear_power'
  | 'nuclear_components'
  | 'power_equipment'
  | 'fuel_cells'
  | 'uranium_mining'
  | 'advanced_reactors'
  | 'oil_gas_exploration'
  | 'oil_gas_refining'
  | 'oil_gas_equipment'
  | 'oil_gas_midstream'
  | 'renewable_energy'
  // Communication Services
  | 'satellite_comms'
  | 'earth_observation'
  | 'telecom_services'
  | 'wireless_telecom'
  | 'media_entertainment'
  | 'interactive_media'
  | 'publishing'
  // Consumer Discretionary
  | 'auto_manufacturers'
  | 'auto_components'
  | 'retail'
  | 'ecommerce'
  | 'hotels_restaurants'
  | 'leisure'
  | 'homebuilding'
  | 'luxury'
  // Consumer Staples
  | 'food_beverage'
  | 'household_products'
  | 'tobacco'
  | 'drug_retail'
  | 'food_retail'
  // Financials
  | 'banks'
  | 'capital_markets'
  | 'insurance'
  | 'fintech'
  | 'asset_management'
  | 'consumer_finance'
  | 'mortgage_reits'
  // Health Care
  | 'pharma'
  | 'biotech'
  | 'medical_devices'
  | 'health_services'
  | 'life_sciences'
  | 'dental_vision'
  // Materials
  | 'mining'
  | 'chemicals'
  | 'metals_steel'
  | 'construction_materials'
  | 'packaging'
  | 'paper_forest'
  // Real Estate
  | 'data_center_reits'
  | 'office_reits'
  | 'residential_reits'
  | 'industrial_reits'
  | 'retail_reits'
  | 'healthcare_reits'
  | 'cell_tower_reits'
  // Utilities
  | 'electric_utilities'
  | 'gas_utilities'
  | 'water_utilities'
  | 'multi_utilities';

export interface SectorTag {
  sector: TopLevelSector;
  subSector: SubSector | null;
}

// ─── Display config ───────────────────────────────────────────────────────────

export const SECTOR_DISPLAY: Record<TopLevelSector, { label: string; color: string }> = {
  industrials:             { label: 'Industrials',        color: '#f97316' },
  information_technology:  { label: 'Info Tech',          color: '#a259ff' },
  energy:                  { label: 'Energy',             color: '#00e676' },
  communication_services:  { label: 'Comm Services',      color: '#00c8ff' },
  consumer_discretionary:  { label: 'Consumer Disc.',     color: '#f59e0b' },
  consumer_staples:        { label: 'Consumer Staples',   color: '#84cc16' },
  financials:              { label: 'Financials',         color: '#fbbf24' },
  health_care:             { label: 'Health Care',        color: '#06b6d4' },
  materials:               { label: 'Materials',          color: '#a78bfa' },
  real_estate:             { label: 'Real Estate',        color: '#fb923c' },
  utilities:               { label: 'Utilities',          color: '#34d399' },
  diversified:             { label: 'Diversified Fund',   color: '#94a3b8' },
  other:                   { label: 'Other',              color: '#8b93a8' },
};

export const SUBSECTOR_DISPLAY: Record<SubSector, { label: string; parent: TopLevelSector }> = {
  // Industrials
  aerospace_defense:       { label: 'Aerospace & Defense',           parent: 'industrials' },
  space_launch:            { label: 'Space Launch & Vehicles',        parent: 'industrials' },
  space_systems:           { label: 'Space Systems & Hardware',       parent: 'industrials' },
  commercial_services:     { label: 'Commercial Services',            parent: 'industrials' },
  industrial_machinery:    { label: 'Industrial Machinery',           parent: 'industrials' },
  transportation:          { label: 'Transportation & Logistics',     parent: 'industrials' },
  electrical_equipment:    { label: 'Electrical Equipment',           parent: 'industrials' },
  construction_engineering:{ label: 'Construction & Engineering',     parent: 'industrials' },
  waste_management:        { label: 'Waste & Environmental Services', parent: 'industrials' },
  staffing:                { label: 'Staffing & Employment',          parent: 'industrials' },
  // Information Technology
  semiconductors:          { label: 'Semiconductors',                 parent: 'information_technology' },
  semiconductor_equipment: { label: 'Semiconductor Equipment',        parent: 'information_technology' },
  it_services:             { label: 'IT Services & AI Platforms',     parent: 'information_technology' },
  internet_infrastructure: { label: 'Internet Infrastructure & Cloud',parent: 'information_technology' },
  software:                { label: 'Software',                       parent: 'information_technology' },
  hardware:                { label: 'Technology Hardware',            parent: 'information_technology' },
  electronic_equipment:    { label: 'Electronic Equip. & Instruments',parent: 'information_technology' },
  // Energy
  nuclear_power:           { label: 'Nuclear Power Generation',       parent: 'energy' },
  nuclear_components:      { label: 'Nuclear Components & Services',  parent: 'energy' },
  power_equipment:         { label: 'Power & Grid Equipment',         parent: 'energy' },
  fuel_cells:              { label: 'Fuel Cell Technology',           parent: 'energy' },
  uranium_mining:          { label: 'Uranium Mining & Enrichment',    parent: 'energy' },
  advanced_reactors:       { label: 'Advanced Reactors (Pre-rev.)',   parent: 'energy' },
  oil_gas_exploration:     { label: 'Oil & Gas Exploration',          parent: 'energy' },
  oil_gas_refining:        { label: 'Oil & Gas Refining',             parent: 'energy' },
  oil_gas_equipment:       { label: 'Oil & Gas Equipment & Services', parent: 'energy' },
  oil_gas_midstream:       { label: 'Oil & Gas Midstream & Pipelines',parent: 'energy' },
  renewable_energy:        { label: 'Renewable Energy',               parent: 'energy' },
  // Communication Services
  satellite_comms:         { label: 'Satellite Communications',       parent: 'communication_services' },
  earth_observation:       { label: 'Earth Observation & Geospatial', parent: 'communication_services' },
  telecom_services:        { label: 'Telecom Services',               parent: 'communication_services' },
  wireless_telecom:        { label: 'Wireless Telecom',               parent: 'communication_services' },
  media_entertainment:     { label: 'Media & Entertainment',          parent: 'communication_services' },
  interactive_media:       { label: 'Interactive Media & Services',   parent: 'communication_services' },
  publishing:              { label: 'Publishing & Information',        parent: 'communication_services' },
  // Consumer Discretionary
  auto_manufacturers:      { label: 'Auto Manufacturers',             parent: 'consumer_discretionary' },
  auto_components:         { label: 'Auto Components',                parent: 'consumer_discretionary' },
  retail:                  { label: 'Specialty Retail',               parent: 'consumer_discretionary' },
  ecommerce:               { label: 'E-Commerce & Internet Retail',   parent: 'consumer_discretionary' },
  hotels_restaurants:      { label: 'Hotels, Restaurants & Leisure',  parent: 'consumer_discretionary' },
  leisure:                 { label: 'Leisure & Recreation',           parent: 'consumer_discretionary' },
  homebuilding:            { label: 'Homebuilding',                   parent: 'consumer_discretionary' },
  luxury:                  { label: 'Luxury Goods',                   parent: 'consumer_discretionary' },
  // Consumer Staples
  food_beverage:           { label: 'Food & Beverage',               parent: 'consumer_staples' },
  household_products:      { label: 'Household Products',            parent: 'consumer_staples' },
  tobacco:                 { label: 'Tobacco',                        parent: 'consumer_staples' },
  drug_retail:             { label: 'Drug Retail & Pharmacy',         parent: 'consumer_staples' },
  food_retail:             { label: 'Food Retail & Distribution',     parent: 'consumer_staples' },
  // Financials
  banks:                   { label: 'Banks',                          parent: 'financials' },
  capital_markets:         { label: 'Capital Markets',               parent: 'financials' },
  insurance:               { label: 'Insurance',                     parent: 'financials' },
  fintech:                 { label: 'Fintech & Payments',            parent: 'financials' },
  asset_management:        { label: 'Asset Management',              parent: 'financials' },
  consumer_finance:        { label: 'Consumer Finance',              parent: 'financials' },
  mortgage_reits:          { label: 'Mortgage REITs',                parent: 'financials' },
  // Health Care
  pharma:                  { label: 'Pharmaceuticals',               parent: 'health_care' },
  biotech:                 { label: 'Biotechnology',                  parent: 'health_care' },
  medical_devices:         { label: 'Medical Devices',               parent: 'health_care' },
  health_services:         { label: 'Health Care Services',          parent: 'health_care' },
  life_sciences:           { label: 'Life Sciences Tools',           parent: 'health_care' },
  dental_vision:           { label: 'Dental & Vision Benefits',      parent: 'health_care' },
  // Materials
  mining:                  { label: 'Mining',                        parent: 'materials' },
  chemicals:               { label: 'Chemicals',                     parent: 'materials' },
  metals_steel:            { label: 'Metals & Steel',                parent: 'materials' },
  construction_materials:  { label: 'Construction Materials',        parent: 'materials' },
  packaging:               { label: 'Packaging & Containers',        parent: 'materials' },
  paper_forest:            { label: 'Paper & Forest Products',       parent: 'materials' },
  // Real Estate
  data_center_reits:       { label: 'Data Center REITs',             parent: 'real_estate' },
  office_reits:            { label: 'Office REITs',                  parent: 'real_estate' },
  residential_reits:       { label: 'Residential REITs',             parent: 'real_estate' },
  industrial_reits:        { label: 'Industrial REITs',              parent: 'real_estate' },
  retail_reits:            { label: 'Retail REITs',                  parent: 'real_estate' },
  healthcare_reits:        { label: 'Health Care REITs',             parent: 'real_estate' },
  cell_tower_reits:        { label: 'Cell Tower REITs',              parent: 'real_estate' },
  // Utilities
  electric_utilities:      { label: 'Electric Utilities',            parent: 'utilities' },
  gas_utilities:           { label: 'Gas Utilities',                 parent: 'utilities' },
  water_utilities:         { label: 'Water Utilities',               parent: 'utilities' },
  multi_utilities:         { label: 'Multi-Utilities',               parent: 'utilities' },
};

// ─── 31-stock universe mapping (authoritative) ────────────────────────────────

export const UNIVERSE_SECTOR_MAP: Record<string, SectorTag> = {
  RKLB: { sector: 'industrials',            subSector: 'space_launch' },
  FLY:  { sector: 'industrials',            subSector: 'space_launch' },
  RDW:  { sector: 'industrials',            subSector: 'space_systems' },
  LUNR: { sector: 'industrials',            subSector: 'space_systems' },
  KTOS: { sector: 'industrials',            subSector: 'aerospace_defense' },
  LHX:  { sector: 'industrials',            subSector: 'aerospace_defense' },
  AVAV: { sector: 'industrials',            subSector: 'aerospace_defense' },
  ASTS: { sector: 'communication_services', subSector: 'satellite_comms' },
  SATS: { sector: 'communication_services', subSector: 'satellite_comms' },
  PL:   { sector: 'communication_services', subSector: 'earth_observation' },
  BKSY: { sector: 'communication_services', subSector: 'earth_observation' },
  NVDA: { sector: 'information_technology', subSector: 'semiconductors' },
  PLTR: { sector: 'information_technology', subSector: 'it_services' },
  CRWV: { sector: 'information_technology', subSector: 'internet_infrastructure' },
  IREN: { sector: 'information_technology', subSector: 'internet_infrastructure' },
  NBIS: { sector: 'information_technology', subSector: 'internet_infrastructure' },
  CIFR: { sector: 'information_technology', subSector: 'internet_infrastructure' },
  RIOT: { sector: 'information_technology', subSector: 'internet_infrastructure' },
  VRT:  { sector: 'information_technology', subSector: 'electronic_equipment' },
  MOD:  { sector: 'information_technology', subSector: 'electronic_equipment' },
  CEG:  { sector: 'energy',                 subSector: 'nuclear_power' },
  VST:  { sector: 'energy',                 subSector: 'nuclear_power' },
  BWXT: { sector: 'energy',                 subSector: 'nuclear_components' },
  GEV:  { sector: 'energy',                 subSector: 'power_equipment' },
  BE:   { sector: 'energy',                 subSector: 'fuel_cells' },
  CCJ:  { sector: 'energy',                 subSector: 'uranium_mining' },
  LEU:  { sector: 'energy',                 subSector: 'uranium_mining' },
  NXE:  { sector: 'energy',                 subSector: 'uranium_mining' },
  OKLO: { sector: 'energy',                 subSector: 'advanced_reactors' },
  NNE:  { sector: 'energy',                 subSector: 'advanced_reactors' },
};

// ─── Extended known-ticker database (~800 tickers) ────────────────────────────
// Covers S&P 500, Russell 1000 additions, popular ETFs, speculative names.
// Maintenance: add new entries at bottom of each section. No runtime cost.

const KNOWN_TICKERS: Record<string, SectorTag> = {

  // ══════════════════════════════════════════════════════════════════════
  // INFORMATION TECHNOLOGY
  // ══════════════════════════════════════════════════════════════════════

  // Hardware & Devices
  AAPL:  { sector: 'information_technology', subSector: 'hardware' },
  SMCI:  { sector: 'information_technology', subSector: 'hardware' },
  HPQ:   { sector: 'information_technology', subSector: 'hardware' },
  HPE:   { sector: 'information_technology', subSector: 'hardware' },
  DELL:  { sector: 'information_technology', subSector: 'hardware' },
  NCR:   { sector: 'information_technology', subSector: 'hardware' },
  NTAP:  { sector: 'information_technology', subSector: 'hardware' },
  STX:   { sector: 'information_technology', subSector: 'hardware' },
  WDC:   { sector: 'information_technology', subSector: 'hardware' },
  PSTG:  { sector: 'information_technology', subSector: 'hardware' },
  IONQ:  { sector: 'information_technology', subSector: 'hardware' },
  QBTS:  { sector: 'information_technology', subSector: 'hardware' },
  RGTI:  { sector: 'information_technology', subSector: 'hardware' },
  QUBT:  { sector: 'information_technology', subSector: 'hardware' },

  // Semiconductors
  AMD:   { sector: 'information_technology', subSector: 'semiconductors' },
  INTC:  { sector: 'information_technology', subSector: 'semiconductors' },
  QCOM:  { sector: 'information_technology', subSector: 'semiconductors' },
  AVGO:  { sector: 'information_technology', subSector: 'semiconductors' },
  TXN:   { sector: 'information_technology', subSector: 'semiconductors' },
  MRVL:  { sector: 'information_technology', subSector: 'semiconductors' },
  MCHP:  { sector: 'information_technology', subSector: 'semiconductors' },
  ON:    { sector: 'information_technology', subSector: 'semiconductors' },
  WOLF:  { sector: 'information_technology', subSector: 'semiconductors' },
  SWKS:  { sector: 'information_technology', subSector: 'semiconductors' },
  QRVO:  { sector: 'information_technology', subSector: 'semiconductors' },
  MPWR:  { sector: 'information_technology', subSector: 'semiconductors' },
  ENTG:  { sector: 'information_technology', subSector: 'semiconductors' },
  OLED:  { sector: 'information_technology', subSector: 'semiconductors' },
  SITM:  { sector: 'information_technology', subSector: 'semiconductors' },
  FORM:  { sector: 'information_technology', subSector: 'semiconductors' },
  AMKR:  { sector: 'information_technology', subSector: 'semiconductors' },
  MTSI:  { sector: 'information_technology', subSector: 'semiconductors' },
  COHR:  { sector: 'information_technology', subSector: 'semiconductors' },
  PI:    { sector: 'information_technology', subSector: 'semiconductors' },
  AEHR:  { sector: 'information_technology', subSector: 'semiconductors' },
  ONTO:  { sector: 'information_technology', subSector: 'semiconductors' },
  TSM:   { sector: 'information_technology', subSector: 'semiconductors' },
  ARM:   { sector: 'information_technology', subSector: 'semiconductors' },
  MU:    { sector: 'information_technology', subSector: 'semiconductors' },
  NXPI:  { sector: 'information_technology', subSector: 'semiconductors' },
  TER:   { sector: 'information_technology', subSector: 'semiconductors' },
  ADI:   { sector: 'information_technology', subSector: 'semiconductors' },
  MXIM:  { sector: 'information_technology', subSector: 'semiconductors' },
  SLAB:  { sector: 'information_technology', subSector: 'semiconductors' },
  AMBA:  { sector: 'information_technology', subSector: 'semiconductors' },
  CRUS:  { sector: 'information_technology', subSector: 'semiconductors' },
  DIOD:  { sector: 'information_technology', subSector: 'semiconductors' },
  IXYS:  { sector: 'information_technology', subSector: 'semiconductors' },
  RMBS:  { sector: 'information_technology', subSector: 'semiconductors' },
  ALGM:  { sector: 'information_technology', subSector: 'semiconductors' },
  ACLS:  { sector: 'information_technology', subSector: 'semiconductors' },
  SMTC:  { sector: 'information_technology', subSector: 'semiconductors' },
  POWI:  { sector: 'information_technology', subSector: 'semiconductors' },
  SYNA:  { sector: 'information_technology', subSector: 'semiconductors' },
  LSCC:  { sector: 'information_technology', subSector: 'semiconductors' },
  LITE:  { sector: 'information_technology', subSector: 'semiconductors' },

  // Semiconductor Equipment
  AMAT:  { sector: 'information_technology', subSector: 'semiconductor_equipment' },
  LRCX:  { sector: 'information_technology', subSector: 'semiconductor_equipment' },
  KLAC:  { sector: 'information_technology', subSector: 'semiconductor_equipment' },
  ASML:  { sector: 'information_technology', subSector: 'semiconductor_equipment' },
  TOELY: { sector: 'information_technology', subSector: 'semiconductor_equipment' },
  ACMR:  { sector: 'information_technology', subSector: 'semiconductor_equipment' },
  UCTT:  { sector: 'information_technology', subSector: 'semiconductor_equipment' },
  ICHR:  { sector: 'information_technology', subSector: 'semiconductor_equipment' },
  MKSI:  { sector: 'information_technology', subSector: 'semiconductor_equipment' },
  CAMT:  { sector: 'information_technology', subSector: 'semiconductor_equipment' },

  // Software
  MSFT:  { sector: 'information_technology', subSector: 'software' },
  ORCL:  { sector: 'information_technology', subSector: 'software' },
  CRM:   { sector: 'information_technology', subSector: 'software' },
  SAP:   { sector: 'information_technology', subSector: 'software' },
  ADBE:  { sector: 'information_technology', subSector: 'software' },
  NOW:   { sector: 'information_technology', subSector: 'software' },
  INTU:  { sector: 'information_technology', subSector: 'software' },
  WDAY:  { sector: 'information_technology', subSector: 'software' },
  SNOW:  { sector: 'information_technology', subSector: 'software' },
  DDOG:  { sector: 'information_technology', subSector: 'software' },
  MDB:   { sector: 'information_technology', subSector: 'software' },
  NET:   { sector: 'information_technology', subSector: 'software' },
  ZS:    { sector: 'information_technology', subSector: 'software' },
  CRWD:  { sector: 'information_technology', subSector: 'software' },
  S:     { sector: 'information_technology', subSector: 'software' },
  PANW:  { sector: 'information_technology', subSector: 'software' },
  FTNT:  { sector: 'information_technology', subSector: 'software' },
  OKTA:  { sector: 'information_technology', subSector: 'software' },
  HUBS:  { sector: 'information_technology', subSector: 'software' },
  TEAM:  { sector: 'information_technology', subSector: 'software' },
  TWLO:  { sector: 'information_technology', subSector: 'software' },
  AI:    { sector: 'information_technology', subSector: 'software' },
  BBAI:  { sector: 'information_technology', subSector: 'software' },
  SOUN:  { sector: 'information_technology', subSector: 'software' },
  U:     { sector: 'information_technology', subSector: 'software' },
  GTLB:  { sector: 'information_technology', subSector: 'software' },
  COUP:  { sector: 'information_technology', subSector: 'software' },
  SMAR:  { sector: 'information_technology', subSector: 'software' },
  APPN:  { sector: 'information_technology', subSector: 'software' },
  PCTY:  { sector: 'information_technology', subSector: 'software' },
  PAYC:  { sector: 'information_technology', subSector: 'software' },
  NCNO:  { sector: 'information_technology', subSector: 'software' },
  TENB:  { sector: 'information_technology', subSector: 'software' },
  RPM:   { sector: 'information_technology', subSector: 'software' },
  ESTC:  { sector: 'information_technology', subSector: 'software' },
  ZI:    { sector: 'information_technology', subSector: 'software' },
  BRZE:  { sector: 'information_technology', subSector: 'software' },
  CFLT:  { sector: 'information_technology', subSector: 'software' },
  RXRX:  { sector: 'health_care',            subSector: 'biotech' },
  PATH:  { sector: 'information_technology', subSector: 'software' },
  BOX:   { sector: 'information_technology', subSector: 'software' },
  DOMO:  { sector: 'information_technology', subSector: 'software' },
  SPSC:  { sector: 'information_technology', subSector: 'software' },
  NEWR:  { sector: 'information_technology', subSector: 'software' },
  FROG:  { sector: 'information_technology', subSector: 'software' },
  AVLR:  { sector: 'information_technology', subSector: 'software' },
  YEXT:  { sector: 'information_technology', subSector: 'software' },
  ALTR:  { sector: 'information_technology', subSector: 'software' },
  CLSK:  { sector: 'information_technology', subSector: 'internet_infrastructure' },
  UPLD:  { sector: 'information_technology', subSector: 'software' },
  ZM:    { sector: 'information_technology', subSector: 'software' },
  DOCU:  { sector: 'information_technology', subSector: 'software' },
  MNDY:  { sector: 'information_technology', subSector: 'software' },
  AZPN:  { sector: 'information_technology', subSector: 'software' },
  ANSS:  { sector: 'information_technology', subSector: 'software' },
  CDNS:  { sector: 'information_technology', subSector: 'software' },
  SNPS:  { sector: 'information_technology', subSector: 'software' },
  PTC:   { sector: 'information_technology', subSector: 'software' },
  RNG:   { sector: 'information_technology', subSector: 'software' },
  NICE:  { sector: 'information_technology', subSector: 'software' },
  GWRE:  { sector: 'information_technology', subSector: 'software' },
  QLYS:  { sector: 'information_technology', subSector: 'software' },
  VRNS:  { sector: 'information_technology', subSector: 'software' },
  SAIL:  { sector: 'information_technology', subSector: 'software' },
  PRFT:  { sector: 'information_technology', subSector: 'software' },
  SAIC:  { sector: 'industrials',            subSector: 'aerospace_defense' },
  LDOS:  { sector: 'industrials',            subSector: 'aerospace_defense' },
  BSY:   { sector: 'information_technology', subSector: 'software' },
  GLBE:  { sector: 'information_technology', subSector: 'software' },
  ALRM:  { sector: 'information_technology', subSector: 'software' },
  NUAN:  { sector: 'information_technology', subSector: 'software' },
  JAMF:  { sector: 'information_technology', subSector: 'software' },
  DT:    { sector: 'information_technology', subSector: 'software' },
  SUMO:  { sector: 'information_technology', subSector: 'software' },
  ASAN:  { sector: 'information_technology', subSector: 'software' },
  PCOR:  { sector: 'information_technology', subSector: 'software' },
  WEAVE: { sector: 'information_technology', subSector: 'software' },

  // IT Services
  IBM:   { sector: 'information_technology', subSector: 'it_services' },
  ACN:   { sector: 'information_technology', subSector: 'it_services' },
  INFY:  { sector: 'information_technology', subSector: 'it_services' },
  WIT:   { sector: 'information_technology', subSector: 'it_services' },
  ADP:   { sector: 'information_technology', subSector: 'it_services' },
  CTSH:  { sector: 'information_technology', subSector: 'it_services' },
  IT:    { sector: 'information_technology', subSector: 'it_services' },
  EPAM:  { sector: 'information_technology', subSector: 'it_services' },
  GLOB:  { sector: 'information_technology', subSector: 'it_services' },
  WEX:   { sector: 'information_technology', subSector: 'it_services' },
  DXC:   { sector: 'information_technology', subSector: 'it_services' },
  GIB:   { sector: 'information_technology', subSector: 'it_services' },
  SSNC:  { sector: 'information_technology', subSector: 'it_services' },
  CACI:  { sector: 'industrials',            subSector: 'aerospace_defense' },
  BOOZ:  { sector: 'industrials',            subSector: 'aerospace_defense' },
  EXLS:  { sector: 'information_technology', subSector: 'it_services' },
  CSCO:  { sector: 'information_technology', subSector: 'it_services' },
  JNPR:  { sector: 'information_technology', subSector: 'it_services' },
  FFIV:  { sector: 'information_technology', subSector: 'it_services' },
  ANET:  { sector: 'information_technology', subSector: 'it_services' },
  NTDOY: { sector: 'communication_services', subSector: 'media_entertainment' },

  // Internet Infrastructure / Cloud
  AKAM:  { sector: 'information_technology', subSector: 'internet_infrastructure' },
  FSLY:  { sector: 'information_technology', subSector: 'internet_infrastructure' },
  MSTR:  { sector: 'financials',             subSector: 'fintech' },
  HUT:   { sector: 'information_technology', subSector: 'internet_infrastructure' },
  HIVE:  { sector: 'information_technology', subSector: 'internet_infrastructure' },
  WULF:  { sector: 'information_technology', subSector: 'internet_infrastructure' },
  CORZ:  { sector: 'information_technology', subSector: 'internet_infrastructure' },
  BTBT:  { sector: 'information_technology', subSector: 'internet_infrastructure' },
  MARA:  { sector: 'information_technology', subSector: 'internet_infrastructure' },

  // Electronic Equipment
  KEYS:  { sector: 'information_technology', subSector: 'electronic_equipment' },
  FTV:   { sector: 'information_technology', subSector: 'electronic_equipment' },
  TRMB:  { sector: 'information_technology', subSector: 'electronic_equipment' },
  ST:    { sector: 'information_technology', subSector: 'electronic_equipment' },
  ITRI:  { sector: 'information_technology', subSector: 'electronic_equipment' },
  NOVT:  { sector: 'information_technology', subSector: 'electronic_equipment' },
  IDCC:  { sector: 'information_technology', subSector: 'electronic_equipment' },
  ZBRA:  { sector: 'information_technology', subSector: 'electronic_equipment' },
  VECO:  { sector: 'information_technology', subSector: 'electronic_equipment' },
  COHU:  { sector: 'information_technology', subSector: 'electronic_equipment' },
  PLXS:  { sector: 'information_technology', subSector: 'electronic_equipment' },
  TTEC:  { sector: 'information_technology', subSector: 'electronic_equipment' },

  // ══════════════════════════════════════════════════════════════════════
  // COMMUNICATION SERVICES
  // ══════════════════════════════════════════════════════════════════════

  // Interactive Media (Big Tech)
  GOOGL: { sector: 'communication_services', subSector: 'interactive_media' },
  GOOG:  { sector: 'communication_services', subSector: 'interactive_media' },
  META:  { sector: 'communication_services', subSector: 'interactive_media' },
  SNAP:  { sector: 'communication_services', subSector: 'interactive_media' },
  PINS:  { sector: 'communication_services', subSector: 'interactive_media' },
  RDDT:  { sector: 'communication_services', subSector: 'interactive_media' },
  SPOT:  { sector: 'communication_services', subSector: 'interactive_media' },
  TTD:   { sector: 'communication_services', subSector: 'interactive_media' },
  RBLX:  { sector: 'communication_services', subSector: 'interactive_media' },
  MTCH:  { sector: 'communication_services', subSector: 'interactive_media' },
  IAC:   { sector: 'communication_services', subSector: 'interactive_media' },
  ZG:    { sector: 'real_estate',            subSector: 'residential_reits' },
  ANGI:  { sector: 'communication_services', subSector: 'interactive_media' },
  YELP:  { sector: 'communication_services', subSector: 'interactive_media' },
  TKO:   { sector: 'communication_services', subSector: 'media_entertainment' },
  LYV:   { sector: 'communication_services', subSector: 'media_entertainment' },

  // Media & Entertainment
  NFLX:  { sector: 'communication_services', subSector: 'media_entertainment' },
  DIS:   { sector: 'communication_services', subSector: 'media_entertainment' },
  PARA:  { sector: 'communication_services', subSector: 'media_entertainment' },
  WBD:   { sector: 'communication_services', subSector: 'media_entertainment' },
  FOXA:  { sector: 'communication_services', subSector: 'media_entertainment' },
  FOX:   { sector: 'communication_services', subSector: 'media_entertainment' },
  CMCSA: { sector: 'communication_services', subSector: 'media_entertainment' },
  EA:    { sector: 'communication_services', subSector: 'media_entertainment' },
  TTWO:  { sector: 'communication_services', subSector: 'media_entertainment' },
  ATVI:  { sector: 'communication_services', subSector: 'media_entertainment' },
  NWSA:  { sector: 'communication_services', subSector: 'publishing' },
  NWS:   { sector: 'communication_services', subSector: 'publishing' },
  NYT:   { sector: 'communication_services', subSector: 'publishing' },
  IPG:   { sector: 'communication_services', subSector: 'publishing' },
  OMC:   { sector: 'communication_services', subSector: 'publishing' },

  // Telecom
  T:     { sector: 'communication_services', subSector: 'telecom_services' },
  VZ:    { sector: 'communication_services', subSector: 'telecom_services' },
  TMUS:  { sector: 'communication_services', subSector: 'wireless_telecom' },
  CHTR:  { sector: 'communication_services', subSector: 'telecom_services' },
  LUMN:  { sector: 'communication_services', subSector: 'telecom_services' },
  FYBR:  { sector: 'communication_services', subSector: 'telecom_services' },
  CABO:  { sector: 'communication_services', subSector: 'telecom_services' },
  ATUS:  { sector: 'communication_services', subSector: 'telecom_services' },
  USM:   { sector: 'communication_services', subSector: 'wireless_telecom' },
  LBTYA: { sector: 'communication_services', subSector: 'telecom_services' },
  LBTYK: { sector: 'communication_services', subSector: 'telecom_services' },

  // Satellite
  VSAT:  { sector: 'communication_services', subSector: 'satellite_comms' },
  MAXR:  { sector: 'communication_services', subSector: 'earth_observation' },
  UFO:   { sector: 'communication_services', subSector: 'satellite_comms' }, // ETF

  // ══════════════════════════════════════════════════════════════════════
  // CONSUMER DISCRETIONARY
  // ══════════════════════════════════════════════════════════════════════

  // Auto
  TSLA:  { sector: 'consumer_discretionary', subSector: 'auto_manufacturers' },
  RIVN:  { sector: 'consumer_discretionary', subSector: 'auto_manufacturers' },
  LCID:  { sector: 'consumer_discretionary', subSector: 'auto_manufacturers' },
  F:     { sector: 'consumer_discretionary', subSector: 'auto_manufacturers' },
  GM:    { sector: 'consumer_discretionary', subSector: 'auto_manufacturers' },
  TM:    { sector: 'consumer_discretionary', subSector: 'auto_manufacturers' },
  HMC:   { sector: 'consumer_discretionary', subSector: 'auto_manufacturers' },
  STLA:  { sector: 'consumer_discretionary', subSector: 'auto_manufacturers' },
  NIO:   { sector: 'consumer_discretionary', subSector: 'auto_manufacturers' },
  LI:    { sector: 'consumer_discretionary', subSector: 'auto_manufacturers' },
  XPEV:  { sector: 'consumer_discretionary', subSector: 'auto_manufacturers' },
  NKLA:  { sector: 'consumer_discretionary', subSector: 'auto_manufacturers' },
  GOEV:  { sector: 'consumer_discretionary', subSector: 'auto_manufacturers' },
  FFIE:  { sector: 'consumer_discretionary', subSector: 'auto_manufacturers' },
  BLNK:  { sector: 'industrials',            subSector: 'electrical_equipment' },
  CHPT:  { sector: 'industrials',            subSector: 'electrical_equipment' },
  EVGO:  { sector: 'industrials',            subSector: 'electrical_equipment' },
  APTV:  { sector: 'consumer_discretionary', subSector: 'auto_components' },
  LEA:   { sector: 'consumer_discretionary', subSector: 'auto_components' },
  BWA:   { sector: 'consumer_discretionary', subSector: 'auto_components' },
  GNTX:  { sector: 'consumer_discretionary', subSector: 'auto_components' },
  MGA:   { sector: 'consumer_discretionary', subSector: 'auto_components' },
  ALV:   { sector: 'consumer_discretionary', subSector: 'auto_components' },
  MODV:  { sector: 'consumer_discretionary', subSector: 'auto_components' },

  // E-Commerce & Internet Retail
  AMZN:  { sector: 'consumer_discretionary', subSector: 'ecommerce' },
  SHOP:  { sector: 'consumer_discretionary', subSector: 'ecommerce' },
  BKNG:  { sector: 'consumer_discretionary', subSector: 'ecommerce' },
  EXPE:  { sector: 'consumer_discretionary', subSector: 'ecommerce' },
  EBAY:  { sector: 'consumer_discretionary', subSector: 'ecommerce' },
  ETSY:  { sector: 'consumer_discretionary', subSector: 'ecommerce' },
  WISH:  { sector: 'consumer_discretionary', subSector: 'ecommerce' },
  POSHM: { sector: 'consumer_discretionary', subSector: 'ecommerce' },
  CART:  { sector: 'consumer_discretionary', subSector: 'ecommerce' },
  DASH:  { sector: 'consumer_discretionary', subSector: 'ecommerce' },
  ABNB:  { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  VRBO:  { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  TRIP:  { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },

  // Retail
  HD:    { sector: 'consumer_discretionary', subSector: 'retail' },
  LOW:   { sector: 'consumer_discretionary', subSector: 'retail' },
  TGT:   { sector: 'consumer_discretionary', subSector: 'retail' },
  NKE:   { sector: 'consumer_discretionary', subSector: 'leisure' },
  LULU:  { sector: 'consumer_discretionary', subSector: 'leisure' },
  UAA:   { sector: 'consumer_discretionary', subSector: 'leisure' },
  UA:    { sector: 'consumer_discretionary', subSector: 'leisure' },
  RL:    { sector: 'consumer_discretionary', subSector: 'luxury' },
  TPR:   { sector: 'consumer_discretionary', subSector: 'luxury' },
  CPRI:  { sector: 'consumer_discretionary', subSector: 'luxury' },
  PVH:   { sector: 'consumer_discretionary', subSector: 'luxury' },
  HBI:   { sector: 'consumer_discretionary', subSector: 'retail' },
  VFC:   { sector: 'consumer_discretionary', subSector: 'retail' },
  AEO:   { sector: 'consumer_discretionary', subSector: 'retail' },
  ANF:   { sector: 'consumer_discretionary', subSector: 'retail' },
  GPS:   { sector: 'consumer_discretionary', subSector: 'retail' },
  ROST:  { sector: 'consumer_discretionary', subSector: 'retail' },
  TJX:   { sector: 'consumer_discretionary', subSector: 'retail' },
  BBY:   { sector: 'consumer_discretionary', subSector: 'retail' },
  FIVE:  { sector: 'consumer_discretionary', subSector: 'retail' },
  DG:    { sector: 'consumer_discretionary', subSector: 'retail' },
  DLTR:  { sector: 'consumer_discretionary', subSector: 'retail' },
  OLLI:  { sector: 'consumer_discretionary', subSector: 'retail' },
  GME:   { sector: 'consumer_discretionary', subSector: 'retail' },
  AMC:   { sector: 'consumer_discretionary', subSector: 'media_entertainment' },
  CONN:  { sector: 'consumer_discretionary', subSector: 'retail' },
  CVNA:  { sector: 'consumer_discretionary', subSector: 'retail' },
  KMX:   { sector: 'consumer_discretionary', subSector: 'retail' },
  AN:    { sector: 'consumer_discretionary', subSector: 'retail' },
  PAG:   { sector: 'consumer_discretionary', subSector: 'retail' },
  LAD:   { sector: 'consumer_discretionary', subSector: 'retail' },
  ABG:   { sector: 'consumer_discretionary', subSector: 'retail' },
  AZO:   { sector: 'consumer_discretionary', subSector: 'retail' },
  ORLY:  { sector: 'consumer_discretionary', subSector: 'retail' },
  AAP:   { sector: 'consumer_discretionary', subSector: 'retail' },
  W:     { sector: 'consumer_discretionary', subSector: 'ecommerce' },
  OSTK:  { sector: 'consumer_discretionary', subSector: 'ecommerce' },
  RH:    { sector: 'consumer_discretionary', subSector: 'retail' },
  WSM:   { sector: 'consumer_discretionary', subSector: 'retail' },

  // Hotels, Restaurants & Leisure
  MCD:   { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  SBUX:  { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  CMG:   { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  DPZ:   { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  YUM:   { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  QSR:   { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  JACK:  { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  DENN:  { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  TXRH:  { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  DRI:   { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  EAT:   { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  MAR:   { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  HLT:   { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  H:     { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  IHG:   { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  CHH:   { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  WH:    { sector: 'consumer_discretionary', subSector: 'hotels_restaurants' },
  RCL:   { sector: 'consumer_discretionary', subSector: 'leisure' },
  CCL:   { sector: 'consumer_discretionary', subSector: 'leisure' },
  NCLH:  { sector: 'consumer_discretionary', subSector: 'leisure' },
  MGM:   { sector: 'consumer_discretionary', subSector: 'leisure' },
  WYNN:  { sector: 'consumer_discretionary', subSector: 'leisure' },
  LVS:   { sector: 'consumer_discretionary', subSector: 'leisure' },
  DKNG:  { sector: 'consumer_discretionary', subSector: 'leisure' },
  PENN:  { sector: 'consumer_discretionary', subSector: 'leisure' },
  CZR:   { sector: 'consumer_discretionary', subSector: 'leisure' },
  FLUT:  { sector: 'consumer_discretionary', subSector: 'leisure' },

  // Transportation (consumer-facing)
  UBER:  { sector: 'industrials',            subSector: 'transportation' },
  LYFT:  { sector: 'industrials',            subSector: 'transportation' },

  // Homebuilding
  DHI:   { sector: 'consumer_discretionary', subSector: 'homebuilding' },
  LEN:   { sector: 'consumer_discretionary', subSector: 'homebuilding' },
  PHM:   { sector: 'consumer_discretionary', subSector: 'homebuilding' },
  NVR:   { sector: 'consumer_discretionary', subSector: 'homebuilding' },
  TOL:   { sector: 'consumer_discretionary', subSector: 'homebuilding' },
  MDC:   { sector: 'consumer_discretionary', subSector: 'homebuilding' },
  MHO:   { sector: 'consumer_discretionary', subSector: 'homebuilding' },
  SKY:   { sector: 'consumer_discretionary', subSector: 'homebuilding' },
  CVCO:  { sector: 'consumer_discretionary', subSector: 'homebuilding' },

  // ══════════════════════════════════════════════════════════════════════
  // CONSUMER STAPLES
  // ══════════════════════════════════════════════════════════════════════

  WMT:   { sector: 'consumer_staples',       subSector: 'food_retail' },
  COST:  { sector: 'consumer_staples',       subSector: 'food_retail' },
  KR:    { sector: 'consumer_staples',       subSector: 'food_retail' },
  SFM:   { sector: 'consumer_staples',       subSector: 'food_retail' },
  GO:    { sector: 'consumer_staples',       subSector: 'food_retail' },
  ACI:   { sector: 'consumer_staples',       subSector: 'food_retail' },
  PG:    { sector: 'consumer_staples',       subSector: 'household_products' },
  CL:    { sector: 'consumer_staples',       subSector: 'household_products' },
  CHD:   { sector: 'consumer_staples',       subSector: 'household_products' },
  REYN:  { sector: 'consumer_staples',       subSector: 'household_products' },
  CLX:   { sector: 'consumer_staples',       subSector: 'household_products' },
  KMB:   { sector: 'consumer_staples',       subSector: 'household_products' },
  EL:    { sector: 'consumer_staples',       subSector: 'household_products' },
  ULTA:  { sector: 'consumer_discretionary', subSector: 'retail' },
  COTY:  { sector: 'consumer_staples',       subSector: 'household_products' },
  KO:    { sector: 'consumer_staples',       subSector: 'food_beverage' },
  PEP:   { sector: 'consumer_staples',       subSector: 'food_beverage' },
  MDLZ:  { sector: 'consumer_staples',       subSector: 'food_beverage' },
  KHC:   { sector: 'consumer_staples',       subSector: 'food_beverage' },
  GIS:   { sector: 'consumer_staples',       subSector: 'food_beverage' },
  CPB:   { sector: 'consumer_staples',       subSector: 'food_beverage' },
  CAG:   { sector: 'consumer_staples',       subSector: 'food_beverage' },
  MKC:   { sector: 'consumer_staples',       subSector: 'food_beverage' },
  HRL:   { sector: 'consumer_staples',       subSector: 'food_beverage' },
  TSN:   { sector: 'consumer_staples',       subSector: 'food_beverage' },
  HSY:   { sector: 'consumer_staples',       subSector: 'food_beverage' },
  MNST:  { sector: 'consumer_staples',       subSector: 'food_beverage' },
  STZ:   { sector: 'consumer_staples',       subSector: 'food_beverage' },
  BFB:   { sector: 'consumer_staples',       subSector: 'food_beverage' },
  DEO:   { sector: 'consumer_staples',       subSector: 'food_beverage' },
  TAP:   { sector: 'consumer_staples',       subSector: 'food_beverage' },
  SAM:   { sector: 'consumer_staples',       subSector: 'food_beverage' },
  CELH:  { sector: 'consumer_staples',       subSector: 'food_beverage' },
  BYND:  { sector: 'consumer_staples',       subSector: 'food_beverage' },
  PM:    { sector: 'consumer_staples',       subSector: 'tobacco' },
  MO:    { sector: 'consumer_staples',       subSector: 'tobacco' },
  BTI:   { sector: 'consumer_staples',       subSector: 'tobacco' },
  CVS:   { sector: 'consumer_staples',       subSector: 'drug_retail' },
  WBA:   { sector: 'consumer_staples',       subSector: 'drug_retail' },

  // ══════════════════════════════════════════════════════════════════════
  // FINANCIALS
  // ══════════════════════════════════════════════════════════════════════

  // Banks
  JPM:   { sector: 'financials', subSector: 'banks' },
  BAC:   { sector: 'financials', subSector: 'banks' },
  WFC:   { sector: 'financials', subSector: 'banks' },
  C:     { sector: 'financials', subSector: 'banks' },
  USB:   { sector: 'financials', subSector: 'banks' },
  PNC:   { sector: 'financials', subSector: 'banks' },
  TFC:   { sector: 'financials', subSector: 'banks' },
  FITB:  { sector: 'financials', subSector: 'banks' },
  KEY:   { sector: 'financials', subSector: 'banks' },
  RF:    { sector: 'financials', subSector: 'banks' },
  CFG:   { sector: 'financials', subSector: 'banks' },
  HBAN:  { sector: 'financials', subSector: 'banks' },
  MTB:   { sector: 'financials', subSector: 'banks' },
  ZION:  { sector: 'financials', subSector: 'banks' },
  CMA:   { sector: 'financials', subSector: 'banks' },
  WAL:   { sector: 'financials', subSector: 'banks' },
  SIVB:  { sector: 'financials', subSector: 'banks' },
  PACW:  { sector: 'financials', subSector: 'banks' },
  FRC:   { sector: 'financials', subSector: 'banks' },
  NYCB:  { sector: 'financials', subSector: 'banks' },
  OZK:   { sector: 'financials', subSector: 'banks' },
  IBOC:  { sector: 'financials', subSector: 'banks' },
  FHB:   { sector: 'financials', subSector: 'banks' },
  BOH:   { sector: 'financials', subSector: 'banks' },
  FFIN:  { sector: 'financials', subSector: 'banks' },
  COLB:  { sector: 'financials', subSector: 'banks' },
  GBCI:  { sector: 'financials', subSector: 'banks' },

  // Capital Markets & Brokers
  GS:    { sector: 'financials', subSector: 'capital_markets' },
  MS:    { sector: 'financials', subSector: 'capital_markets' },
  SCHW:  { sector: 'financials', subSector: 'capital_markets' },
  RJF:   { sector: 'financials', subSector: 'capital_markets' },
  LPL:   { sector: 'financials', subSector: 'capital_markets' },
  ETFC:  { sector: 'financials', subSector: 'capital_markets' },
  SF:    { sector: 'financials', subSector: 'capital_markets' },
  EVR:   { sector: 'financials', subSector: 'capital_markets' },
  LAZ:   { sector: 'financials', subSector: 'capital_markets' },
  MC:    { sector: 'financials', subSector: 'capital_markets' },
  HLI:   { sector: 'financials', subSector: 'capital_markets' },
  MKTX:  { sector: 'financials', subSector: 'capital_markets' },
  NDAQ:  { sector: 'financials', subSector: 'capital_markets' },
  ICE:   { sector: 'financials', subSector: 'capital_markets' },
  CME:   { sector: 'financials', subSector: 'capital_markets' },
  CBOE:  { sector: 'financials', subSector: 'capital_markets' },
  MCO:   { sector: 'financials', subSector: 'capital_markets' },
  SPGI:  { sector: 'financials', subSector: 'capital_markets' },
  FDS:   { sector: 'financials', subSector: 'capital_markets' },
  MSCI:  { sector: 'financials', subSector: 'capital_markets' },
  HOOD:  { sector: 'financials', subSector: 'capital_markets' },

  // Asset Management
  BLK:   { sector: 'financials', subSector: 'asset_management' },
  APO:   { sector: 'financials', subSector: 'asset_management' },
  KKR:   { sector: 'financials', subSector: 'asset_management' },
  BX:    { sector: 'financials', subSector: 'asset_management' },
  CG:    { sector: 'financials', subSector: 'asset_management' },
  ARES:  { sector: 'financials', subSector: 'asset_management' },
  BAM:   { sector: 'financials', subSector: 'asset_management' },
  OWL:   { sector: 'financials', subSector: 'asset_management' },
  BN:    { sector: 'financials', subSector: 'asset_management' },
  WTW:   { sector: 'financials', subSector: 'asset_management' },
  FNF:   { sector: 'financials', subSector: 'insurance' },
  TROW:  { sector: 'financials', subSector: 'asset_management' },
  IVZ:   { sector: 'financials', subSector: 'asset_management' },
  AMG:   { sector: 'financials', subSector: 'asset_management' },
  VCTR:  { sector: 'financials', subSector: 'asset_management' },
  STEP:  { sector: 'financials', subSector: 'asset_management' },

  // Insurance
  'BRK.A': { sector: 'financials', subSector: 'insurance' },
  'BRK.B': { sector: 'financials', subSector: 'insurance' },
  BRK_A:   { sector: 'financials', subSector: 'insurance' },
  BRK_B:   { sector: 'financials', subSector: 'insurance' },
  BRKB:    { sector: 'financials', subSector: 'insurance' },
  MET:   { sector: 'financials', subSector: 'insurance' },
  AIG:   { sector: 'financials', subSector: 'insurance' },
  PRU:   { sector: 'financials', subSector: 'insurance' },
  AFL:   { sector: 'financials', subSector: 'insurance' },
  HIG:   { sector: 'financials', subSector: 'insurance' },
  TRV:   { sector: 'financials', subSector: 'insurance' },
  ALL:   { sector: 'financials', subSector: 'insurance' },
  PGR:   { sector: 'financials', subSector: 'insurance' },
  CB:    { sector: 'financials', subSector: 'insurance' },
  AXS:   { sector: 'financials', subSector: 'insurance' },
  RNR:   { sector: 'financials', subSector: 'insurance' },
  RE:    { sector: 'financials', subSector: 'insurance' },
  EG:    { sector: 'financials', subSector: 'insurance' },
  L:     { sector: 'financials', subSector: 'insurance' },
  CINF:  { sector: 'financials', subSector: 'insurance' },
  WRB:   { sector: 'financials', subSector: 'insurance' },
  KMPR:  { sector: 'financials', subSector: 'insurance' },
  ERIE:  { sector: 'financials', subSector: 'insurance' },

  // Fintech & Payments
  V:     { sector: 'financials', subSector: 'fintech' },
  MA:    { sector: 'financials', subSector: 'fintech' },
  AXP:   { sector: 'financials', subSector: 'fintech' },
  PYPL:  { sector: 'financials', subSector: 'fintech' },
  SQ:    { sector: 'financials', subSector: 'fintech' },
  AFRM:  { sector: 'financials', subSector: 'fintech' },
  COIN:  { sector: 'financials', subSector: 'fintech' },
  NU:    { sector: 'financials', subSector: 'fintech' },
  SOFI:  { sector: 'financials', subSector: 'fintech' },
  UPST:  { sector: 'financials', subSector: 'fintech' },
  LC:    { sector: 'financials', subSector: 'fintech' },
  DLO:   { sector: 'financials', subSector: 'fintech' },
  FOUR:  { sector: 'financials', subSector: 'fintech' },
  PAYO:  { sector: 'financials', subSector: 'fintech' },
  FLYW:  { sector: 'financials', subSector: 'fintech' },
  RPAY:  { sector: 'financials', subSector: 'fintech' },
  GPN:   { sector: 'financials', subSector: 'fintech' },
  FIS:   { sector: 'financials', subSector: 'fintech' },
  FISV:  { sector: 'financials', subSector: 'fintech' },
  JKHY:  { sector: 'financials', subSector: 'fintech' },
  IBIT:  { sector: 'financials', subSector: 'fintech' },
  FBTC:  { sector: 'financials', subSector: 'fintech' },
  BTC:   { sector: 'financials', subSector: 'fintech' },

  // Consumer Finance
  COF:   { sector: 'financials', subSector: 'consumer_finance' },
  DFS:   { sector: 'financials', subSector: 'consumer_finance' },
  SYF:   { sector: 'financials', subSector: 'consumer_finance' },
  OMF:   { sector: 'financials', subSector: 'consumer_finance' },
  CACC:  { sector: 'financials', subSector: 'consumer_finance' },
  SC:    { sector: 'financials', subSector: 'consumer_finance' },
  ENVA:  { sector: 'financials', subSector: 'consumer_finance' },
  NMFC:  { sector: 'financials', subSector: 'consumer_finance' },

  // Mortgage REITs
  AGNC:  { sector: 'financials', subSector: 'mortgage_reits' },
  NLY:   { sector: 'financials', subSector: 'mortgage_reits' },
  STWD:  { sector: 'financials', subSector: 'mortgage_reits' },
  BXMT:  { sector: 'financials', subSector: 'mortgage_reits' },
  RC:    { sector: 'financials', subSector: 'mortgage_reits' },

  // ══════════════════════════════════════════════════════════════════════
  // HEALTH CARE
  // ══════════════════════════════════════════════════════════════════════

  // Pharma
  LLY:   { sector: 'health_care', subSector: 'pharma' },
  JNJ:   { sector: 'health_care', subSector: 'pharma' },
  PFE:   { sector: 'health_care', subSector: 'pharma' },
  MRK:   { sector: 'health_care', subSector: 'pharma' },
  ABBV:  { sector: 'health_care', subSector: 'pharma' },
  BMY:   { sector: 'health_care', subSector: 'pharma' },
  NVO:   { sector: 'health_care', subSector: 'pharma' },
  AZN:   { sector: 'health_care', subSector: 'pharma' },
  GSK:   { sector: 'health_care', subSector: 'pharma' },
  SNY:   { sector: 'health_care', subSector: 'pharma' },
  RHHBY: { sector: 'health_care', subSector: 'pharma' },
  NVS:   { sector: 'health_care', subSector: 'pharma' },
  TAK:   { sector: 'health_care', subSector: 'pharma' },
  VTRS:  { sector: 'health_care', subSector: 'pharma' },
  AGN:   { sector: 'health_care', subSector: 'pharma' },
  PRGO:  { sector: 'health_care', subSector: 'pharma' },
  JAZZ:  { sector: 'health_care', subSector: 'pharma' },
  INVA:  { sector: 'health_care', subSector: 'pharma' },
  ENDP:  { sector: 'health_care', subSector: 'pharma' },
  PAHC:  { sector: 'health_care', subSector: 'pharma' },
  SUPN:  { sector: 'health_care', subSector: 'pharma' },
  HZNP:  { sector: 'health_care', subSector: 'pharma' },
  ITCI:  { sector: 'health_care', subSector: 'pharma' },
  INCY:  { sector: 'health_care', subSector: 'pharma' },
  ALKS:  { sector: 'health_care', subSector: 'pharma' },
  NKTR:  { sector: 'health_care', subSector: 'pharma' },

  // Biotech
  GILD:  { sector: 'health_care', subSector: 'biotech' },
  AMGN:  { sector: 'health_care', subSector: 'biotech' },
  BIIB:  { sector: 'health_care', subSector: 'biotech' },
  REGN:  { sector: 'health_care', subSector: 'biotech' },
  VRTX:  { sector: 'health_care', subSector: 'biotech' },
  MRNA:  { sector: 'health_care', subSector: 'biotech' },
  BNTX:  { sector: 'health_care', subSector: 'biotech' },
  NVAX:  { sector: 'health_care', subSector: 'biotech' },
  SGEN:  { sector: 'health_care', subSector: 'biotech' },
  BMRN:  { sector: 'health_care', subSector: 'biotech' },
  ALNY:  { sector: 'health_care', subSector: 'biotech' },
  SRPT:  { sector: 'health_care', subSector: 'biotech' },
  BLUE:  { sector: 'health_care', subSector: 'biotech' },
  FATE:  { sector: 'health_care', subSector: 'biotech' },
  KYMR:  { sector: 'health_care', subSector: 'biotech' },
  RCKT:  { sector: 'health_care', subSector: 'biotech' },
  EDIT:  { sector: 'health_care', subSector: 'biotech' },
  CRSP:  { sector: 'health_care', subSector: 'biotech' },
  NTLA:  { sector: 'health_care', subSector: 'biotech' },
  BEAM:  { sector: 'health_care', subSector: 'biotech' },
  ARWR:  { sector: 'health_care', subSector: 'biotech' },
  EXAS:  { sector: 'health_care', subSector: 'biotech' },
  NTRA:  { sector: 'health_care', subSector: 'biotech' },
  GH:    { sector: 'health_care', subSector: 'biotech' },
  ACAD:  { sector: 'health_care', subSector: 'biotech' },
  IONS:  { sector: 'health_care', subSector: 'biotech' },
  IOVA:  { sector: 'health_care', subSector: 'biotech' },
  FOLD:  { sector: 'health_care', subSector: 'biotech' },
  PTGX:  { sector: 'health_care', subSector: 'biotech' },
  RVMD:  { sector: 'health_care', subSector: 'biotech' },
  HALO:  { sector: 'health_care', subSector: 'biotech' },
  LEGN:  { sector: 'health_care', subSector: 'biotech' },
  PRAX:  { sector: 'health_care', subSector: 'biotech' },
  MRUS:  { sector: 'health_care', subSector: 'biotech' },
  IMVT:  { sector: 'health_care', subSector: 'biotech' },
  ARQT:  { sector: 'health_care', subSector: 'biotech' },
  KROS:  { sector: 'health_care', subSector: 'biotech' },
  DNLI:  { sector: 'health_care', subSector: 'biotech' },
  PTCT:  { sector: 'health_care', subSector: 'biotech' },
  RARE:  { sector: 'health_care', subSector: 'biotech' },
  VKTX:  { sector: 'health_care', subSector: 'biotech' },

  // Medical Devices
  ABT:   { sector: 'health_care', subSector: 'medical_devices' },
  MDT:   { sector: 'health_care', subSector: 'medical_devices' },
  SYK:   { sector: 'health_care', subSector: 'medical_devices' },
  BSX:   { sector: 'health_care', subSector: 'medical_devices' },
  ISRG:  { sector: 'health_care', subSector: 'medical_devices' },
  ZBH:   { sector: 'health_care', subSector: 'medical_devices' },
  BAX:   { sector: 'health_care', subSector: 'medical_devices' },
  BDX:   { sector: 'health_care', subSector: 'medical_devices' },
  EW:    { sector: 'health_care', subSector: 'medical_devices' },
  DXCM:  { sector: 'health_care', subSector: 'medical_devices' },
  PHG:   { sector: 'health_care', subSector: 'medical_devices' },
  HOLX:  { sector: 'health_care', subSector: 'medical_devices' },
  PODD:  { sector: 'health_care', subSector: 'medical_devices' },
  SWAV:  { sector: 'health_care', subSector: 'medical_devices' },
  GMED:  { sector: 'health_care', subSector: 'medical_devices' },
  NUVA:  { sector: 'health_care', subSector: 'medical_devices' },
  NVCR:  { sector: 'health_care', subSector: 'medical_devices' },
  ATRC:  { sector: 'health_care', subSector: 'medical_devices' },
  AXNX:  { sector: 'health_care', subSector: 'medical_devices' },
  INSP:  { sector: 'health_care', subSector: 'medical_devices' },
  AVNS:  { sector: 'health_care', subSector: 'medical_devices' },
  IRTC:  { sector: 'health_care', subSector: 'medical_devices' },

  // Health Care Services
  UNH:   { sector: 'health_care', subSector: 'health_services' },
  CI:    { sector: 'health_care', subSector: 'health_services' },
  HCA:   { sector: 'health_care', subSector: 'health_services' },
  IQV:   { sector: 'health_care', subSector: 'health_services' },
  CNC:   { sector: 'health_care', subSector: 'health_services' },
  MOH:   { sector: 'health_care', subSector: 'health_services' },
  ELV:   { sector: 'health_care', subSector: 'health_services' },
  HUM:   { sector: 'health_care', subSector: 'health_services' },
  THC:   { sector: 'health_care', subSector: 'health_services' },
  UHS:   { sector: 'health_care', subSector: 'health_services' },
  SEM:   { sector: 'health_care', subSector: 'health_services' },
  AMEH:  { sector: 'health_care', subSector: 'health_services' },
  OPCH:  { sector: 'health_care', subSector: 'health_services' },
  PINC:  { sector: 'health_care', subSector: 'health_services' },
  HIMS:  { sector: 'health_care', subSector: 'health_services' },
  ACCD:  { sector: 'health_care', subSector: 'health_services' },
  OMCL:  { sector: 'health_care', subSector: 'health_services' },
  OSCR:  { sector: 'health_care', subSector: 'health_services' },
  CLOV:  { sector: 'health_care', subSector: 'health_services' },

  // Life Sciences
  DHR:   { sector: 'health_care', subSector: 'life_sciences' },
  TMO:   { sector: 'health_care', subSector: 'life_sciences' },
  A:     { sector: 'health_care', subSector: 'life_sciences' },
  ILMN:  { sector: 'health_care', subSector: 'life_sciences' },
  PACB:  { sector: 'health_care', subSector: 'life_sciences' },
  BRKR:  { sector: 'health_care', subSector: 'life_sciences' },
  SYNH:  { sector: 'health_care', subSector: 'life_sciences' },
  MEDP:  { sector: 'health_care', subSector: 'life_sciences' },
  DOCS:  { sector: 'health_care', subSector: 'health_services' },
  VEEV:  { sector: 'health_care', subSector: 'life_sciences' },

  // Dental/Vision
  ALGN:  { sector: 'health_care', subSector: 'dental_vision' },
  XRAY:  { sector: 'health_care', subSector: 'dental_vision' },
  NVST:  { sector: 'health_care', subSector: 'dental_vision' },
  SDC:   { sector: 'health_care', subSector: 'dental_vision' },

  // ══════════════════════════════════════════════════════════════════════
  // INDUSTRIALS
  // ══════════════════════════════════════════════════════════════════════

  // Aerospace & Defense (primes + services)
  BA:    { sector: 'industrials', subSector: 'aerospace_defense' },
  RTX:   { sector: 'industrials', subSector: 'aerospace_defense' },
  LMT:   { sector: 'industrials', subSector: 'aerospace_defense' },
  NOC:   { sector: 'industrials', subSector: 'aerospace_defense' },
  GD:    { sector: 'industrials', subSector: 'aerospace_defense' },
  HII:   { sector: 'industrials', subSector: 'aerospace_defense' },
  TDG:   { sector: 'industrials', subSector: 'aerospace_defense' },
  AXON:  { sector: 'industrials', subSector: 'aerospace_defense' },
  HEI:   { sector: 'industrials', subSector: 'aerospace_defense' },
  TXT:   { sector: 'industrials', subSector: 'aerospace_defense' },
  CW:    { sector: 'industrials', subSector: 'aerospace_defense' },
  FLIR:  { sector: 'industrials', subSector: 'aerospace_defense' },
  MRCY:  { sector: 'industrials', subSector: 'aerospace_defense' },
  MOOG:  { sector: 'industrials', subSector: 'aerospace_defense' },
  AIR:   { sector: 'industrials', subSector: 'aerospace_defense' },
  HAYW:  { sector: 'industrials', subSector: 'aerospace_defense' },
  DRS:   { sector: 'industrials', subSector: 'aerospace_defense' },
  BWXT:  { sector: 'energy',      subSector: 'nuclear_components' }, // already in universe
  SPR:   { sector: 'industrials', subSector: 'aerospace_defense' },
  WWD:   { sector: 'industrials', subSector: 'aerospace_defense' },

  // Space (non-universe)
  SPCE:  { sector: 'industrials', subSector: 'space_launch' },
  ASTR:  { sector: 'industrials', subSector: 'space_launch' },
  MNTS:  { sector: 'industrials', subSector: 'space_systems' },

  // Industrial Machinery
  CAT:   { sector: 'industrials', subSector: 'industrial_machinery' },
  DE:    { sector: 'industrials', subSector: 'industrial_machinery' },
  MMM:   { sector: 'industrials', subSector: 'industrial_machinery' },
  HON:   { sector: 'industrials', subSector: 'industrial_machinery' },
  GE:    { sector: 'industrials', subSector: 'industrial_machinery' },
  EMR:   { sector: 'industrials', subSector: 'industrial_machinery' },
  ITW:   { sector: 'industrials', subSector: 'industrial_machinery' },
  PH:    { sector: 'industrials', subSector: 'industrial_machinery' },
  DOV:   { sector: 'industrials', subSector: 'industrial_machinery' },
  NDSN:  { sector: 'industrials', subSector: 'industrial_machinery' },
  ROP:   { sector: 'industrials', subSector: 'industrial_machinery' },
  AME:   { sector: 'industrials', subSector: 'industrial_machinery' },
  GNRC:  { sector: 'industrials', subSector: 'industrial_machinery' },
  XYL:   { sector: 'industrials', subSector: 'industrial_machinery' },
  IEX:   { sector: 'industrials', subSector: 'industrial_machinery' },
  MIDD:  { sector: 'industrials', subSector: 'industrial_machinery' },
  TTC:   { sector: 'industrials', subSector: 'industrial_machinery' },
  GTLS:  { sector: 'industrials', subSector: 'industrial_machinery' },
  FBIN:  { sector: 'industrials', subSector: 'industrial_machinery' },
  ESAB:  { sector: 'industrials', subSector: 'industrial_machinery' },
  ACCO:  { sector: 'industrials', subSector: 'industrial_machinery' },
  FLOW:  { sector: 'industrials', subSector: 'industrial_machinery' },
  LECO:  { sector: 'industrials', subSector: 'industrial_machinery' },
  WMS:   { sector: 'industrials', subSector: 'industrial_machinery' },

  // Electrical Equipment
  ETN:   { sector: 'industrials', subSector: 'electrical_equipment' },
  ROK:   { sector: 'industrials', subSector: 'electrical_equipment' },
  PLUG:  { sector: 'industrials', subSector: 'electrical_equipment' },
  FCEL:  { sector: 'industrials', subSector: 'electrical_equipment' },
  BLDP:  { sector: 'industrials', subSector: 'electrical_equipment' },
  AYI:   { sector: 'industrials', subSector: 'electrical_equipment' },
  HUBB:  { sector: 'industrials', subSector: 'electrical_equipment' },
  REXN:  { sector: 'industrials', subSector: 'electrical_equipment' },
  AEI:   { sector: 'industrials', subSector: 'electrical_equipment' },

  // Construction & Engineering (including PWR fix)
  PWR:   { sector: 'industrials', subSector: 'construction_engineering' },
  FLR:   { sector: 'industrials', subSector: 'construction_engineering' },
  MTZ:   { sector: 'industrials', subSector: 'construction_engineering' },
  DY:    { sector: 'industrials', subSector: 'construction_engineering' },
  PRIM:  { sector: 'industrials', subSector: 'construction_engineering' },
  STRL:  { sector: 'industrials', subSector: 'construction_engineering' },
  AGX:   { sector: 'industrials', subSector: 'construction_engineering' },
  MYRG:  { sector: 'industrials', subSector: 'construction_engineering' },
  WLDN:  { sector: 'industrials', subSector: 'construction_engineering' },
  KFRC:  { sector: 'industrials', subSector: 'construction_engineering' },
  EME:   { sector: 'industrials', subSector: 'construction_engineering' },
  TTEK:  { sector: 'industrials', subSector: 'construction_engineering' },
  ITRN:  { sector: 'industrials', subSector: 'construction_engineering' },
  J:     { sector: 'industrials', subSector: 'construction_engineering' },
  WSP:   { sector: 'industrials', subSector: 'construction_engineering' },

  // Transportation
  FDX:   { sector: 'industrials', subSector: 'transportation' },
  UPS:   { sector: 'industrials', subSector: 'transportation' },
  DAL:   { sector: 'industrials', subSector: 'transportation' },
  UAL:   { sector: 'industrials', subSector: 'transportation' },
  AAL:   { sector: 'industrials', subSector: 'transportation' },
  ALK:   { sector: 'industrials', subSector: 'transportation' },
  JBLU:  { sector: 'industrials', subSector: 'transportation' },
  SAVE:  { sector: 'industrials', subSector: 'transportation' },
  SKYW:  { sector: 'industrials', subSector: 'transportation' },
  NSC:   { sector: 'industrials', subSector: 'transportation' },
  UNP:   { sector: 'industrials', subSector: 'transportation' },
  CSX:   { sector: 'industrials', subSector: 'transportation' },
  CP:    { sector: 'industrials', subSector: 'transportation' },
  CNI:   { sector: 'industrials', subSector: 'transportation' },
  KSU:   { sector: 'industrials', subSector: 'transportation' },
  EXPD:  { sector: 'industrials', subSector: 'transportation' },
  XPO:   { sector: 'industrials', subSector: 'transportation' },
  CHRW:  { sector: 'industrials', subSector: 'transportation' },
  ODFL:  { sector: 'industrials', subSector: 'transportation' },
  SAIA:  { sector: 'industrials', subSector: 'transportation' },
  JBHT:  { sector: 'industrials', subSector: 'transportation' },
  WERN:  { sector: 'industrials', subSector: 'transportation' },
  KNX:   { sector: 'industrials', subSector: 'transportation' },
  MRTN:  { sector: 'industrials', subSector: 'transportation' },
  HTLD:  { sector: 'industrials', subSector: 'transportation' },
  TFII:  { sector: 'industrials', subSector: 'transportation' },
  GXO:   { sector: 'industrials', subSector: 'transportation' },
  GRAB:  { sector: 'industrials', subSector: 'transportation' },

  // Commercial Services
  VRSK:  { sector: 'industrials', subSector: 'commercial_services' },
  BRO:   { sector: 'industrials', subSector: 'commercial_services' },
  CBRE:  { sector: 'industrials', subSector: 'commercial_services' },
  JLL:   { sector: 'industrials', subSector: 'commercial_services' },
  R:     { sector: 'industrials', subSector: 'commercial_services' },
  URI:   { sector: 'industrials', subSector: 'commercial_services' },
  HEES:  { sector: 'industrials', subSector: 'commercial_services' },
  GATX:  { sector: 'industrials', subSector: 'commercial_services' },
  RXO:   { sector: 'industrials', subSector: 'commercial_services' },
  DAVA:  { sector: 'industrials', subSector: 'commercial_services' },
  NLSN:  { sector: 'industrials', subSector: 'commercial_services' },
  CSGP:  { sector: 'industrials', subSector: 'commercial_services' },
  CPRT:  { sector: 'industrials', subSector: 'commercial_services' },
  IAA:   { sector: 'industrials', subSector: 'commercial_services' },

  // Waste
  WM:    { sector: 'industrials', subSector: 'waste_management' },
  RSG:   { sector: 'industrials', subSector: 'waste_management' },
  CWST:  { sector: 'industrials', subSector: 'waste_management' },
  CLH:   { sector: 'industrials', subSector: 'waste_management' },
  SRCL:  { sector: 'industrials', subSector: 'waste_management' },

  // Staffing
  MAN:   { sector: 'industrials', subSector: 'staffing' },
  KELYA: { sector: 'industrials', subSector: 'staffing' },
  HSII:  { sector: 'industrials', subSector: 'staffing' },

  // ══════════════════════════════════════════════════════════════════════
  // ENERGY
  // ══════════════════════════════════════════════════════════════════════

  // Oil & Gas Exploration
  XOM:   { sector: 'energy', subSector: 'oil_gas_exploration' },
  CVX:   { sector: 'energy', subSector: 'oil_gas_exploration' },
  COP:   { sector: 'energy', subSector: 'oil_gas_exploration' },
  EOG:   { sector: 'energy', subSector: 'oil_gas_exploration' },
  PXD:   { sector: 'energy', subSector: 'oil_gas_exploration' },
  DVN:   { sector: 'energy', subSector: 'oil_gas_exploration' },
  FANG:  { sector: 'energy', subSector: 'oil_gas_exploration' },
  OXY:   { sector: 'energy', subSector: 'oil_gas_exploration' },
  APA:   { sector: 'energy', subSector: 'oil_gas_exploration' },
  MRO:   { sector: 'energy', subSector: 'oil_gas_exploration' },
  HES:   { sector: 'energy', subSector: 'oil_gas_exploration' },
  CTRA:  { sector: 'energy', subSector: 'oil_gas_exploration' },
  SM:    { sector: 'energy', subSector: 'oil_gas_exploration' },
  MTDR:  { sector: 'energy', subSector: 'oil_gas_exploration' },
  CHRD:  { sector: 'energy', subSector: 'oil_gas_exploration' },
  PR:    { sector: 'energy', subSector: 'oil_gas_exploration' },
  CLR:   { sector: 'energy', subSector: 'oil_gas_exploration' },
  ESTE:  { sector: 'energy', subSector: 'oil_gas_exploration' },
  VTLE:  { sector: 'energy', subSector: 'oil_gas_exploration' },
  CRGY:  { sector: 'energy', subSector: 'oil_gas_exploration' },
  CIVI:  { sector: 'energy', subSector: 'oil_gas_exploration' },
  SWN:   { sector: 'energy', subSector: 'oil_gas_exploration' },
  AR:    { sector: 'energy', subSector: 'oil_gas_exploration' },
  RRC:   { sector: 'energy', subSector: 'oil_gas_exploration' },
  EQT:   { sector: 'energy', subSector: 'oil_gas_exploration' },
  CNX:   { sector: 'energy', subSector: 'oil_gas_exploration' },

  // Midstream
  KMI:   { sector: 'energy', subSector: 'oil_gas_midstream' },
  WMB:   { sector: 'energy', subSector: 'oil_gas_midstream' },
  OKE:   { sector: 'energy', subSector: 'oil_gas_midstream' },
  ET:    { sector: 'energy', subSector: 'oil_gas_midstream' },
  EPD:   { sector: 'energy', subSector: 'oil_gas_midstream' },
  MMP:   { sector: 'energy', subSector: 'oil_gas_midstream' },
  PAA:   { sector: 'energy', subSector: 'oil_gas_midstream' },
  TRGP:  { sector: 'energy', subSector: 'oil_gas_midstream' },
  MPLX:  { sector: 'energy', subSector: 'oil_gas_midstream' },
  AM:    { sector: 'energy', subSector: 'oil_gas_midstream' },
  CQPNF: { sector: 'energy', subSector: 'oil_gas_midstream' },
  LNG:   { sector: 'energy', subSector: 'oil_gas_midstream' },
  NFE:   { sector: 'energy', subSector: 'oil_gas_midstream' },
  GLNG:  { sector: 'energy', subSector: 'oil_gas_midstream' },
  NEXT:  { sector: 'energy', subSector: 'oil_gas_midstream' },

  // Refining
  MPC:   { sector: 'energy', subSector: 'oil_gas_refining' },
  VLO:   { sector: 'energy', subSector: 'oil_gas_refining' },
  PSX:   { sector: 'energy', subSector: 'oil_gas_refining' },
  DKL:   { sector: 'energy', subSector: 'oil_gas_refining' },
  HFC:   { sector: 'energy', subSector: 'oil_gas_refining' },
  DINO:  { sector: 'energy', subSector: 'oil_gas_refining' },
  PBF:   { sector: 'energy', subSector: 'oil_gas_refining' },

  // Equipment & Services
  SLB:   { sector: 'energy', subSector: 'oil_gas_equipment' },
  HAL:   { sector: 'energy', subSector: 'oil_gas_equipment' },
  BKR:   { sector: 'energy', subSector: 'oil_gas_equipment' },
  NOV:   { sector: 'energy', subSector: 'oil_gas_equipment' },
  FTI:   { sector: 'energy', subSector: 'oil_gas_equipment' },
  RES:   { sector: 'energy', subSector: 'oil_gas_equipment' },
  NE:    { sector: 'energy', subSector: 'oil_gas_equipment' },
  RIG:   { sector: 'energy', subSector: 'oil_gas_equipment' },
  VAL:   { sector: 'energy', subSector: 'oil_gas_equipment' },
  DO:    { sector: 'energy', subSector: 'oil_gas_equipment' },
  WTTR:  { sector: 'energy', subSector: 'oil_gas_equipment' },
  LBRT:  { sector: 'energy', subSector: 'oil_gas_equipment' },
  PUMP:  { sector: 'energy', subSector: 'oil_gas_equipment' },
  CESI:  { sector: 'energy', subSector: 'oil_gas_equipment' },

  // Renewable Energy
  ENPH:  { sector: 'energy', subSector: 'renewable_energy' },
  SEDG:  { sector: 'energy', subSector: 'renewable_energy' },
  FSLR:  { sector: 'energy', subSector: 'renewable_energy' },
  RUN:   { sector: 'energy', subSector: 'renewable_energy' },
  NOVA:  { sector: 'energy', subSector: 'renewable_energy' },
  ARRY:  { sector: 'energy', subSector: 'renewable_energy' },
  CSIQ:  { sector: 'energy', subSector: 'renewable_energy' },
  JKS:   { sector: 'energy', subSector: 'renewable_energy' },
  CWEN:  { sector: 'energy', subSector: 'renewable_energy' },
  AES:   { sector: 'utilities',  subSector: 'electric_utilities' },
  BEP:   { sector: 'utilities',  subSector: 'electric_utilities' },
  NEP:   { sector: 'utilities',  subSector: 'electric_utilities' },
  GPRE:  { sector: 'energy', subSector: 'renewable_energy' },
  REGI:  { sector: 'energy', subSector: 'renewable_energy' },

  // Uranium & Critical Minerals
  URA:   { sector: 'energy', subSector: 'uranium_mining' },
  URNM:  { sector: 'energy', subSector: 'uranium_mining' },
  UEC:   { sector: 'energy', subSector: 'uranium_mining' },
  DNN:   { sector: 'energy', subSector: 'uranium_mining' },
  PDN:   { sector: 'energy', subSector: 'uranium_mining' },
  EU:    { sector: 'energy', subSector: 'uranium_mining' },
  UUUU:  { sector: 'energy', subSector: 'uranium_mining' },
  URG:   { sector: 'energy', subSector: 'uranium_mining' },
  LTBR:  { sector: 'energy', subSector: 'nuclear_components' },
  SMR:   { sector: 'energy', subSector: 'advanced_reactors' },
  XNRGI: { sector: 'energy', subSector: 'advanced_reactors' },
  NRGV:  { sector: 'energy', subSector: 'advanced_reactors' },

  // ══════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ══════════════════════════════════════════════════════════════════════

  NEE:   { sector: 'utilities', subSector: 'electric_utilities' },
  AEP:   { sector: 'utilities', subSector: 'electric_utilities' },
  XEL:   { sector: 'utilities', subSector: 'electric_utilities' },
  SO:    { sector: 'utilities', subSector: 'electric_utilities' },
  DUK:   { sector: 'utilities', subSector: 'electric_utilities' },
  PCG:   { sector: 'utilities', subSector: 'electric_utilities' },
  EXC:   { sector: 'utilities', subSector: 'electric_utilities' },
  ED:    { sector: 'utilities', subSector: 'electric_utilities' },
  WEC:   { sector: 'utilities', subSector: 'electric_utilities' },
  ES:    { sector: 'utilities', subSector: 'electric_utilities' },
  ETR:   { sector: 'utilities', subSector: 'electric_utilities' },
  EIX:   { sector: 'utilities', subSector: 'electric_utilities' },
  PPL:   { sector: 'utilities', subSector: 'electric_utilities' },
  FE:    { sector: 'utilities', subSector: 'electric_utilities' },
  CNP:   { sector: 'utilities', subSector: 'multi_utilities' },
  LNT:   { sector: 'utilities', subSector: 'electric_utilities' },
  EVRG:  { sector: 'utilities', subSector: 'electric_utilities' },
  PNW:   { sector: 'utilities', subSector: 'electric_utilities' },
  OGE:   { sector: 'utilities', subSector: 'electric_utilities' },
  OTTR:  { sector: 'utilities', subSector: 'electric_utilities' },
  IDA:   { sector: 'utilities', subSector: 'electric_utilities' },
  NWE:   { sector: 'utilities', subSector: 'electric_utilities' },
  SJW:   { sector: 'utilities', subSector: 'water_utilities' },
  AWK:   { sector: 'utilities', subSector: 'water_utilities' },
  WTRG:  { sector: 'utilities', subSector: 'water_utilities' },
  MSEX:  { sector: 'utilities', subSector: 'water_utilities' },
  NI:    { sector: 'utilities', subSector: 'gas_utilities' },
  UGI:   { sector: 'utilities', subSector: 'gas_utilities' },
  SWX:   { sector: 'utilities', subSector: 'gas_utilities' },
  NWN:   { sector: 'utilities', subSector: 'gas_utilities' },
  SR:    { sector: 'utilities', subSector: 'gas_utilities' },
  SPKE:  { sector: 'utilities', subSector: 'gas_utilities' },
  ATO:   { sector: 'utilities', subSector: 'multi_utilities' },
  CMS:   { sector: 'utilities', subSector: 'multi_utilities' },
  DTE:   { sector: 'utilities', subSector: 'multi_utilities' },
  PEG:   { sector: 'utilities', subSector: 'multi_utilities' },
  AVA:   { sector: 'utilities', subSector: 'multi_utilities' },
  BKH:   { sector: 'utilities', subSector: 'multi_utilities' },

  // ══════════════════════════════════════════════════════════════════════
  // MATERIALS
  // ══════════════════════════════════════════════════════════════════════

  // Mining
  VALE:  { sector: 'materials', subSector: 'mining' },
  BHP:   { sector: 'materials', subSector: 'mining' },
  RIO:   { sector: 'materials', subSector: 'mining' },
  FCX:   { sector: 'materials', subSector: 'mining' },
  NEM:   { sector: 'materials', subSector: 'mining' },
  GOLD:  { sector: 'materials', subSector: 'mining' },
  AEM:   { sector: 'materials', subSector: 'mining' },
  WPM:   { sector: 'materials', subSector: 'mining' },
  FNV:   { sector: 'materials', subSector: 'mining' },
  MP:    { sector: 'materials', subSector: 'mining' },
  PAAS:  { sector: 'materials', subSector: 'mining' },
  AG:    { sector: 'materials', subSector: 'mining' },
  HL:    { sector: 'materials', subSector: 'mining' },
  SCCO:  { sector: 'materials', subSector: 'mining' },
  HBM:   { sector: 'materials', subSector: 'mining' },
  TECK:  { sector: 'materials', subSector: 'mining' },
  AA:    { sector: 'materials', subSector: 'metals_steel' },
  CENX:  { sector: 'materials', subSector: 'metals_steel' },
  KALU:  { sector: 'materials', subSector: 'metals_steel' },
  ATI:   { sector: 'materials', subSector: 'metals_steel' },
  CSTM:  { sector: 'materials', subSector: 'metals_steel' },

  // Metals & Steel
  NUE:   { sector: 'materials', subSector: 'metals_steel' },
  CLF:   { sector: 'materials', subSector: 'metals_steel' },
  RS:    { sector: 'materials', subSector: 'metals_steel' },
  CMC:   { sector: 'materials', subSector: 'metals_steel' },
  STLD:  { sector: 'materials', subSector: 'metals_steel' },
  WOR:   { sector: 'materials', subSector: 'metals_steel' },
  PKOH:  { sector: 'materials', subSector: 'metals_steel' },

  // Chemicals
  DOW:   { sector: 'materials', subSector: 'chemicals' },
  LYB:   { sector: 'materials', subSector: 'chemicals' },
  CF:    { sector: 'materials', subSector: 'chemicals' },
  ALB:   { sector: 'materials', subSector: 'chemicals' },
  SQM:   { sector: 'materials', subSector: 'chemicals' },
  DD:    { sector: 'materials', subSector: 'chemicals' },
  EMN:   { sector: 'materials', subSector: 'chemicals' },
  CE:    { sector: 'materials', subSector: 'chemicals' },
  HUN:   { sector: 'materials', subSector: 'chemicals' },
  OLN:   { sector: 'materials', subSector: 'chemicals' },
  KWR:   { sector: 'materials', subSector: 'chemicals' },
  TROX:  { sector: 'materials', subSector: 'chemicals' },
  IOSP:  { sector: 'materials', subSector: 'chemicals' },
  FMC:   { sector: 'materials', subSector: 'chemicals' },
  MOS:   { sector: 'materials', subSector: 'chemicals' },
  NTR:   { sector: 'materials', subSector: 'chemicals' },
  IFF:   { sector: 'materials', subSector: 'chemicals' },
  PPG:   { sector: 'materials', subSector: 'chemicals' },
  SHW:   { sector: 'materials', subSector: 'chemicals' },
  ECL:   { sector: 'materials', subSector: 'chemicals' },
  APD:   { sector: 'materials', subSector: 'chemicals' },
  LIN:   { sector: 'materials', subSector: 'chemicals' },
  AVNT:  { sector: 'materials', subSector: 'chemicals' },

  // Construction Materials
  VMC:   { sector: 'materials', subSector: 'construction_materials' },
  MLM:   { sector: 'materials', subSector: 'construction_materials' },
  SUM:   { sector: 'materials', subSector: 'construction_materials' },
  USCR:  { sector: 'materials', subSector: 'construction_materials' },
  EXP:   { sector: 'materials', subSector: 'construction_materials' },
  USG:   { sector: 'materials', subSector: 'construction_materials' },
  BECN:  { sector: 'materials', subSector: 'construction_materials' },
  IBP:   { sector: 'materials', subSector: 'construction_materials' },
  MHK:   { sector: 'materials', subSector: 'construction_materials' },

  // Packaging
  IP:    { sector: 'materials', subSector: 'packaging' },
  PKG:   { sector: 'materials', subSector: 'packaging' },
  SEE:   { sector: 'materials', subSector: 'packaging' },
  BALL:  { sector: 'materials', subSector: 'packaging' },
  CCK:   { sector: 'materials', subSector: 'packaging' },
  SLGN:  { sector: 'materials', subSector: 'packaging' },
  SON:   { sector: 'materials', subSector: 'packaging' },
  AptV:  { sector: 'materials', subSector: 'packaging' },
  BERY:  { sector: 'materials', subSector: 'packaging' },
  GEF:   { sector: 'materials', subSector: 'packaging' },
  AMCR:  { sector: 'materials', subSector: 'packaging' },
  ATR:   { sector: 'materials', subSector: 'packaging' },

  // Paper & Forest
  WRK:   { sector: 'materials', subSector: 'paper_forest' },
  RFP:   { sector: 'materials', subSector: 'paper_forest' },
  CLW:   { sector: 'materials', subSector: 'paper_forest' },
  MERC:  { sector: 'materials', subSector: 'paper_forest' },
  PCH:   { sector: 'materials', subSector: 'paper_forest' },
  WY:    { sector: 'materials', subSector: 'paper_forest' },
  RYN:   { sector: 'materials', subSector: 'paper_forest' },
  PotlatchDeltic: { sector: 'real_estate', subSector: 'industrial_reits' },

  // ETF — commodity
  LIT:   { sector: 'materials', subSector: 'mining' },
  GLD:   { sector: 'materials', subSector: null },
  SLV:   { sector: 'materials', subSector: null },
  COPX:  { sector: 'materials', subSector: 'mining' },
  PICK:  { sector: 'materials', subSector: 'metals_steel' },

  // ══════════════════════════════════════════════════════════════════════
  // REAL ESTATE
  // ══════════════════════════════════════════════════════════════════════

  // Data Center REITs
  EQIX:  { sector: 'real_estate', subSector: 'data_center_reits' },
  DLR:   { sector: 'real_estate', subSector: 'data_center_reits' },
  IRM:   { sector: 'real_estate', subSector: 'data_center_reits' },
  CONE:  { sector: 'real_estate', subSector: 'data_center_reits' },
  QTS:   { sector: 'real_estate', subSector: 'data_center_reits' },
  COR:   { sector: 'real_estate', subSector: 'data_center_reits' },

  // Cell Tower REITs
  AMT:   { sector: 'real_estate', subSector: 'cell_tower_reits' },
  CCI:   { sector: 'real_estate', subSector: 'cell_tower_reits' },
  SBAC:  { sector: 'real_estate', subSector: 'cell_tower_reits' },

  // Industrial REITs
  PLD:   { sector: 'real_estate', subSector: 'industrial_reits' },
  STAG:  { sector: 'real_estate', subSector: 'industrial_reits' },
  EGP:   { sector: 'real_estate', subSector: 'industrial_reits' },
  FR:    { sector: 'real_estate', subSector: 'industrial_reits' },
  REXR:  { sector: 'real_estate', subSector: 'industrial_reits' },
  TRNO:  { sector: 'real_estate', subSector: 'industrial_reits' },

  // Residential REITs
  EQR:   { sector: 'real_estate', subSector: 'residential_reits' },
  AVB:   { sector: 'real_estate', subSector: 'residential_reits' },
  INVH:  { sector: 'real_estate', subSector: 'residential_reits' },
  MAA:   { sector: 'real_estate', subSector: 'residential_reits' },
  CPT:   { sector: 'real_estate', subSector: 'residential_reits' },
  NMD:   { sector: 'real_estate', subSector: 'residential_reits' },
  AIV:   { sector: 'real_estate', subSector: 'residential_reits' },
  UDR:   { sector: 'real_estate', subSector: 'residential_reits' },
  AMH:   { sector: 'real_estate', subSector: 'residential_reits' },
  SUI:   { sector: 'real_estate', subSector: 'residential_reits' },
  ELS:   { sector: 'real_estate', subSector: 'residential_reits' },
  UE:    { sector: 'real_estate', subSector: 'residential_reits' },

  // Retail REITs
  SPG:   { sector: 'real_estate', subSector: 'retail_reits' },
  O:     { sector: 'real_estate', subSector: 'retail_reits' },
  VICI:  { sector: 'real_estate', subSector: 'retail_reits' },
  KIM:   { sector: 'real_estate', subSector: 'retail_reits' },
  REG:   { sector: 'real_estate', subSector: 'retail_reits' },
  BRX:   { sector: 'real_estate', subSector: 'retail_reits' },
  ROIC:  { sector: 'real_estate', subSector: 'retail_reits' },
  WPG:   { sector: 'real_estate', subSector: 'retail_reits' },
  SKT:   { sector: 'real_estate', subSector: 'retail_reits' },
  MAC:   { sector: 'real_estate', subSector: 'retail_reits' },
  TCO:   { sector: 'real_estate', subSector: 'retail_reits' },
  NNN:   { sector: 'real_estate', subSector: 'retail_reits' },
  EPRT:  { sector: 'real_estate', subSector: 'retail_reits' },
  ADC:   { sector: 'real_estate', subSector: 'retail_reits' },
  NTST:  { sector: 'real_estate', subSector: 'retail_reits' },

  // Office REITs
  BXP:   { sector: 'real_estate', subSector: 'office_reits' },
  VNO:   { sector: 'real_estate', subSector: 'office_reits' },
  SLG:   { sector: 'real_estate', subSector: 'office_reits' },
  HIW:   { sector: 'real_estate', subSector: 'office_reits' },
  PGRE:  { sector: 'real_estate', subSector: 'office_reits' },
  CUZ:   { sector: 'real_estate', subSector: 'office_reits' },
  PDM:   { sector: 'real_estate', subSector: 'office_reits' },
  DEI:   { sector: 'real_estate', subSector: 'office_reits' },
  OPI:   { sector: 'real_estate', subSector: 'office_reits' },

  // Health Care REITs
  WELL:  { sector: 'real_estate', subSector: 'healthcare_reits' },
  VTR:   { sector: 'real_estate', subSector: 'healthcare_reits' },
  OHI:   { sector: 'real_estate', subSector: 'healthcare_reits' },
  HR:    { sector: 'real_estate', subSector: 'healthcare_reits' },
  DOC:   { sector: 'real_estate', subSector: 'healthcare_reits' },
  SABR:  { sector: 'real_estate', subSector: 'healthcare_reits' },
  CTRE:  { sector: 'real_estate', subSector: 'healthcare_reits' },
  LTC:   { sector: 'real_estate', subSector: 'healthcare_reits' },
  MPW:   { sector: 'real_estate', subSector: 'healthcare_reits' },
  GMRE:  { sector: 'real_estate', subSector: 'healthcare_reits' },

  // ══════════════════════════════════════════════════════════════════════
  // POPULAR ETFs
  // ══════════════════════════════════════════════════════════════════════

  SPY:   { sector: 'other', subSector: null },
  QQQ:   { sector: 'information_technology', subSector: null },
  IWM:   { sector: 'other', subSector: null },
  VTI:   { sector: 'other', subSector: null },
  VOO:   { sector: 'other', subSector: null },
  VEA:   { sector: 'other', subSector: null },
  VWO:   { sector: 'other', subSector: null },
  EFA:   { sector: 'other', subSector: null },
  EEM:   { sector: 'other', subSector: null },
  DIA:   { sector: 'industrials', subSector: null },
  XLK:   { sector: 'information_technology', subSector: null },
  XLE:   { sector: 'energy', subSector: null },
  XLF:   { sector: 'financials', subSector: null },
  XLV:   { sector: 'health_care', subSector: null },
  XLI:   { sector: 'industrials', subSector: null },
  XLY:   { sector: 'consumer_discretionary', subSector: null },
  XLP:   { sector: 'consumer_staples', subSector: null },
  XLB:   { sector: 'materials', subSector: null },
  XLRE:  { sector: 'real_estate', subSector: null },
  XLU:   { sector: 'utilities', subSector: null },
  XLC:   { sector: 'communication_services', subSector: null },
  ARKK:  { sector: 'information_technology', subSector: null },
  ARKQ:  { sector: 'industrials', subSector: null },
  ARKG:  { sector: 'health_care', subSector: null },
  ARKF:  { sector: 'financials', subSector: null },
  ARKX:  { sector: 'industrials', subSector: null },
  DRIV:  { sector: 'consumer_discretionary', subSector: null },
  ROBO:  { sector: 'industrials', subSector: null },
  BOTZ:  { sector: 'industrials', subSector: null },
  SOXL:  { sector: 'information_technology', subSector: null },
  SOXX:  { sector: 'information_technology', subSector: null },
  SMH:   { sector: 'information_technology', subSector: null },
  TQQQ:  { sector: 'information_technology', subSector: null },
  SQQQ:  { sector: 'information_technology', subSector: null },
  SPXL:  { sector: 'other', subSector: null },
  SPXS:  { sector: 'other', subSector: null },
  UVXY:  { sector: 'other', subSector: null },
  VXX:   { sector: 'other', subSector: null },
};

// ─── classifyTicker ───────────────────────────────────────────────────────────

export function classifyTicker(ticker: string): SectorTag {
  const t = ticker.toUpperCase().trim();
  if (UNIVERSE_SECTOR_MAP[t]) return UNIVERSE_SECTOR_MAP[t];
  if (KNOWN_TICKERS[t]) return KNOWN_TICKERS[t];
  return { sector: 'other', subSector: null };
}

export const UNIVERSE = new Set(Object.keys(UNIVERSE_SECTOR_MAP));

export function isInUniverse(ticker: string): boolean {
  return UNIVERSE.has(ticker.toUpperCase().trim());
}