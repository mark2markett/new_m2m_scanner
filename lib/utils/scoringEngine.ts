/**
 * Composite Scoring Engine
 *
 * Combines Technical, Fundamental, and Sentiment scores into a single
 * composite score (0–100) following the formula:
 *
 *   CompositeScore = (TA × 0.55) + (FA × 0.25) + (SA × 0.20)
 *
 * This is the authoritative scoring entry-point for the scanner.
 * See docs/ALGORITHM_STRATEGY.md §6 for full specification.
 */

import type {
  TechnicalIndicators,
  M2MScorecard,
  NewsItem,
  OptionsData,
  FundamentalData,
  CompositeScore,
  ConfidenceTier,
  SetupDirection,
} from '@/lib/types';

import { calculateFundamentalScore } from '@/lib/utils/fundamentalAnalysis';
import { calculateSentimentScore } from '@/lib/utils/sentimentScoring';

// ─── Weights ──────────────────────────────────────────────────────────────────

/** Technical analysis weight in composite score */
export const TA_WEIGHT = 0.55;

/** Fundamental analysis weight in composite score */
export const FA_WEIGHT = 0.25;

/** Sentiment analysis weight in composite score */
export const SA_WEIGHT = 0.20;

// ─── Threshold Definitions ────────────────────────────────────────────────────

/** Minimum composite score for a setup to be considered "high confidence" and tracked */
export const HIGH_CONFIDENCE_THRESHOLD = 75;

/** Minimum composite score for a setup to be publishable/shown */
export const PUBLISHABLE_THRESHOLD = 60;

/** Minimum composite score to show at all (below this = filtered) */
export const MINIMUM_DISPLAY_THRESHOLD = 45;

// ─── Direction Detection ──────────────────────────────────────────────────────

/**
 * Classify directional bias from technical indicators.
 * Requires 2-of-3 signals to agree for a definitive direction.
 */
function detectDirection(
  indicators: TechnicalIndicators,
  currentPrice: number
): SetupDirection {
  const ema20AboveEma50 = indicators.ema20 > indicators.ema50;
  const priceAboveEma20 = currentPrice > indicators.ema20;
  const macdBullish = indicators.macd.macd > indicators.macd.signal;

  const bullishCount = [ema20AboveEma50, priceAboveEma20, macdBullish].filter(Boolean).length;
  const bearishCount = 3 - bullishCount;

  if (bullishCount >= 2) return 'bullish';
  if (bearishCount >= 2) return 'bearish';
  return 'neutral';
}

// ─── Confidence Tier ──────────────────────────────────────────────────────────

function getConfidenceTier(score: number): ConfidenceTier {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
  if (score >= PUBLISHABLE_THRESHOLD) return 'moderate';
  if (score >= MINIMUM_DISPLAY_THRESHOLD) return 'low';
  return 'filtered';
}

// ─── TA Score Normalization ───────────────────────────────────────────────────

/**
 * Normalize the M2M 5-factor scorecard (max 100 pts) to a 0–100 range.
 * Applies SPY relative strength adjustment:
 *   leading → +5 pts bonus
 *   lagging → -3 pts penalty
 */
