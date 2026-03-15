import { NextRequest } from 'next/server';
import {
  authenticateUser,
  validateEmail,
} from '@/lib/server/authService';
import {
  ok,
  badRequest,
  unauthorized,
  serverError,
  checkRateLimit,
  rateLimitError,
} from '@/lib/server/apiUtils';
import type { LoginRequest, AuthResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/login
 *
 * Body: { email, password }
 *
 * Returns: AuthResponse { token, user, expiresAt }
 *
 * Rate limited: 10 attempts per IP per 15 minutes.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';
  if (!checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
    return rateLimitError();
  }

  let body: Partial<LoginRequest>;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const { email, password } = body;

  if (!email || typeof email !== 'string') return badRequest('Email is required.');
  if (!password || typeof password !== 'string') return badRequest('Password is required.');
  if (!validateEmail(email)) return badRequest('Invalid email address.');

  try {
    const result = await authenticateUser(email, password);
    const response: AuthResponse = result;
    return ok(response);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Invalid email or password')) {
      // Use a consistent message to prevent user enumeration
      return unauthorized('Invalid email or password.');
    }
    return serverError('Login failed.', err);
  }
}
