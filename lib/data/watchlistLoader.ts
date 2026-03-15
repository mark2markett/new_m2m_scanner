import type { SP500Stock, WatchlistMeta } from '@/lib/types';
import { SP500_CONSTITUENTS } from '@/lib/data/sp500';

/**
 * Parse a simple CSV string into SP500Stock records.
 * Expected header: symbol,name,sector
 */
export function parseWatchlistCsv(csv: string): SP500Stock[] {
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Skip header row
  const dataLines = lines[0].toLowerCase().startsWith('symbol') ? lines.slice(1) : lines;

  const stocks: SP500Stock[] = [];
  for (const line of dataLines) {
    // Handle quoted fields (e.g. names with commas)
    const parts = parseCsvLine(line);
    if (parts.length < 3) continue;
    const [symbol, name, sector] = parts;
    if (!symbol) continue;
    stocks.push({ symbol: symbol.trim().toUpperCase(), name: name.trim(), sector: sector.trim() });
  }

  return stocks;
}

/**
 * Minimal CSV line parser that handles double-quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Resolve a watchlist by ID into an array of SP500Stock.
 * 'sp500_all' (or null/undefined) returns the full constituent list.
 * Other IDs are loaded from the CSV files in /public/watchlists/.
 *
 * This function is used server-side only (reads from public/ via URL fetch
 * or directly by the API route).
 */
export function resolveWatchlist(
  watchlistId: string | null | undefined,
  csvContent: string | null
): SP500Stock[] {
  if (!watchlistId || watchlistId === 'sp500_all') {
    return SP500_CONSTITUENTS;
  }

  if (csvContent) {
    const parsed = parseWatchlistCsv(csvContent);
    return parsed.length > 0 ? parsed : SP500_CONSTITUENTS;
  }

  return SP500_CONSTITUENTS;
}

/**
 * Built-in watchlist metadata (mirrors public/watchlists/index.json).
 * Exported so server routes can list available watchlists without a fetch.
 */
export const WATCHLIST_INDEX: WatchlistMeta[] = [
  { id: 'sp500_all',        name: 'S&P 500 — All 503',                description: 'Full S&P 500 constituent list',                  count: SP500_CONSTITUENTS.length },
  { id: 'sp500_top50',      name: 'S&P 500 — Top 50 by Market Cap',   description: '50 largest S&P 500 companies by market cap',      count: 50 },
  { id: 'sp500_tech',       name: 'S&P 500 — Technology Sector',      description: 'Information Technology sector constituents',      count: 45 },
  { id: 'sp500_financials', name: 'S&P 500 — Financials Sector',      description: 'Financials sector constituents',                  count: 30 },
];
