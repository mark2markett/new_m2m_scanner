import { NextRequest } from 'next/server';
import {
  createUser,
  signAccessToken,
  validateEmail,
  validatePassword,
} from '@/lib/server/authService';
import {
  ok,
  created,
  badRequest,
  conflict,
  serverError,
  checkRateLimit,
  rateLimitError,
} from '@/lib/server/apiUtils';
import type { RegisterRequest, AuthResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/register
 *
 * Body: { email, password, name }
 *
 * Returns: AuthResponse { token, user, expiresAt }
 *
 * Rate limited: 5 registrations per IP per hour.
 */
export async function POST(request: NextRequest) {
  // Rate limit by IP
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';
  if (!checkRateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) {
    return rateLimitError();
  }

  let body: Partial<RegisterRequest>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const { email, password, name } = body;

  // Validate inputs
  if (!email || typeof email !== 'string') return badRequest('Email is required.');
  if (!password || typeof password !== 'string') return badRequest('Password is required.');
  if (!name || typeof name !== 'string') return badRequest('Name is required.');
  if (name.trim().length < 2) return badRequest('Name must be at least 2 characters.');

  if (!validateEmail(email)) return badRequest('Invalid email address.');

  const pwError = validatePassword(password);
  if (pwError) return badRequest(pwError);

  try {
    const user = await createUser({ email, password, name });

    const token = await signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const response: AuthResponse = { token, user, expiresAt };
    return created(response);
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) {
      return conflict(err.message);
    }
    return serverError('Registration failed.', err);
  }
}
