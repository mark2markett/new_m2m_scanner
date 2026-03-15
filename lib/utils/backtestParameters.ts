/**
 * Backtesting Parameters & Success Criteria
 *
 * Defines all optimizable parameters, thresholds, and success criteria
 * for the M2M S&P 500 Scanner.
 *
 * See docs/ALGORITHM_STRATEGY.md §7 for full specification.
 */

// ─── Indicator Default Parameters ────────────────────────────────────────────

export const INDICATOR_DEFAULTS = {
  rsi: {
    period: 14,
    overbought: 70,
    oversold: 30,
    /** Extreme overbought — Late Setup threshold */
    extremeOverbought: 80,
    /** Extreme oversold — Late Setup threshold */
    extremeOversold: 20,
  },
  macd: {
    fast: 12,
    slow: 26,
    signal: 9,
  },
  ema: {
    fast: 20,
    slow: 50,
  },
  bollingerBands: {
    period: 20,
    stdDev: 2,
  },
  atr: {
    period: 14,
  },
  adx: {
    period: 14,
    /** Minimum ADX for trend confirmation */
    trendThreshold: 25,
    /** Moderate trend */
    moderateThreshold: 20,
  },
  stochastic: {
    kPeriod: 14,
    dPeriod: 3,
    overbought: 80,
    oversold: 20,
  },
  cmf: {
    period: 20,
  },
  supportResistance: {
    lookback: 5,
    tolerancePct: 0.015,       // 1.5% price cluster tolerance
    highVolatilityTolerance: 0.03,   // 3.0% in high volatility regime
    lowVolatilityTolerance: 0.01,    // 1.0% in low volatility regime
    maxLevels: 5,
  },
} as const;

// ─── Parameter Optimization Ranges ───────────────────────────────────────────

/**
 * Ranges to test during backtesting for parameter optimization.
 * Each parameter has a min, max, and step value.
 */
export const OPTIMIZATION_RANGES = {
  rsiPeriod:          { min: 10, max: 21, step: 1 },
  macdFast:           { min: 8,  max: 16, step: 2 },
  macdSlow:           { min: 20, max: 34, step: 2 },
  macdSignal:         { min: 7,  max: 12, step: 1 },
  emaFast:            { min: 15, max: 25, step: 5 },
  emaSlow:            { min: 40, max: 60, step: 10 },
  bbPeriod:           { min: 15, max: 25, step: 5 },
  adxPeriod:          { min: 10, max: 21, step: 1 },
  publicationThreshold: { min: 55, max: 80, step: 5 },
  taWeight:           { min: 0.45, max: 0.65, step: 0.05 },
  faWeight:           { min: 0.15, max: 0.35, step: 0.05 },
  saWeight:           { min: 0.10, max: 0.30, step: 0.05 },
} as const;

// ─── Backtest Simulation Parameters ────────────────────────────────────��─────

export const BACKTEST_CONFIG = {
  /** Number of years of historical daily data to use */
  dataHorizonYears: 5,

  /** Minimum daily OHLCV bars required for a stock to be included */
  minimumBarsRequired: 60,

  /** Recommended bars for full indicator warm-up */
  recommendedBars: 120,

  /** Slippage model — percentage of trade value */
  slippagePct: 0.0005,  // 0.05%

  /** Commission per trade (zero for modern retail brokers) */
  commissionPerTrade: 0,

  /** Maximum position size as % of portfolio per setup */
  maxPositionSizePct: 0.02,  // 2%

  /** Maximum number of simultaneous positions */
  maxSimultaneousPositions: 25,

  /** Maximum capital allocation to setups (50%) */
  maxCapitalAllocationPct: 0.50,

  /** Minimum average daily volume for liquidity filter */
  minAvgDailyVolume: 500_000,

  /** Minimum price for penny stock exclusion */
  minStockPrice: 5.00,

  /** Tracking window in trading days */
  trackingWindowDays: 20,
} as const;

// ─── Position Sizing ──────────────────────────────────────────────────────────

/**
 * Compute position size using the 2% risk rule.
 *
 * @param portfolioValue - Total portfolio value in dollars
 * @param entryPrice     - Expected entry price
 * @param stopLoss       - Stop-loss price
 * @returns Number of shares to trade
 */
export function computePositionSize(
  portfolioValue: number,
  entryPrice: number,
  stopLoss: number
): number {
  const riskPerTrade = portfolioValue * BACKTEST_CONFIG.maxPositionSizePct;
  const riskPerShare = Math.abs(entryPrice - stopLoss);

  if (riskPerShare <= 0) return 0;

  return Math.floor(riskPerTrade / riskPerShare);
}

