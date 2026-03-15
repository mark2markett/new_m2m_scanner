import 'server-only';
import { NextResponse } from 'next/server';

// ─── Standardised API response helpers ───────────────────────────────────────

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function badRequest(message: string, details?: unknown): NextResponse {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export function unauthorized(message = 'Authentication required.'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = 'Insufficient permissions.'): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(message = 'Resource not found.'): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function conflict(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 });
}

export function serverError(message = 'Internal server error.', err?: unknown): NextResponse {
  if (err) {
    console.error('[API Error]', err);
  }
  return NextResponse.json({ error: message }, { status: 500 });
}

/**
 * Translate a service-layer error (which may have an attached `.status`) into
 * the correct HTTP response. Falls back to 500.
 */
export function handleServiceError(err: unknown): NextResponse {
  if (err instanceof Error) {
    const status = (err as Error & { status?: number }).status;
    const message = err.message;

    if (status === 401) return unauthorized(message);
    if (status === 403) return forbidden(message);
    if (status === 404) return notFound(message);
    if (status === 409) return conflict(message);
    if (status && status >= 400 && status < 500) return badRequest(message);
    return serverError(message, err);
  }
  return serverError('Unexpected error.', err);
}

// ─── Rate limiting (sliding window, in-memory) ───────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

/**
 * Simple in-memory rate limiter.
 * @param key      - e.g. IP address or user id
 * @param maxReqs  - allowed requests per window
 * @param windowMs - window size in milliseconds
 * @returns true if the request is allowed, false if rate-limited
 */
export function checkRateLimit(key: string, maxReqs: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxReqs) return false;

  entry.count++;
  return true;
}

export function rateLimitError(): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429 }
  );
}
