import 'server-only';
import { Redis } from '@upstash/redis';
import { randomUUID } from 'crypto';
import { SP500_CONSTITUENTS } from '@/lib/data/sp500';
import type {
  CustomWatchlist,
  CreateWatchlistRequest,
  UpdateWatchlistRequest,
} from '@/lib/types';

// ─── Redis client ────────────────────────────────────────────────────────────

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ─── Key helpers ─────────────────────────────────────────────────────────────

const KEYS = {
  watchlist: (id: string) => `wl:${id}`,
  userWatchlists: (userId: string) => `wl:user:${userId}`,
};

const WL_TTL = 365 * 24 * 60 * 60;

// ─── Validation ───────────────────────────────────────────────────────────────

const SP500_SYMBOL_SET = new Set(SP500_CONSTITUENTS.map(s => s.symbol));

/** Returns an array of invalid symbols (not in S&P 500). */
export function validateSymbols(symbols: string[]): string[] {
  return symbols
    .map(s => s.trim().toUpperCase())
    .filter(s => !SP500_SYMBOL_SET.has(s));
}

/** Normalize and deduplicate symbols. */
function normalizeSymbols(symbols: string[]): string[] {
  return [...new Set(symbols.map(s => s.trim().toUpperCase()))];
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createWatchlist(
  userId: string,
  req: CreateWatchlistRequest
): Promise<CustomWatchlist> {
  if (!req.name || req.name.trim().length === 0) {
    throw new Error('Watchlist name is required.');
  }
  if (!req.symbols || req.symbols.length === 0) {
    throw new Error('At least one symbol is required.');
  }
  if (req.symbols.length > 503) {
    throw new Error('Watchlist cannot contain more than 503 symbols.');
  }

  const symbols = normalizeSymbols(req.symbols);
  const invalid = validateSymbols(symbols);
  if (invalid.length > 0) {
    throw new Error(
      `The following symbols are not valid S&P 500 constituents: ${invalid.join(', ')}`
    );
  }

  // Check watchlist limit (max 20 per user)
  const existingIds = await redis.smembers(KEYS.userWatchlists(userId));
  if (existingIds && existingIds.length >= 20) {
    throw new Error('Maximum of 20 custom watchlists per user.');
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  const watchlist: CustomWatchlist = {
    id,
    userId,
    name: req.name.trim(),
    description: (req.description ?? '').trim(),
    symbols,
    createdAt: now,
    updatedAt: now,
  };

  await Promise.all([
    redis.set(KEYS.watchlist(id), JSON.stringify(watchlist), { ex: WL_TTL }),
    redis.sadd(KEYS.userWatchlists(userId), id),
    redis.expire(KEYS.userWatchlists(userId), WL_TTL),
  ]);

  return watchlist;
}

export async function getWatchlistById(id: string): Promise<CustomWatchlist | null> {
  return redis.get<CustomWatchlist>(KEYS.watchlist(id));
}

export async function getUserWatchlists(userId: string): Promise<CustomWatchlist[]> {
  const ids = await redis.smembers(KEYS.userWatchlists(userId));
  if (!ids || ids.length === 0) return [];

  const results = await Promise.all(
    ids.map(id => redis.get<CustomWatchlist>(KEYS.watchlist(id)))
  );

  return results
    .filter((w): w is CustomWatchlist => w !== null && w.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function updateWatchlist(
  id: string,
  userId: string,
  req: UpdateWatchlistRequest
): Promise<CustomWatchlist> {
  const existing = await getWatchlistById(id);
  if (!existing) {
    throw Object.assign(new Error('Watchlist not found.'), { status: 404 });
  }
  if (existing.userId !== userId) {
    throw Object.assign(new Error('Forbidden.'), { status: 403 });
  }

  let symbols = existing.symbols;
  if (req.symbols !== undefined) {
    if (req.symbols.length === 0) throw new Error('At least one symbol is required.');
    if (req.symbols.length > 503) throw new Error('Watchlist cannot contain more than 503 symbols.');
    symbols = normalizeSymbols(req.symbols);
    const invalid = validateSymbols(symbols);
    if (invalid.length > 0) {
      throw new Error(
        `The following symbols are not valid S&P 500 constituents: ${invalid.join(', ')}`
      );
    }
  }

  const updated: CustomWatchlist = {
    ...existing,
    name: req.name !== undefined ? req.name.trim() : existing.name,
    description: req.description !== undefined ? req.description.trim() : existing.description,
    symbols,
    updatedAt: new Date().toISOString(),
  };

  await redis.set(KEYS.watchlist(id), JSON.stringify(updated), { ex: WL_TTL });
  return updated;
}

export async function deleteWatchlist(id: string, userId: string): Promise<void> {
  const existing = await getWatchlistById(id);
  if (!existing) {
    throw Object.assign(new Error('Watchlist not found.'), { status: 404 });
  }
  if (existing.userId !== userId) {
    throw Object.assign(new Error('Forbidden.'), { status: 403 });
  }

  await Promise.all([
    redis.del(KEYS.watchlist(id)),
    redis.srem(KEYS.userWatchlists(userId), id),
  ]);
}

/**
 * Add symbols to an existing watchlist (idempotent).
 */
export async function addSymbolsToWatchlist(
  id: string,
  userId: string,
  symbols: string[]
): Promise<CustomWatchlist> {
  const existing = await getWatchlistById(id);
  if (!existing) throw Object.assign(new Error('Watchlist not found.'), { status: 404 });
  if (existing.userId !== userId) throw Object.assign(new Error('Forbidden.'), { status: 403 });

  const toAdd = normalizeSymbols(symbols);
  const invalid = validateSymbols(toAdd);
  if (invalid.length > 0) {
    throw new Error(`Invalid symbols: ${invalid.join(', ')}`);
  }

  const merged = [...new Set([...existing.symbols, ...toAdd])];
  if (merged.length > 503) throw new Error('Watchlist cannot exceed 503 symbols.');

  const updated: CustomWatchlist = {
    ...existing,
    symbols: merged,
    updatedAt: new Date().toISOString(),
  };

  await redis.set(KEYS.watchlist(id), JSON.stringify(updated), { ex: WL_TTL });
  return updated;
}

/**
 * Remove symbols from an existing watchlist.
 */
export async function removeSymbolsFromWatchlist(
  id: string,
  userId: string,
  symbols: string[]
): Promise<CustomWatchlist> {
  const existing = await getWatchlistById(id);
  if (!existing) throw Object.assign(new Error('Watchlist not found.'), { status: 404 });
  if (existing.userId !== userId) throw Object.assign(new Error('Forbidden.'), { status: 403 });

  const toRemove = new Set(normalizeSymbols(symbols));
  const filtered = existing.symbols.filter(s => !toRemove.has(s));
  if (filtered.length === 0) throw new Error('Watchlist must retain at least one symbol.');

  const updated: CustomWatchlist = {
    ...existing,
    symbols: filtered,
    updatedAt: new Date().toISOString(),
  };

  await redis.set(KEYS.watchlist(id), JSON.stringify(updated), { ex: WL_TTL });
  return updated;
}