// ─── Success Criteria ─────────────────────────────────────────────────────────

export const SUCCESS_CRITERIA = {
  /** Target win rate for high-confidence setups (≥ 75 composite score) */
  targetWinRateHighConfidence: 75,  // percent

  /** Target win rate for moderate-confidence setups (60–74 composite score) */
  targetWinRateModerate: 60,  // percent

  /** Minimum acceptable average win / average loss ratio */
  minProfitFactor: 2.0,

  /** Maximum acceptable drawdown per setup */
  maxDrawdownPct: 15,  // percent

  /** Maximum acceptable false positive rate for high-confidence setups */
  maxFalsePositiveRatePct: 25,  // percent

  /** Minimum R/R for a setup to be tracked */
  minRiskRewardForTracking: 1.5,
} as const;

// ─── Pre-Scan Filters ─────────────────────────────────────────────────────────

/**
 * Checks whether a stock passes the pre-scan quality filters.
 * Returns a descriptive reason if filtered out.
 */
export function passesPreScanFilters(stock: {
  price?: number;
  avgDailyVolume?: number;
  barsAvailable?: number;
}): { passes: boolean; reason?: string } {
  if (stock.price !== undefined && stock.price < BACKTEST_CONFIG.minStockPrice) {
    return { passes: false, reason: `Price $${stock.price.toFixed(2)} below $${BACKTEST_CONFIG.minStockPrice} minimum` };
  }

  if (stock.avgDailyVolume !== undefined && stock.avgDailyVolume < BACKTEST_CONFIG.minAvgDailyVolume) {
    return {
      passes: false,
      reason: `Avg daily volume ${stock.avgDailyVolume.toLocaleString()} below ${BACKTEST_CONFIG.minAvgDailyVolume.toLocaleString()} minimum`,
    };
  }

  if (stock.barsAvailable !== undefined && stock.barsAvailable < BACKTEST_CONFIG.minimumBarsRequired) {
    return {
      passes: false,
      reason: `Only ${stock.barsAvailable} bars available, need ${BACKTEST_CONFIG.minimumBarsRequired} minimum`,
    };
  }

  return { passes: true };
}

// ─── Performance Tracking ─────────────────────────────────────────────────────

/**
 * Evaluate a single tracked setup's outcome given its results.
 * Used in the performance tracking module.
 */
export function evaluateSetupOutcome(params: {
  direction: 'bullish' | 'bearish' | 'neutral';
  entryPrice: number;
  exitPrice: number;
  target1: number;
  stopLoss: number;
  trackingWindowExpired: boolean;
}): 'win' | 'loss' | 'open' {
  const { direction, entryPrice, exitPrice, target1, stopLoss, trackingWindowExpired } = params;

  if (direction === 'bullish') {
    if (exitPrice >= target1) return 'win';
    if (exitPrice <= stopLoss) return 'loss';
  } else if (direction === 'bearish') {
    if (exitPrice <= target1) return 'win';
    if (exitPrice >= stopLoss) return 'loss';
  } else {
    // Neutral: win if moved 2% either direction
    const movePct = Math.abs(exitPrice - entryPrice) / entryPrice;
    if (movePct >= 0.02) return 'win';
  }

  if (trackingWindowExpired) return 'loss'; // expired without hitting target = loss
  return 'open';
}

/**
 * Compute running win rate statistics from an array of outcomes.
 */
export function computeWinRate(outcomes: Array<'win' | 'loss' | 'open'>): {
  winRate: number;
  wins: number;
  losses: number;
  open: number;
  totalResolved: number;
  meetsTarget: boolean;
} {
  const wins = outcomes.filter(o => o === 'win').length;
  const losses = outcomes.filter(o => o === 'loss').length;
  const open = outcomes.filter(o => o === 'open').length;
  const totalResolved = wins + losses;
  const winRate = totalResolved > 0 ? Math.round((wins / totalResolved) * 100) : 0;

  return {
    winRate,
    wins,
    losses,
    open,
    totalResolved,
    meetsTarget: winRate >= SUCCESS_CRITERIA.targetWinRateHighConfidence,
  };
}

// ─── Minimum Data Requirements ────────────────────────────────────────────────

/** Per-indicator minimum bar counts for valid computation */
export const INDICATOR_MIN_BARS: Record<string, number> = {
  rsi: 15,
  macd: 35,
  ema20: 20,
  ema50: 50,
  bollingerBands: 20,
  atr: 15,
  adx: 28,
  stochastic: 17,
  cmf: 20,
  fullEngine: 60,
  recommended: 120,
};
