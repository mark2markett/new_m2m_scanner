import 'server-only';
import { CacheService } from './cacheService';

// Cache TTLs (minutes)
const QUOTE_CACHE_TTL   = 5;
const HISTORY_CACHE_TTL = 60;
const DETAILS_CACHE_TTL = 30;

export interface PolygonBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number; // Unix ms
}

export interface PolygonStockDetails {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  peRatio: number;
  lastUpdated: string;
}

function getApiKey(): string {
  const key = process.env.POLYGON_API_KEY;
  if (!key || key === 'your_polygon_api_key_here') {
    throw new Error('Polygon API key not configured. Set POLYGON_API_KEY in your .env.local file.');
  }
  return key;
}

/**
 * Build a date string N calendar days in the past (YYYY-MM-DD).
 */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export class PolygonService {
  /**
   * Fetch the latest quote + company details for a symbol.
   * Combines the v2/snapshot and v3/reference/tickers endpoints.
   */
  static async getStockDetails(symbol: string): Promise<PolygonStockDetails> {
    const cacheKey = `details-${symbol}`;
    const cached = CacheService.get(cacheKey);
    if (cached) return cached;

    const apiKey = getApiKey();

    // --- Snapshot (price / volume / change) ---
    const snapUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apikey=${apiKey}`;
    const snapRes = await fetch(snapUrl, { next: { revalidate: 0 } });

    if (!snapRes.ok) {
      throw new Error(`Polygon snapshot failed for ${symbol}: HTTP ${snapRes.status}`);
    }

    const snapData = await snapRes.json();
    const ticker = snapData?.ticker;

    if (!ticker) {
      throw new Error(`No snapshot data returned for ${symbol}`);
    }

    const price         = ticker.day?.c ?? ticker.prevDay?.c ?? 0;
    const prevClose     = ticker.prevDay?.c ?? price;
    const change        = price - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;
    const volume        = ticker.day?.v ?? ticker.prevDay?.v ?? 0;

    // --- Reference data (market cap, PE) ---
    let marketCap = 0;
    let peRatio   = 0;
    let name      = symbol;

    try {
      const refUrl  = `https://api.polygon.io/v3/reference/tickers/${symbol}?apikey=${apiKey}`;
      const refRes  = await fetch(refUrl, { next: { revalidate: 0 } });
      if (refRes.ok) {
        const refData = await refRes.json();
        const r = refData?.results;
        if (r) {
          name      = r.name ?? symbol;
          marketCap = r.market_cap ?? 0;
        }
      }
    } catch {
      // non-fatal — use defaults
    }

    // Polygon free tier does not expose PE directly; set 0 and let fundamentalAnalysis handle it
    peRatio = 0;

    const result: PolygonStockDetails = {
      symbol,
      name,
      price,
      change,
      changePercent,
      volume,
      marketCap,
      peRatio,
      lastUpdated: new Date().toISOString(),
    };

    CacheService.set(cacheKey, result, DETAILS_CACHE_TTL);
    return result;
  }

  /**
   * Fetch historical OHLCV bars.
   *
   * @param symbol   - Ticker symbol
   * @param timespan - 'day' | 'hour' | 'minute'
   * @param limit    - Max number of bars to return (most recent first is reversed to oldest-first)
   */
  static async getHistoricalData(
    symbol: string,
    timespan: 'day' | 'hour' | 'minute' = 'day',
    limit: number = 120
  ): Promise<PolygonBar[]> {
    const cacheKey = `history-${symbol}-${timespan}-${limit}`;
    const cached   = CacheService.get(cacheKey);
    if (cached) return cached;

    const apiKey = getApiKey();

    // Calculate date range — go back far enough to get `limit` trading bars
    // Trading days ≈ 70% of calendar days; add 40% buffer for weekends/holidays
    const calendarDays = timespan === 'day' ? Math.ceil(limit * 1.45) + 10 : 7;
    const fromDate     = daysAgo(calendarDays);
    const toDate       = daysAgo(0); // today

    const url =
      `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timespan}/${fromDate}/${toDate}` +
      `?adjusted=true&sort=asc&limit=${limit + 30}&apikey=${apiKey}`;

    const res = await fetch(url, { next: { revalidate: 0 } });

    if (!res.ok) {
      throw new Error(`Polygon history failed for ${symbol}: HTTP ${res.status}`);
    }

    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      throw new Error(`No historical data returned for ${symbol}`);
    }

    const bars: PolygonBar[] = data.results.map((r: any) => ({
      open:      r.o,
      high:      r.h,
      low:       r.l,
      close:     r.c,
      volume:    r.v,
      timestamp: r.t,
    }));

    // Keep the most-recent `limit` bars (data is sorted asc by Polygon)
    const trimmed = bars.slice(-limit);

    CacheService.set(cacheKey, trimmed, HISTORY_CACHE_TTL);
    return trimmed;
  }

  /**
   * Fetch the current SPY price history (used for relative strength calculation).
   * Cached longer because all stocks share the same SPY data per scan run.
   */
  static async getSpyHistory(limit: number = 120): Promise<PolygonBar[]> {
    const cacheKey = `spy-history-${limit}`;
    const cached   = CacheService.get(cacheKey);
    if (cached) return cached;

    const bars = await this.getHistoricalData('SPY', 'day', limit);
    CacheService.set(cacheKey, bars, HISTORY_CACHE_TTL);
    return bars;
  }

  /**
   * Batch fetch SPY history once per scanner run and return just the closes.
   * Designed to be called once and shared across all analyzeStock() calls.
   */
  static async getSpyCloses(limit: number = 120): Promise<number[]> {
    const bars = await this.getSpyHistory(limit);
    return bars.map(b => b.close);
  }
}
