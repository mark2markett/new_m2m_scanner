import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { SP500_CONSTITUENTS } from '@/lib/data/sp500';
import { parseWatchlistCsv } from '@/lib/data/watchlistLoader';
import { ScannerEngine } from '@/lib/server/scannerEngine';
import { KVStore } from '@/lib/server/kvStore';
import path from 'path';
import fs from 'fs';

const BATCH_SIZE = 10;

export const maxDuration = 300;

/**
 * Load stocks for a named watchlist (CSV-based or full SP500).
 */
function loadWatchlistStocks(watchlistId: string | null | undefined): typeof SP500_CONSTITUENTS {
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
    console.warn(`[Batch] Could not load watchlist '${watchlistId}':`, err);
  }

  return SP500_CONSTITUENTS;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { scanDate, batchIndex, totalBatches, watchlistId } = await request.json();

  if (!scanDate || typeof batchIndex !== 'number' || typeof totalBatches !== 'number') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Load the appropriate stock list for this watchlist
  const allStocks = loadWatchlistStocks(watchlistId);

  const start = batchIndex * BATCH_SIZE;
  const batchStocks = allStocks.slice(start, start + BATCH_SIZE);

  if (batchStocks.length === 0) {
    return NextResponse.json({ error: 'Empty batch' }, { status: 400 });
  }

  // Process this batch
  const results = await ScannerEngine.analyzeBatch(batchStocks);
  await KVStore.setBatchResults(scanDate, batchIndex, results);

  // Update status
  const status = await KVStore.getScanStatus(scanDate);
  if (status) {
    status.completedBatches = batchIndex + 1;
    status.currentBatch = batchIndex + 1;
    status.stocksProcessed = Math.min((batchIndex + 1) * BATCH_SIZE, allStocks.length);
    status.lastUpdatedAt = new Date().toISOString();
    await KVStore.setScanStatus(status);
  }

  const nextBatch = batchIndex + 1;
  const baseUrl = getBaseUrl(request);

  if (nextBatch < totalBatches) {
    // Chain to next batch (pass watchlistId forward)
    waitUntil(
      fetch(`${baseUrl}/api/scanner/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({ scanDate, batchIndex: nextBatch, totalBatches, watchlistId }),
      })
    );
  } else {
    // Last batch — finalize
    waitUntil(
      fetch(`${baseUrl}/api/scanner/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({ scanDate, totalBatches }),
      })
    );
  }

  return NextResponse.json({
    message: `Batch ${batchIndex} complete`,
    processed: batchStocks.length,
    watchlistId: watchlistId || 'sp500_all',
    nextBatch: nextBatch < totalBatches ? nextBatch : 'finalize',
  });
}

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}
