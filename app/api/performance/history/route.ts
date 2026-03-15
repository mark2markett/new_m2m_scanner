import { NextRequest } from 'next/server';
import { getAuthFromHeader } from '@/lib/server/authService';
import {
  getUserSetups,
  getSetupById,
  recordOutcome,
} from '@/lib/server/performanceTracker';
import {
  ok,
  unauthorized,
  badRequest,
  notFound,
  handleServiceError,
} from '@/lib/server/apiUtils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/performance/history
 *
 * Returns the authenticated user's tracked setups (performance history).
 *
 * Query params:
 *   status    = 'open' | 'closed'          (optional filter)
 *   fromDate  = YYYY-MM-DD                  (optional)
 *   toDate    = YYYY-MM-DD                  (optional)
 *   limit     = number (default 50, max 200)
 *   offset    = number (default 0)
 *
 * Authorization: Bearer <token>
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status') as 'open' | 'closed' | null;
  const fromDate = searchParams.get('fromDate') ?? undefined;
  const toDate = searchParams.get('toDate') ?? undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  if (status && status !== 'open' && status !== 'closed') {
    return badRequest("status must be 'open' or 'closed'.");
  }

  try {
    const records = await getUserSetups(auth.sub, { status: status ?? undefined, fromDate, toDate, limit, offset });
    return ok({
      total: records.length,
      offset,
      limit,
      records,
    });
  } catch (err) {
    return handleServiceError(err);
  }
}

/**
 * POST /api/performance/history
 *
 * Record an outcome for a tracked setup (close it out).
 *
 * Authorization: Bearer <token>
 * Body: {
 *   setupId:   string;
 *   exitPrice: number;
 *   exitDate:  string;  // YYYY-MM-DD
 *   notes?:    string;
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  let body: {
    setupId?: string;
    exitPrice?: number;
    exitDate?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  if (!body.setupId || typeof body.setupId !== 'string') {
    return badRequest('setupId is required.');
  }
  if (typeof body.exitPrice !== 'number' || body.exitPrice <= 0) {
    return badRequest('exitPrice must be a positive number.');
  }
  if (!body.exitDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.exitDate)) {
    return badRequest('exitDate must be in YYYY-MM-DD format.');
  }

  // Verify the setup belongs to the user before recording
  const setup = await getSetupById(body.setupId);
  if (!setup) return notFound(`Setup '${body.setupId}' not found.`);

  try {
    const outcome = await recordOutcome(
      body.setupId,
      auth.sub,
      body.exitPrice,
      body.exitDate,
      body.notes
    );
    return ok({
      message: `Setup outcome recorded.`,
      outcome,
    });
  } catch (err) {
    return handleServiceError(err);
  }
}
