import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// ─── Routes that require authentication ──────────────────────────────────────

const PROTECTED_PREFIXES = [
  '/api/watchlists',
  '/api/performance',
  '/api/auth/me',
  '/api/auth/logout',
];

// ─── Routes that must only be accessed by admins ─────────────────────────────

const ADMIN_ONLY_PREFIXES: string[] = [
  // Currently handled at the route level (scope=global query param).
  // Add paths here if you want middleware-level enforcement.
];

// ─── Public routes (allow-list for the API prefix) ───────────────────────────

const PUBLIC_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/scanner',        // scanner results/status are public
  '/api/watchlist',      // built-in watchlist index is public
];

// ─── Middleware function ──────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only intercept API routes under protected prefixes
  const needsAuth = PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required.' },
      { status: 401 }
    );
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'm2m-scanner',
      audience: 'm2m-scanner-client',
    });

    // Admin-only route check
    const needsAdmin = ADMIN_ONLY_PREFIXES.some(p => pathname.startsWith(p));
    if (needsAdmin && payload['role'] !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 });
    }

    // Forward the decoded user id in a request header for downstream routes
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload['sub'] as string);
    requestHeaders.set('x-user-role', (payload['role'] as string) ?? 'user');

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 401 });
  }
}

export const config = {
  matcher: [
    '/api/watchlists/:path*',
    '/api/performance/:path*',
    '/api/auth/me/:path*',
    '/api/auth/logout/:path*',
  ],
};
