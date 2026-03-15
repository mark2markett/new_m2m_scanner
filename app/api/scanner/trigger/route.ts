import { NextRequest, NextResponse } from 'next/server';
import { SP500_CONSTITUENTS } from '@/lib/data/sp500';
import { parseWatchlistCsv } from '@/lib/data/watchlistLoader';
import { ScannerEngine } from '@/lib/server/scannerEngine';
import { KVStore } from '@/lib/server/kvStore';
import type { ScanBatchStatus } from '@/lib/types';
import path from 'path';
import fs from 'fs';

const BATCH_SIZE = 10;

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = request.headers.get('authorization');
  if (cronSecret === `Bearer ${process.env.CRON_SECRET}`) return true;

  const secret = request.nextUrl.searchParams.get('secret');
  if (secret === process.env.CRON_SECRET) return true;

  return false;
}

/**
 * Load stocks for a named watchlist (CSV-based or full SP500).
 */
function loadWatchlistStocks(watchlistId: string | null): ReturnType<typeof SP500_CONSTITUENTS.slice> {
  if (!watchlistId || watchlistId === 'sp500_all') {
    return SP500_CONSTITUENTS;
  }

  try {
    const csvPath = path.join(process.cwd(), 'public', 'watchlists', `${watchlistId}.csv`);
    if (fs.existsSync(csvPath)) {
      const csv = fs.readFileSync(csvPath, 'utf-8');
      const parsed = parseWatchlistCsv(csv);
      if (parsed.length > 0) return parsed;
    }
  } catch (err) {
    console.warn(`[Trigger] Could not load watchlist '${watchlistId}':`, err);
  }

  return SP500_CONSTITUENTS;
}

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Watchlist selection — CSV watchlist or full S&P 500
  const watchlistId = request.nextUrl.searchParams.get('watchlist');
  const allStocks = loadWatchlistStocks(watchlistId);
  const totalAll = allStocks.length;

  // Dynamic slice parameters
  const startIndex = parseInt(request.nextUrl.searchParams.get('start') || '0', 10);
  const endIndex   = parseInt(request.nextUrl.searchParams.get('end')   || String(totalAll), 10);

  const sliceStocks = allStocks.slice(startIndex, endIndex);
  const sliceSize = sliceStocks.length;

  if (sliceSize === 0) {
    return NextResponse.json({ error: 'Empty slice' }, { status: 400 });
  }

  const now = new Date();
  const scanDate = now.toISOString().split('T')[0];
  const totalBatches = Math.ceil(sliceSize / BATCH_SIZE);

  // Update scan status
  const status: ScanBatchStatus = {
    scanDate,
    totalBatches,
    completedBatches: 0,
    currentBatch: 0,
    status: 'running',
    stocksProcessed: 0,
    totalStocks: totalAll,
    startedAt: now.toISOString(),
    lastUpdatedAt: now.toISOString(),
  };
  await KVStore.setScanStatus(status);

  // Process all batches in this slice sequentially
  const allResults: import('@/lib/types').ScannerStockResult[] = [];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const bStart = batchIndex * BATCH_SIZE;
    const batchStocks = sliceStocks.slice(bStart, bStart + BATCH_SIZE);
    const batchResults = await ScannerEngine.analyzeBatch(batchStocks);
    allResults.push(...batchResults);

    status.completedBatches = batchIndex + 1;
    status.currentBatch = batchIndex + 1;
    status.stocksProcessed = Math.min((batchIndex + 1) * BATCH_SIZE, sliceSize);
    status.lastUpdatedAt = new Date().toISOString();
    await KVStore.setScanStatus(status);
  }

  // Store this slice's results keyed by start-end
  await KVStore.setSliceResults(scanDate, startIndex, endIndex, allResults);

  return NextResponse.json({
    message: `Slice ${startIndex}-${endIndex} complete`,
    scanDate,
    watchlist: watchlistId || 'sp500_all',
    sliceStocks: sliceSize,
    successCount: allResults.filter(s => !s.error).length,
    errorCount: allResults.filter(s => !!s.error).length,
  });
}
