import { NextRequest } from 'next/server';
import { revokeToken } from '@/lib/server/authService';
import { ok, badRequest } from '@/lib/server/apiUtils';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/logout
 *
 * Revokes the current access token (adds jti to denylist).
 * The client should also discard the token locally.
 *
 * Authorization: Bearer <token>
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return badRequest('No token provided.');
  }

  const token = authHeader.slice(7);
  await revokeToken(token);

  return ok({ message: 'Logged out successfully.' });
}
