import { NextRequest, NextResponse } from 'next/server';
import { WATCHLIST_INDEX, parseWatchlistCsv } from '@/lib/data/watchlistLoader';
import { SP500_CONSTITUENTS } from '@/lib/data/sp500';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

/**
 * GET /api/watchlist
 *   Returns the list of available watchlists.
 *
 * GET /api/watchlist?id=sp500_top50
 *   Returns the stocks in the specified watchlist.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');

  // No id — return the index of available watchlists
  if (!id) {
    return NextResponse.json(WATCHLIST_INDEX);
  }

  // sp500_all — return full list
  if (id === 'sp500_all') {
    return NextResponse.json(SP500_CONSTITUENTS);
  }

  // Find the watchlist in the index
  const meta = WATCHLIST_INDEX.find(w => w.id === id);
  if (!meta) {
    return NextResponse.json({ error: `Watchlist '${id}' not found.` }, { status: 404 });
  }

  // Load the CSV from the public directory
  try {
    const csvPath = path.join(process.cwd(), 'public', 'watchlists', `${id}.csv`);
    if (!fs.existsSync(csvPath)) {
      return NextResponse.json({ error: `CSV file for '${id}' not found.` }, { status: 404 });
    }
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const stocks = parseWatchlistCsv(csvContent);
    return NextResponse.json(stocks);
  } catch (err) {
    console.error('[Watchlist API] Failed to load CSV:', err);
    return NextResponse.json({ error: 'Failed to load watchlist.' }, { status: 500 });
  }
}
