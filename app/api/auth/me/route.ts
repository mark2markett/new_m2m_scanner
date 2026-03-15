import { NextRequest } from 'next/server';
import {
  getAuthFromHeader,
  getUserById,
  toPublicUser,
  updateUser,
  hashPassword,
  validatePassword,
} from '@/lib/server/authService';
import {
  ok,
  badRequest,
  unauthorized,
  notFound,
  serverError,
} from '@/lib/server/apiUtils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's profile.
 *
 * Authorization: Bearer <token>
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  const user = await getUserById(auth.sub);
  if (!user) return notFound('User not found.');

  return ok(toPublicUser(user));
}

/**
 * PATCH /api/auth/me
 *
 * Update the current user's profile (name and/or password).
 *
 * Authorization: Bearer <token>
 * Body: { name?: string; password?: string }
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthFromHeader(request.headers.get('authorization'));
  if (!auth) return unauthorized();

  let body: { name?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const updates: Record<string, string> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length < 2) {
      return badRequest('Name must be at least 2 characters.');
    }
    updates.name = body.name.trim();
  }

  if (body.password !== undefined) {
    if (typeof body.password !== 'string') {
      return badRequest('Password must be a string.');
    }
    const pwError = validatePassword(body.password);
    if (pwError) return badRequest(pwError);
    updates.passwordHash = await hashPassword(body.password);
  }

  if (Object.keys(updates).length === 0) {
    return badRequest('No updatable fields provided (name, password).');
  }

  try {
    const updated = await updateUser(auth.sub, updates);
    if (!updated) return notFound('User not found.');
    return ok(updated);
  } catch (err) {
    return serverError('Failed to update profile.', err);
  }
}