function normalizeTechnicalScore(
  scorecard: M2MScorecard,
  spyRsLabel?: 'leading' | 'inline' | 'lagging' | null
): number {
  const rawPct = scorecard.maxScore > 0
    ? (scorecard.totalScore / scorecard.maxScore) * 100
    : 0;

  let adjusted = rawPct;

  if (spyRsLabel === 'leading') adjusted += 5;
  if (spyRsLabel === 'lagging') adjusted -= 3;

  return Math.max(0, Math.min(100, adjusted));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Calculate the composite score for a stock setup.
 *
 * This is the single authoritative scoring function. All scanner output
 * should be ranked and filtered by this composite score.
 */
export function calculateCompositeScore(params: {
  indicators: TechnicalIndicators;
  scorecard: M2MScorecard;
  fundamentalData: FundamentalData;
  news: NewsItem[];
  currentPrice: number;
  volumes: number[];
  optionsData?: OptionsData | null;
  spyRsLabel?: 'leading' | 'inline' | 'lagging' | null;
}): CompositeScore {
  const {
    indicators,
    scorecard,
    fundamentalData,
    news,
    currentPrice,
    volumes,
    optionsData,
    spyRsLabel,
  } = params;

  // --- Technical score (0–100) ---
  const technicalScore = normalizeTechnicalScore(scorecard, spyRsLabel);

  // --- Fundamental score (0–100) ---
  const fundamentalScorecard = calculateFundamentalScore(fundamentalData);
  const fundamentalScore = fundamentalScorecard.totalScore;

  // --- Sentiment score (0–100) ---
  const sentimentScorecard = calculateSentimentScore(
    news,
    indicators,
    currentPrice,
    volumes,
    optionsData
  );
  const sentimentScore = sentimentScorecard.totalScore;

  // --- Composite calculation ---
  const technicalContribution = technicalScore * TA_WEIGHT;
  const fundamentalContribution = fundamentalScore * FA_WEIGHT;
  const sentimentContribution = sentimentScore * SA_WEIGHT;

  const score = Math.round(
    technicalContribution + fundamentalContribution + sentimentContribution
  );

  const tier = getConfidenceTier(score);
  const direction = detectDirection(indicators, currentPrice);

  return {
    score,
    tier,
    direction,
    technicalContribution: Math.round(technicalContribution * 10) / 10,
    fundamentalContribution: Math.round(fundamentalContribution * 10) / 10,
    sentimentContribution: Math.round(sentimentContribution * 10) / 10,
    technicalScore: Math.round(technicalScore),
    fundamentalScore: Math.round(fundamentalScore),
    sentimentScore: Math.round(sentimentScore),
    isHighConfidence: score >= HIGH_CONFIDENCE_THRESHOLD,
    isPublishable: score >= PUBLISHABLE_THRESHOLD,
  };
}

/**
 * Determine if a composite score qualifies for performance tracking.
 * Only high-confidence setups (≥ 75) are tracked against the 75% win-rate target.
 */
export function qualifiesForTracking(compositeScore: CompositeScore): boolean {
  return compositeScore.isHighConfidence;
}

/**
 * Compute the algorithmic trade parameters for a setup.
 * Entry zone, stop-loss, and targets are derived from ATR and S/R levels.
 */
export function computeTradeParameters(
  currentPrice: number,
  atr: number,
  support: number[],
  resistance: number[],
  direction: SetupDirection
): {
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  target1: number;
  target2: number;
  rr1: number;
  rr2: number;
} {
  const entryLow = Math.round((currentPrice - 0.5 * atr) * 100) / 100;
  const entryHigh = Math.round((currentPrice + 0.5 * atr) * 100) / 100;

  let stopLoss: number;
  let target1: number;
  let target2: number;

  if (direction === 'bullish') {
    stopLoss = Math.round((currentPrice - 1.5 * atr) * 100) / 100;
    // Targets: nearest resistance levels above current price
    const validResistances = resistance.filter(r => r > currentPrice).sort((a, b) => a - b);
    target1 = validResistances[0] ?? Math.round((currentPrice + 2 * atr) * 100) / 100;
    target2 = validResistances[1] ?? Math.round((currentPrice + 4 * atr) * 100) / 100;
  } else if (direction === 'bearish') {
    stopLoss = Math.round((currentPrice + 1.5 * atr) * 100) / 100;
    // Targets: nearest support levels below current price
    const validSupports = support.filter(s => s < currentPrice).sort((a, b) => b - a);
    target1 = validSupports[0] ?? Math.round((currentPrice - 2 * atr) * 100) / 100;
    target2 = validSupports[1] ?? Math.round((currentPrice - 4 * atr) * 100) / 100;
  } else {
    // Neutral: symmetric around current price
    stopLoss = Math.round((currentPrice - 1.5 * atr) * 100) / 100;
    target1 = Math.round((currentPrice + 2 * atr) * 100) / 100;
    target2 = Math.round((currentPrice + 4 * atr) * 100) / 100;
  }

  const risk = Math.abs(currentPrice - stopLoss);
  const reward1 = Math.abs(target1 - currentPrice);
  const reward2 = Math.abs(target2 - currentPrice);

  const rr1 = risk > 0 ? Math.round((reward1 / risk) * 100) / 100 : 0;
  const rr2 = risk > 0 ? Math.round((reward2 / risk) * 100) / 100 : 0;

  return { entryLow, entryHigh, stopLoss, target1, target2, rr1, rr2 };
}
