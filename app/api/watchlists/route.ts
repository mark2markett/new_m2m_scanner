import { NextRequest } from 'next/server';
import { getAuthFromHeader } from '@/lib/server/authService';
import {
  createWatchlist,
  getUserWatchlists,
} from '@/lib/server/watchlistService';
import {
  ok,
  created,
  unauthorized,
  badRequest,
  handleServiceError,
} from '@/lib/server/apiUtils';
import type { CreateWatchlistRequest } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/watchlists
 *
 * Returns all custom watchlists for the authenticated user.
 *
 * Authorization: Bearer <token>
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  try {
    const watchlists = await getUserWatchlists(auth.sub);
    return ok(watchlists);
  } catch (err) {
    return handleServiceError(err);
  }
}

/**
 * POST /api/watchlists
 *
 * Create a new custom watchlist.
 *
 * Authorization: Bearer <token>
 * Body: { name: string; description?: string; symbols: string[] }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  let body: Partial<CreateWatchlistRequest>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  if (!body.name || typeof body.name !== 'string') {
    return badRequest('Watchlist name is required.');
  }
  if (!Array.isArray(body.symbols) || body.symbols.length === 0) {
    return badRequest('symbols must be a non-empty array of ticker strings.');
  }

  try {
    const watchlist = await createWatchlist(auth.sub, {
      name: body.name,
      description: body.description,
      symbols: body.symbols,
    });
    return created(watchlist);
  } catch (err) {
    return handleServiceError(err);
  }
}
