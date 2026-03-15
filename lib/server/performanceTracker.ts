import 'server-only';
import { Redis } from '@upstash/redis';
import { randomUUID } from 'crypto';
import type {
  TrackedSetup,
  SetupOutcome,
  PerformanceRecord,
  PerformanceSummary,
  ScannerStockResult,
  SetupDirection,
} from '@/lib/types';

// ─── Redis client ────────────────────────────────────────────────────────────

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ─── Key helpers ─────────────────────────────────────────────────────────────

const KEYS = {
  setup: (id: string) => `perf:setup:${id}`,
  outcome: (id: string) => `perf:outcome:${id}`,
  userSetups: (userId: string) => `perf:user:${userId}:setups`,
  globalSetups: 'perf:global:setups',
};

// 90-day TTL for individual records; the set keys are kept longer
const RECORD_TTL = 90 * 24 * 60 * 60;
const SET_TTL = 365 * 24 * 60 * 60;

// ─── Track a new setup ────────────────────────────────────────────────────────

/**
 * Record a high-confidence setup from a scanner result for performance tracking.
 * Only setups with compositeScore ≥ 75 should be tracked (enforced by callers,
 * but also validated here).
 */
export async function trackSetup(
  userId: string,
  stock: ScannerStockResult,
  notes?: string
): Promise<TrackedSetup> {
  if (stock.compositeScore < 75) {
    throw new Error(
      `Setup tracking requires compositeScore ≥ 75 (got ${stock.compositeScore}).`
    );
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const scanDate = now.split('T')[0];

  const setup: TrackedSetup = {
    id,
    userId,
    symbol: stock.symbol,
    scanDate,
    trackedAt: now,
    direction: stock.setupDirection,
    compositeScore: stock.compositeScore,
    entryPrice: stock.price,
    setupStage: stock.setupStage,
    technicalScore: stock.technicalScore,
    fundamentalScore: stock.fundamentalScore,
    sentimentScore: stock.sentimentScore,
    sector: stock.sector,
    aiSummary: stock.aiSummary,
    notes,
    status: 'open',
  };

  await Promise.all([
    redis.set(KEYS.setup(id), JSON.stringify(setup), { ex: RECORD_TTL }),
    redis.sadd(KEYS.userSetups(userId), id),
    redis.sadd(KEYS.globalSetups, id),
    redis.expire(KEYS.userSetups(userId), SET_TTL),
    redis.expire(KEYS.globalSetups, SET_TTL),
  ]);

  return setup;
}

// ─── Record an outcome ────────────────────────────────────────────────────────

/**
 * Record the outcome for a previously tracked setup.
 * Calculates P&L and win/loss/breakeven automatically.
 */
export async function recordOutcome(
  setupId: string,
  userId: string,
  exitPrice: number,
  exitDate: string,
  notes?: string
): Promise<SetupOutcome> {
  const setup = await getSetupById(setupId);

  if (!setup) {
    throw new Error(`Setup '${setupId}' not found.`);
  }
  if (setup.userId !== userId) {
    throw Object.assign(new Error('Forbidden.'), { status: 403 });
  }
  if (setup.status === 'closed') {
    throw new Error(`Setup '${setupId}' is already closed.`);
  }

  const entryDate = new Date(setup.scanDate);
  const exit = new Date(exitDate);
  const holdingDays = Math.max(
    0,
    Math.round((exit.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  const pnlPct = setup.entryPrice > 0
    ? ((exitPrice - setup.entryPrice) / setup.entryPrice) * 100
    : 0;

  // For bearish setups, flip the P&L sign (profit when price falls)
  const adjustedPnlPct = setup.direction === 'bearish' ? -pnlPct : pnlPct;

  const outcome: SetupOutcome = {
    id: setupId,
    exitPrice,
    exitDate,
    holdingDays,
    pnlPct: parseFloat(adjustedPnlPct.toFixed(2)),
    outcome: adjustedPnlPct > 1 ? 'win' : adjustedPnlPct < -1 ? 'loss' : 'breakeven',
    notes,
  };

  // Mark setup as closed
  const updatedSetup: TrackedSetup = { ...setup, status: 'closed' };

  await Promise.all([
    redis.set(KEYS.outcome(setupId), JSON.stringify(outcome), { ex: RECORD_TTL }),
    redis.set(KEYS.setup(setupId), JSON.stringify(updatedSetup), { ex: RECORD_TTL }),
  ]);

  return outcome;
}

// ─── Retrieval ────────────────────────────────────────────────────────────────

export async function getSetupById(id: string): Promise<TrackedSetup | null> {
  return redis.get<TrackedSetup>(KEYS.setup(id));
}

export async function getOutcomeById(id: string): Promise<SetupOutcome | null> {
  return redis.get<SetupOutcome>(KEYS.outcome(id));
}

/**
 * Returns all tracked setups for a user, newest first.
 * Optionally filtered by status or date range.
 */
export async function getUserSetups(
  userId: string,
  opts?: {
    status?: 'open' | 'closed';
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }
): Promise<PerformanceRecord[]> {
  const ids = await redis.smembers(KEYS.userSetups(userId));
  if (!ids || ids.length === 0) return [];

  // Batch-fetch all setups
  const setupDataArr = await Promise.all(ids.map(id => redis.get<TrackedSetup>(KEYS.setup(id))));
  const setups = setupDataArr.filter((s): s is TrackedSetup => s !== null);

  // Apply filters
  let filtered = setups;

  if (opts?.status) {
    filtered = filtered.filter(s => s.status === opts.status);
  }
  if (opts?.fromDate) {
    filtered = filtered.filter(s => s.scanDate >= opts.fromDate!);
  }
  if (opts?.toDate) {
    filtered = filtered.filter(s => s.scanDate <= opts.toDate!);
  }

  // Sort newest first
  filtered.sort((a, b) => b.trackedAt.localeCompare(a.trackedAt));

  // Pagination
  const offset = opts?.offset ?? 0;
  const limit = opts?.limit ?? 100;
  const page = filtered.slice(offset, offset + limit);

  // Merge outcomes for closed setups
  const records: PerformanceRecord[] = await Promise.all(
    page.map(async (setup): Promise<PerformanceRecord> => {
      if (setup.status === 'closed') {
        const outcome = await getOutcomeById(setup.id);
        return { ...setup, outcome: outcome ?? undefined };
      }
      return setup;
    })
  );

  return records;
}

// ─── Performance Summary ─────────────────────────────────────────────────────

/**
 * Calculate aggregate performance statistics for a user.
 * Computes the key KPI: win rate for high-confidence (≥75 score) setups.
 */
export async function calculatePerformanceSummary(userId: string): Promise<PerformanceSummary> {
  const records = await getUserSetups(userId, { limit: 10000 });

  const closed = records.filter(r => r.status === 'closed' && r.outcome);
  const open = records.filter(r => r.status === 'open');

  const wins = closed.filter(r => r.outcome?.outcome === 'win');
  const losses = closed.filter(r => r.outcome?.outcome === 'loss');
  const breakevens = closed.filter(r => r.outcome?.outcome === 'breakeven');

  const winRate = closed.length > 0 ? wins.length / closed.length : 0;
  const avgPnlPct = closed.length > 0
    ? closed.reduce((sum, r) => sum + (r.outcome?.pnlPct ?? 0), 0) / closed.length
    : 0;
  const avgHoldingDays = closed.length > 0
    ? closed.reduce((sum, r) => sum + (r.outcome?.holdingDays ?? 0), 0) / closed.length
    : 0;
  const avgCompositeScore = records.length > 0
    ? records.reduce((sum, r) => sum + r.compositeScore, 0) / records.length
    : 0;

  // High-confidence win rate (primary KPI)
  const hcClosed = closed.filter(r => r.compositeScore >= 75);
  const hcWins = hcClosed.filter(r => r.outcome?.outcome === 'win');
  const highConfidenceWinRate = hcClosed.length > 0 ? hcWins.length / hcClosed.length : 0;

  // By direction
  const byDirection = {
    bullish: buildDirectionStats(closed, 'bullish'),
    bearish: buildDirectionStats(closed, 'bearish'),
    neutral: buildDirectionStats(closed, 'neutral'),
  };

  // By sector
  const bySector: Record<string, { total: number; wins: number; winRate: number }> = {};
  for (const r of closed) {
    const s = r.sector || 'Unknown';
    if (!bySector[s]) bySector[s] = { total: 0, wins: 0, winRate: 0 };
    bySector[s].total++;
    if (r.outcome?.outcome === 'win') bySector[s].wins++;
  }
  for (const s of Object.keys(bySector)) {
    bySector[s].winRate = bySector[s].total > 0
      ? bySector[s].wins / bySector[s].total
      : 0;
  }

  // By month
  const monthMap = new Map<string, { total: number; wins: number; pnlSum: number }>();
  for (const r of closed) {
    const month = r.scanDate.slice(0, 7); // YYYY-MM
    if (!monthMap.has(month)) monthMap.set(month, { total: 0, wins: 0, pnlSum: 0 });
    const m = monthMap.get(month)!;
    m.total++;
    if (r.outcome?.outcome === 'win') m.wins++;
    m.pnlSum += r.outcome?.pnlPct ?? 0;
  }
  const byMonth = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      month,
      total: d.total,
      wins: d.wins,
      winRate: d.total > 0 ? d.wins / d.total : 0,
      avgPnlPct: d.total > 0 ? d.pnlSum / d.total : 0,
    }));

  return {
    totalSetups: records.length,
    openSetups: open.length,
    closedSetups: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakevens: breakevens.length,
    winRate: parseFloat(winRate.toFixed(4)),
    avgPnlPct: parseFloat(avgPnlPct.toFixed(2)),
    avgHoldingDays: parseFloat(avgHoldingDays.toFixed(1)),
    avgCompositeScore: parseFloat(avgCompositeScore.toFixed(1)),
    highConfidenceWinRate: parseFloat(highConfidenceWinRate.toFixed(4)),
    byDirection,
    bySector,
    byMonth,
    calculatedAt: new Date().toISOString(),
  };
}

function buildDirectionStats(
  closed: PerformanceRecord[],
  direction: SetupDirection
): { total: number; wins: number; winRate: number } {
  const subset = closed.filter(r => r.direction === direction);
  const wins = subset.filter(r => r.outcome?.outcome === 'win').length;
  return {
    total: subset.length,
    wins,
    winRate: subset.length > 0 ? parseFloat((wins / subset.length).toFixed(4)) : 0,
  };
}

// ─── Global (scanner-wide) performance ───────────────────────────────────────

/**
 * Calculate scanner-wide aggregate stats across all users.
 * Admin-only endpoint.
 */
export async function calculateGlobalSummary(): Promise<PerformanceSummary & { userCount: number }> {
  const ids = await redis.smembers(KEYS.globalSetups);
  if (!ids || ids.length === 0) {
    return buildEmptySummary();
  }

  const setupDataArr = await Promise.all(ids.map(id => redis.get<TrackedSetup>(KEYS.setup(id))));
  const setups = setupDataArr.filter((s): s is TrackedSetup => s !== null);

  // Unique users
  const userIds = new Set(setups.map(s => s.userId));

  const closed = (
    await Promise.all(
      setups
        .filter(s => s.status === 'closed')
        .map(async (s): Promise<PerformanceRecord> => {
          const outcome = await getOutcomeById(s.id);
          return { ...s, outcome: outcome ?? undefined };
        })
    )
  ).filter(r => r.outcome);

  const wins = closed.filter(r => r.outcome?.outcome === 'win');
  const losses = closed.filter(r => r.outcome?.outcome === 'loss');
  const breakevens = closed.filter(r => r.outcome?.outcome === 'breakeven');
  const open = setups.filter(s => s.status === 'open');

  const winRate = closed.length > 0 ? wins.length / closed.length : 0;
  const avgPnlPct = closed.length > 0
    ? closed.reduce((sum, r) => sum + (r.outcome?.pnlPct ?? 0), 0) / closed.length
    : 0;
  const avgHoldingDays = closed.length > 0
    ? closed.reduce((sum, r) => sum + (r.outcome?.holdingDays ?? 0), 0) / closed.length
    : 0;
  const avgCompositeScore = setups.length > 0
    ? setups.reduce((sum, r) => sum + r.compositeScore, 0) / setups.length
    : 0;

  const hcClosed = closed.filter(r => r.compositeScore >= 75);
  const hcWins = hcClosed.filter(r => r.outcome?.outcome === 'win');

  const byDirection = {
    bullish: buildDirectionStats(closed, 'bullish'),
    bearish: buildDirectionStats(closed, 'bearish'),
    neutral: buildDirectionStats(closed, 'neutral'),
  };

  const bySector: Record<string, { total: number; wins: number; winRate: number }> = {};
  for (const r of closed) {
    const s = r.sector || 'Unknown';
    if (!bySector[s]) bySector[s] = { total: 0, wins: 0, winRate: 0 };
    bySector[s].total++;
    if (r.outcome?.outcome === 'win') bySector[s].wins++;
  }
  for (const s of Object.keys(bySector)) {
    bySector[s].winRate = bySector[s].total > 0 ? bySector[s].wins / bySector[s].total : 0;
  }

  const monthMap = new Map<string, { total: number; wins: number; pnlSum: number }>();
  for (const r of closed) {
    const month = r.scanDate.slice(0, 7);
    if (!monthMap.has(month)) monthMap.set(month, { total: 0, wins: 0, pnlSum: 0 });
    const m = monthMap.get(month)!;
    m.total++;
    if (r.outcome?.outcome === 'win') m.wins++;
    m.pnlSum += r.outcome?.pnlPct ?? 0;
  }
  const byMonth = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      month,
      total: d.total,
      wins: d.wins,
      winRate: d.total > 0 ? d.wins / d.total : 0,
      avgPnlPct: d.total > 0 ? d.pnlSum / d.total : 0,
    }));

  return {
    totalSetups: setups.length,
    openSetups: open.length,
    closedSetups: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakevens: breakevens.length,
    winRate: parseFloat(winRate.toFixed(4)),
    avgPnlPct: parseFloat(avgPnlPct.toFixed(2)),
    avgHoldingDays: parseFloat(avgHoldingDays.toFixed(1)),
    avgCompositeScore: parseFloat(avgCompositeScore.toFixed(1)),
    highConfidenceWinRate: parseFloat(
      (hcClosed.length > 0 ? hcWins.length / hcClosed.length : 0).toFixed(4)
    ),
    byDirection,
    bySector,
    byMonth,
    calculatedAt: new Date().toISOString(),
    userCount: userIds.size,
  };
}

function buildEmptySummary(): PerformanceSummary & { userCount: number } {
  return {
    totalSetups: 0,
    openSetups: 0,
    closedSetups: 0,
    wins: 0,
    losses: 0,
    breakevens: 0,
    winRate: 0,
    avgPnlPct: 0,
    avgHoldingDays: 0,
    avgCompositeScore: 0,
    highConfidenceWinRate: 0,
    byDirection: {
      bullish: { total: 0, wins: 0, winRate: 0 },
      bearish: { total: 0, wins: 0, winRate: 0 },
      neutral: { total: 0, wins: 0, winRate: 0 },
    },
    bySector: {},
    byMonth: [],
    calculatedAt: new Date().toISOString(),
    userCount: 0,
  };
}
