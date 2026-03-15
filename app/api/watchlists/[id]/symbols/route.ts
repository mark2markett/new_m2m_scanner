import { NextRequest } from 'next/server';
import { getAuthFromHeader } from '@/lib/server/authService';
import {
  addSymbolsToWatchlist,
  removeSymbolsFromWatchlist,
} from '@/lib/server/watchlistService';
import {
  ok,
  unauthorized,
  badRequest,
  handleServiceError,
} from '@/lib/server/apiUtils';

export const dynamic = 'force-dynamic';

/**
 * POST /api/watchlists/:id/symbols
 *
 * Add one or more symbols to a watchlist (idempotent).
 *
 * Body: { symbols: string[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  let body: { symbols?: string[] };
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  if (!Array.isArray(body.symbols) || body.symbols.length === 0) {
    return badRequest('symbols must be a non-empty array.');
  }

  try {
    const updated = await addSymbolsToWatchlist(params.id, auth.sub, body.symbols);
    return ok(updated);
  } catch (err) {
    return handleServiceError(err);
  }
}

/**
 * DELETE /api/watchlists/:id/symbols
 *
 * Remove one or more symbols from a watchlist.
 *
 * Body: { symbols: string[] }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  let body: { symbols?: string[] };
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  if (!Array.isArray(body.symbols) || body.symbols.length === 0) {
    return badRequest('symbols must be a non-empty array.');
  }

  try {
    const updated = await removeSymbolsFromWatchlist(params.id, auth.sub, body.symbols);
    return ok(updated);
  } catch (err) {
    return handleServiceError(err);
  }
}
