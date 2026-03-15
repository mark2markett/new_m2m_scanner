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
  const macdBullish     = indicators.macd.macd > indicators.macd.signal;

  const bullishCount = [ema20AboveEma50, priceAboveEma20, macdBullish].filter(Boolean).length;
  const bearishCount = 3 - bullishCount;

  if (bullishCount >= 2) return 'bullish';
  if (bearishCount >= 2) return 'bearish';
  return 'neutral';
}

// ─── Confidence Tier ──────────────────────────────────────────────────────────

function getConfidenceTier(score: number): ConfidenceTier {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
  if (score >= PUBLISHABLE_THRESHOLD)      return 'moderate';
  if (score >= MINIMUM_DISPLAY_THRESHOLD)  return 'low';
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
  indicators:      TechnicalIndicators;
  scorecard:       M2MScorecard;
  fundamentalData: FundamentalData;
  news:            NewsItem[];
  currentPrice:    number;
  volumes:         number[];
  optionsData?:    OptionsData | null;
  spyRsLabel?:     'leading' | 'inline' | 'lagging' | null;
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

  // ── Technical Score (0–100) ──
  const technicalScore = normalizeTechnicalScore(scorecard, spyRsLabel);

  // ── Fundamental Score (0–100) ──
  const faScorecard     = calculateFundamentalScore(fundamentalData);
  const fundamentalScore = faScorecard.totalScore;

  // ── Sentiment Score (0–100) ──
  const saScorecard   = calculateSentimentScore({
    news,
    optionsData,
    indicators,
    volumes,
    currentPrice,
  });
  const sentimentScore = saScorecard.totalScore;

  // ── Weighted Composite ──
  const technicalContribution    = technicalScore   * TA_WEIGHT;
  const fundamentalContribution  = fundamentalScore * FA_WEIGHT;
  const sentimentContribution    = sentimentScore   * SA_WEIGHT;

  const rawScore = technicalContribution + fundamentalContribution + sentimentContribution;
  const score    = Math.round(Math.max(0, Math.min(100, rawScore)));

  const direction      = detectDirection(indicators, currentPrice);
  const tier           = getConfidenceTier(score);
  const isHighConfidence = score >= HIGH_CONFIDENCE_THRESHOLD;
  const isPublishable    = score >= PUBLISHABLE_THRESHOLD;

  return {
    score,
    tier,
    direction,
    technicalContribution:   Math.round(technicalContribution   * 10) / 10,
    fundamentalContribution: Math.round(fundamentalContribution * 10) / 10,
    sentimentContribution:   Math.round(sentimentContribution   * 10) / 10,
    technicalScore:   Math.round(technicalScore),
    fundamentalScore: Math.round(fundamentalScore),
    sentimentScore:   Math.round(sentimentScore),
    isHighConfidence,
    isPublishable,
  };
}
