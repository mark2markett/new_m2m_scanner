import { NextRequest } from 'next/server';
import { getAuthFromHeader } from '@/lib/server/authService';
import {
  getSetupById,
  getOutcomeById,
} from '@/lib/server/performanceTracker';
import {
  ok,
  unauthorized,
  forbidden,
  notFound,
  handleServiceError,
} from '@/lib/server/apiUtils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/performance/setups/:id
 *
 * Returns a single tracked setup (with outcome if closed).
 *
 * Authorization: Bearer <token>
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  try {
    const setup = await getSetupById(params.id);
    if (!setup) return notFound(`Setup '${params.id}' not found.`);

    // Users can only view their own setups; admins can view any
    if (setup.userId !== auth.sub && auth.role !== 'admin') {
      return forbidden();
    }

    let outcome = null;
    if (setup.status === 'closed') {
      outcome = await getOutcomeById(params.id);
    }

    return ok({ setup, outcome });
  } catch (err) {
    return handleServiceError(err);
  }
}
