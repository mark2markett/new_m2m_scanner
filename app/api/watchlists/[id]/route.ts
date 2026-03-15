import { NextRequest } from 'next/server';
import { getAuthFromHeader } from '@/lib/server/authService';
import {
  getWatchlistById,
  updateWatchlist,
  deleteWatchlist,
  addSymbolsToWatchlist,
  removeSymbolsFromWatchlist,
} from '@/lib/server/watchlistService';
import {
  ok,
  noContent,
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  handleServiceError,
} from '@/lib/server/apiUtils';
import type { UpdateWatchlistRequest } from '@/lib/types';

export const dynamic = 'force-dynamic';

// ─── GET /api/watchlists/[id] ────────────────────────────────────────────────

/**
 * GET /api/watchlists/:id
 *
 * Returns a single custom watchlist by ID.
 * Must belong to the authenticated user.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  const watchlist = await getWatchlistById(params.id);
  if (!watchlist) return notFound('Watchlist not found.');
  if (watchlist.userId !== auth.sub && auth.role !== 'admin') return forbidden();

  return ok(watchlist);
}

// ─── PATCH /api/watchlists/[id] ──────────────────────────────────────────────

/**
 * PATCH /api/watchlists/:id
 *
 * Update watchlist metadata or symbols.
 *
 * Body: { name?: string; description?: string; symbols?: string[] }
 *
 * To add/remove individual symbols use the /symbols sub-resource.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  let body: Partial<UpdateWatchlistRequest>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  try {
    const updated = await updateWatchlist(params.id, auth.sub, body);
    return ok(updated);
  } catch (err) {
    return handleServiceError(err);
  }
}

// ─── DELETE /api/watchlists/[id] ─────────────────────────────────────────────

/**
 * DELETE /api/watchlists/:id
 *
 * Permanently deletes a watchlist.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  try {
    await deleteWatchlist(params.id, auth.sub);
    return noContent();
  } catch (err) {
    return handleServiceError(err);
  }
}
