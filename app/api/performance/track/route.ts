import { NextRequest } from 'next/server';
import { getAuthFromHeader } from '@/lib/server/authService';
import { KVStore } from '@/lib/server/kvStore';
import { trackSetup } from '@/lib/server/performanceTracker';
import {
  ok,
  created,
  unauthorized,
  badRequest,
  notFound,
  handleServiceError,
} from '@/lib/server/apiUtils';

export const dynamic = 'force-dynamic';

/**
 * POST /api/performance/track
 *
 * Marks a scanner result as "tracked" for performance measurement.
 * Only high-confidence setups (compositeScore ≥ 75) can be tracked.
 *
 * Authorization: Bearer <token>
 * Body: { symbol: string; scanDate?: string; notes?: string }
 *
 * The symbol is looked up from the latest scan result in Redis, so
 * the scan must have been run prior to tracking.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  let body: { symbol?: string; scanDate?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  if (!body.symbol || typeof body.symbol !== 'string') {
    return badRequest('symbol is required.');
  }

  const symbol = body.symbol.trim().toUpperCase();

  // Load the latest scan result to look up the stock data
  const latestResult = await KVStore.getLatestResult();
  if (!latestResult) {
    return notFound('No scan results available. Run a scan first.');
  }

  const stock = latestResult.stocks.find(s => s.symbol === symbol);
  if (!stock) {
    return notFound(`Symbol '${symbol}' was not found in the latest scan results.`);
  }

  if (stock.compositeScore < 75) {
    return badRequest(
      `Setup tracking requires compositeScore ≥ 75. '${symbol}' scored ${stock.compositeScore}.`
    );
  }

  try {
    const tracked = await trackSetup(auth.sub, stock, body.notes);
    return created({
      message: `Setup for ${symbol} is now being tracked.`,
      setup: tracked,
    });
  } catch (err) {
    return handleServiceError(err);
  }
}

/**
 * GET /api/performance/track
 *
 * Returns a list of symbols from the latest scan that are eligible
 * for tracking (compositeScore ≥ 75).
 *
 * Authorization: Bearer <token>
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  const latestResult = await KVStore.getLatestResult();
  if (!latestResult) {
    return notFound('No scan results available.');
  }

  const eligible = latestResult.stocks
    .filter(s => !s.error && s.compositeScore >= 75)
    .map(s => ({
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      compositeScore: s.compositeScore,
      compositeTier: s.compositeTier,
      direction: s.compositeDirection,
      price: s.price,
      setupStage: s.setupStage,
      aiSummary: s.aiSummary,
      scanDate: latestResult.scanDate,
    }))
    .sort((a, b) => b.compositeScore - a.compositeScore);

  return ok({
    scanDate: latestResult.scanDate,
    eligibleCount: eligible.length,
    setups: eligible,
  });
}
