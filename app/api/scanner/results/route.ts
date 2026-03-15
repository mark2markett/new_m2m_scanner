import { NextRequest, NextResponse } from 'next/server';
import { KVStore } from '@/lib/server/kvStore';

export const dynamic = 'force-dynamic';

/**
 * GET /api/scanner/results
 *   Returns the latest full scan results.
 *
 * GET /api/scanner/results?watchlist=sp500_top50
 *   Returns results filtered to only include symbols from the specified watchlist.
 *   (Results are post-filtered from the stored full scan.)
 */
export async function GET(request: NextRequest) {
  const result = await KVStore.getLatestResult();

  if (!result) {
    return NextResponse.json(
      { error: 'No scan results available. A scan may not have been run yet.' },
      { status: 404 }
    );
  }

  const watchlistId = request.nextUrl.searchParams.get('watchlist');

  // If a watchlist filter is requested, narrow down the stock list
  if (watchlistId && watchlistId !== 'sp500_all') {
    try {
      const path = await import('path');
      const fs = await import('fs');
      const { parseWatchlistCsv } = await import('@/lib/data/watchlistLoader');

      const csvPath = path.default.join(process.cwd(), 'public', 'watchlists', `${watchlistId}.csv`);
      if (fs.default.existsSync(csvPath)) {
        const csv = fs.default.readFileSync(csvPath, 'utf-8');
        const watchlistStocks = parseWatchlistCsv(csv);
        const symbolSet = new Set(watchlistStocks.map(s => s.symbol));

        const filtered = {
          ...result,
          stocks: result.stocks.filter(s => symbolSet.has(s.symbol)),
        };

        return NextResponse.json(filtered, {
          headers: {
            'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          },
        });
      }
    } catch (err) {
      console.error('[Results] Watchlist filter failed:', err);
      // Fall through to return unfiltered results
    }
  }

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
