/**
 * Hand-synced copy of `src/config/tickers.ts` ALL_TICKERS.
 * Used by `api/earnings-calendar.ts` (api/ cannot import src/).
 * A unit test compares this list to ALL_TICKERS — keep them identical
 * on every universe add/remove (checklist item 8).
 */
export const UNIVERSE_TICKERS = [
  'RKLB', 'PL', 'RDW', 'LUNR', 'ASTS', 'BKSY', 'FLY', 'KTOS', 'SPCX',
  'NVDA', 'PLTR', 'CRWV', 'IREN', 'NBIS', 'CIFR', 'RIOT', 'VRT', 'MOD',
  'CEG', 'VST', 'BWXT', 'GEV', 'BE', 'CCJ', 'LEU', 'NXE', 'OKLO', 'NNE',
  'LHX', 'AVAV',
  'MSFT', 'GOOGL', 'AMZN', 'META',
  'ANET', 'MU', 'SMCI', 'AVGO', 'INTC', 'DELL',
  'PWR', 'ETN', 'EQIX', 'GNRC',
  'ASML', 'AMAT', 'LRCX', 'KLAC',
  'TSM', 'AMD', 'ARM', 'MRVL',
  'CSCO', 'COHR', 'ORCL', 'SNOW', 'DDOG', 'NOW',
  'HUBB', 'DLR',
  'CRWD', 'PANW', 'NET', 'ZS', 'FTNT',
] as const;
