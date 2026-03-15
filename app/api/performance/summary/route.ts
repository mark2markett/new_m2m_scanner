import { NextRequest } from 'next/server';
import { getAuthFromHeader, requireAuth } from '@/lib/server/authService';
import {
  calculatePerformanceSummary,
  calculateGlobalSummary,
} from '@/lib/server/performanceTracker';
import {
  ok,
  unauthorized,
  forbidden,
  handleServiceError,
} from '@/lib/server/apiUtils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/performance/summary
 *
 * Returns aggregate performance statistics for the authenticated user.
 * Includes the primary KPI: high-confidence (≥75 score) win rate.
 *
 * Query params:
 *   scope = 'user' (default) | 'global'   — 'global' requires admin role
 *
 * Authorization: Bearer <token>
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  const scope = request.nextUrl.searchParams.get('scope') ?? 'user';

  if (scope === 'global') {
    if (auth.role !== 'admin') {
      return forbidden('Global summary requires admin role.');
    }
    try {
      const summary = await calculateGlobalSummary();
      return ok(summary);
    } catch (err) {
      return handleServiceError(err);
    }
  }

  // User-scoped summary (default)
  try {
    const summary = await calculatePerformanceSummary(auth.sub);
    return ok(summary);
  } catch (err) {
    return handleServiceError(err);
  }
}
