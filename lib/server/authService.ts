import 'server-only';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { Redis } from '@upstash/redis';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import type {
  User,
  PublicUser,
  AuthTokenPayload,
  RegisterRequest,
  UserRole,
} from '@/lib/types';

// ─── Redis client ────────────────────────────────────────────────────────────

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ─── Key helpers ─────────────────────────────────────────────────────────────

const KEYS = {
  user: (id: string) => `user:${id}`,
  userByEmail: (email: string) => `user:email:${email.toLowerCase()}`,
  userList: 'users:all',
  revokedToken: (jti: string) => `auth:revoked:${jti}`,
};

// Keep user data for 1 year (refreshed on login)
const USER_TTL = 365 * 24 * 60 * 60;
// Revoked tokens expire after 24 h (matches access token lifetime)
const REVOKED_TTL = 24 * 60 * 60;

// ─── JWT helpers ─────────────────────────────────────────────────────────────

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set.');
  }
  return new TextEncoder().encode(secret);
}

/** Signs a JWT access token valid for 24 hours. */
export async function signAccessToken(payload: AuthTokenPayload): Promise<string> {
  const jti = randomUUID();
  return new SignJWT({ ...payload, jti } as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .setIssuer('m2m-scanner')
    .setAudience('m2m-scanner-client')
    .sign(getJwtSecret());
}

/** Verifies a JWT and returns its payload, or throws on invalid/expired. */
export async function verifyAccessToken(token: string): Promise<AuthTokenPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    issuer: 'm2m-scanner',
    audience: 'm2m-scanner-client',
  });

  // Check token revocation list
  const jti = payload.jti as string | undefined;
  if (jti) {
    const revoked = await redis.get(KEYS.revokedToken(jti));
    if (revoked) {
      throw new Error('Token has been revoked.');
    }
  }

  return payload as unknown as AuthTokenPayload;
}

/** Revokes a token (adds its jti to the denylist). */
export async function revokeToken(token: string): Promise<void> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: 'm2m-scanner',
      audience: 'm2m-scanner-client',
    });
    const jti = payload.jti as string | undefined;
    if (jti) {
      await redis.set(KEYS.revokedToken(jti), '1', { ex: REVOKED_TTL });
    }
  } catch {
    // If token is already invalid we don't need to revoke it
  }
}

// ─── Password helpers ────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── Validation helpers ──────────────────────────────────────────────��───────

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  return null;
}

// ─── User CRUD ───────────────────────────────────────────────────────────────

/** Create a new user account. Returns the public user record. */
export async function createUser(req: RegisterRequest): Promise<PublicUser> {
  const emailKey = KEYS.userByEmail(req.email);

  // Check for existing account
  const existingId = await redis.get<string>(emailKey);
  if (existingId) {
    throw new Error('An account with this email already exists.');
  }

  const now = new Date().toISOString();
  const id = randomUUID();
  const passwordHash = await hashPassword(req.password);

  const user: User = {
    id,
    email: req.email.toLowerCase(),
    name: req.name.trim(),
    role: 'user',
    provider: 'credentials',
    passwordHash,
    createdAt: now,
    updatedAt: now,
  };

  // Store user record and email→id index
  await Promise.all([
    redis.set(KEYS.user(id), JSON.stringify(user), { ex: USER_TTL }),
    redis.set(emailKey, id, { ex: USER_TTL }),
    redis.sadd(KEYS.userList, id),
  ]);

  return toPublicUser(user);
}

/** Look up a user by id. */
export async function getUserById(id: string): Promise<User | null> {
  const data = await redis.get<User>(KEYS.user(id));
  return data ?? null;
}

/** Look up a user by email. */
export async function getUserByEmail(email: string): Promise<User | null> {
  const id = await redis.get<string>(KEYS.userByEmail(email.toLowerCase()));
  if (!id) return null;
  return getUserById(id);
}

/** Persist updated user fields. */
export async function updateUser(id: string, updates: Partial<User>): Promise<PublicUser | null> {
  const existing = await getUserById(id);
  if (!existing) return null;

  const updated: User = {
    ...existing,
    ...updates,
    id,                             // never overwrite id
    updatedAt: new Date().toISOString(),
  };

  await redis.set(KEYS.user(id), JSON.stringify(updated), { ex: USER_TTL });
  return toPublicUser(updated);
}

/** Strip sensitive fields before returning to clients. */
export function toPublicUser(user: User): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _ph, ...pub } = user;
  return pub;
}

// ─── Session / Auth Flow ─────────────────────────────────────────────────────

/**
 * Authenticate credentials and return a signed JWT + public user.
 * Throws a descriptive error on failure (catch and return 401).
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<{ token: string; user: PublicUser; expiresAt: string }> {
  const user = await getUserByEmail(email);
  if (!user || !user.passwordHash) {
    throw new Error('Invalid email or password.');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new Error('Invalid email or password.');
  }

  // Update last login timestamp (fire-and-forget)
  updateUser(user.id, { lastLoginAt: new Date().toISOString() }).catch(() => {});

  const payload: AuthTokenPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  const token = await signAccessToken(payload);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  return { token, user: toPublicUser(user), expiresAt };
}

// ─── Request Auth Extraction ─────────────────────────────────────────────────

/**
 * Extract and verify the Bearer token from an Authorization header.
 * Returns the decoded payload or null if missing/invalid.
 */
export async function getAuthFromHeader(
  authHeader: string | null
): Promise<AuthTokenPayload | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}

/**
 * Guard: require a valid auth token. Returns auth payload or throws.
 * Use in route handlers to protect endpoints.
 */
export async function requireAuth(
  authHeader: string | null,
  requiredRole?: UserRole
): Promise<AuthTokenPayload> {
  const auth = await getAuthFromHeader(authHeader);
  if (!auth) {
    throw Object.assign(new Error('Authentication required.'), { status: 401 });
  }
  if (requiredRole && auth.role !== requiredRole && auth.role !== 'admin') {
    throw Object.assign(new Error('Insufficient permissions.'), { status: 403 });
  }
  return auth;
}
