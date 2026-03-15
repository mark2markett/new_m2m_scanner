/**
 * Sentiment Scoring Engine
 *
 * Scores sentiment across three dimensions:
 *   1. News Sentiment      (0–50 pts) — with recency decay
 *   2. Options Flow        (0–30 pts) — derived from P/C ratio and unusual activity
 *   3. Price Action        (0–20 pts) — EMA stack + volume momentum
 *
 * Total: 0–100 (normalized to 20-point composite contribution)
 *
 * See docs/ALGORITHM_STRATEGY.md §5 for full specification.
 */

import type {
  NewsItem,
  OptionsData,
  TechnicalIndicators,
  SentimentScorecard,
} from '@/lib/types';

// ─── News Sentiment (50 pts) ─────────────────────────────────────────────────

/**
 * Compute recency weight for a news article.
 *   < 24 hrs  → 1.0 (full weight)
 *   24–48 hrs → 0.75
 *   2–7 days  → 0.50
 *   7–30 days → 0.30
 *   > 30 days → 0.10
 */
function newsRecencyWeight(dateStr: string): number {
  try {
    const ageMs = Date.now() - new Date(dateStr).getTime();
    const ageHrs = ageMs / (1000 * 60 * 60);

    if (ageHrs < 24) return 1.0;
    if (ageHrs < 48) return 0.75;
    if (ageHrs < 168) return 0.50;   // 7 days
    if (ageHrs < 720) return 0.30;   // 30 days
    return 0.10;
  } catch {
    return 0.50; // unknown age → medium weight
  }
}

/**
 * Map sentiment label to numeric value.
 */
const SENTIMENT_VALUE: Record<'Positive' | 'Neutral' | 'Negative', number> = {
  Positive: 1,
  Neutral: 0,
  Negative: -1,
};

function scoreNewsSentiment(news: NewsItem[]): { score: number; rationale: string } {
  if (news.length === 0) {
    return { score: 25, rationale: 'No news available — neutral score applied' };
  }

  // Weighted average sentiment score (-1 to +1)
  let totalWeight = 0;
  let weightedSum = 0;

  for (const item of news) {
    const weight = newsRecencyWeight(item.date);
    const value = SENTIMENT_VALUE[item.sentiment];
    weightedSum += value * weight;
    totalWeight += weight;
  }

  const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Count articles by sentiment for rationale
  const posCnt = news.filter(n => n.sentiment === 'Positive').length;
  const negCnt = news.filter(n => n.sentiment === 'Negative').length;

  // Map -1..+1 to 0..50
  // Boundary conditions: +1 → 50, 0 → 25, -1 → 0
  const rawScore = ((weightedAvg + 1) / 2) * 50;
  const score = Math.round(Math.max(0, Math.min(50, rawScore)));

  let rationale: string;
  if (weightedAvg > 0.3) {
    rationale = `Positive news sentiment (${posCnt}/${news.length} articles bullish, recency-weighted avg ${weightedAvg.toFixed(2)})`;
  } else if (weightedAvg < -0.3) {
    rationale = `Negative news sentiment (${negCnt}/${news.length} articles bearish, recency-weighted avg ${weightedAvg.toFixed(2)})`;
  } else {
    rationale = `Mixed/neutral news sentiment (${news.length} articles, weighted avg ${weightedAvg.toFixed(2)})`;
  }

  return { score, rationale };
}

// ─── Options Flow Sentiment (30 pts) ────────────────────────────────────────

function scoreOptionsFlow(optionsData: OptionsData | null | undefined): { score: number; rationale: string } {
  if (!optionsData) {
    return { score: 15, rationale: 'Options data unavailable — neutral score applied' };
  }

  const pcr = optionsData.putCallRatio;

  let score: number;
  let rationale: string;

  if (pcr < 0.5) {
    score = 30;
    rationale = `Heavy call buying — P/C ratio ${pcr.toFixed(2)} (very bullish)`;
  } else if (pcr < 0.7) {
    score = 24;
    rationale = `Moderate call buying — P/C ratio ${pcr.toFixed(2)} (bullish)`;
  } else if (pcr <= 1.0) {
    score = 16;
    rationale = `Neutral options flow — P/C ratio ${pcr.toFixed(2)}`;
  } else if (pcr <= 1.5) {
    score = 8;
    rationale = `Moderate put buying — P/C ratio ${pcr.toFixed(2)} (bearish)`;
  } else {
    score = 2;
    rationale = `Heavy put buying — P/C ratio ${pcr.toFixed(2)} (very bearish)`;
  }

  return { score, rationale };
}

// ─── Price Action Sentiment (20 pts) ─────────────────────────────────────────

/**
 * Price action sentiment is derived from EMA stack and price position.
 * Volume confirmation adds extra conviction.
 */
function scorePriceAction(
  indicators: TechnicalIndicators,
  currentPrice: number,
  volumes: number[]
): { score: number; rationale: string } {
  const { ema20, ema50 } = indicators;

  // Volume confirmation: recent 5-bar avg vs 20-bar avg
  let volumeExpanding = false;
  if (volumes.length >= 20) {
    const avg5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const avg20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    volumeExpanding = avg20 > 0 && avg5 / avg20 >= 1.1; // 10% above avg
  }

  const priceAboveEma20 = currentPrice > ema20;
  const ema20AboveEma50 = ema20 > ema50;
  const priceAboveEma50 = currentPrice > ema50;

  let score: number;
  let rationale: string;

  if (priceAboveEma20 && ema20AboveEma50) {
    // Full bullish stack
    if (volumeExpanding) {
      score = 20;
      rationale = 'Price > EMA20 > EMA50 with volume expansion — strong bullish price action';
    } else {
      score = 15;
      rationale = 'Price > EMA20 > EMA50, flat/declining volume — bullish but unconfirmed';
    }
  } else if (priceAboveEma50 && !ema20AboveEma50) {
    // Price above EMA50 but EMA20 crossed below
    score = 10;
    rationale = 'Price between EMA20 and EMA50 — transitional zone, mixed signals';
  } else if (!priceAboveEma20 && ema20AboveEma50) {
    // Pullback in uptrend
    score = 9;
    rationale = 'Price below EMA20 but above EMA50 — possible pullback in uptrend';
  } else if (!priceAboveEma20 && !ema20AboveEma50) {
    // Full bearish stack
    if (volumeExpanding) {
      score = 1;
      rationale = 'Price < EMA20 < EMA50 with volume expansion — strong bearish price action';
    } else {
      score = 5;
      rationale = 'Price < EMA20 < EMA50, low volume — bearish price action';
    }
  } else {
    score = 8;
    rationale = 'Mixed EMA alignment — unclear directional bias';
  }

  return { score, rationale };
}

// ─── Direction Classification ────────────────────────────────────────────────

function classifySentimentDirection(
  newsScore: number,
  optionsScore: number,
  priceScore: number
): 'bullish' | 'bearish' | 'neutral' {
  // Weight each component by its maximum contribution
  const bullishSignals = [
    newsScore > 30,         // > 60% of 50-pt max
    optionsScore > 18,      // > 60% of 30-pt max
    priceScore > 12,        // > 60% of 20-pt max
  ];

  const bearishSignals = [
    newsScore < 20,         // < 40% of max
    optionsScore < 12,      // < 40% of max
    priceScore < 8,         // < 40% of max
  ];

  const bullCount = bullishSignals.filter(Boolean).length;
  const bearCount = bearishSignals.filter(Boolean).length;

  if (bullCount >= 2) return 'bullish';
  if (bearCount >= 2) return 'bearish';
  return 'neutral';
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Calculate the sentiment scorecard for a stock.
 * Returns a score of 0–100 with sub-scores for each dimension.
 */
export function calculateSentimentScore(
  news: NewsItem[],
  indicators: TechnicalIndicators,
  currentPrice: number,
  volumes: number[],
  optionsData?: OptionsData | null
): SentimentScorecard {
  const newsSentiment = scoreNewsSentiment(news);
  const optionsFlow = scoreOptionsFlow(optionsData);
  const priceAction = scorePriceAction(indicators, currentPrice, volumes);

  const totalScore = newsSentiment.score + optionsFlow.score + priceAction.score;

  const direction = classifySentimentDirection(
    newsSentiment.score,
    optionsFlow.score,
    priceAction.score
  );

  const rationale = [
    `News: ${newsSentiment.rationale}`,
    `Options: ${optionsFlow.rationale}`,
    `Price Action: ${priceAction.rationale}`,
  ].join(' | ');

  return {
    totalScore: Math.min(totalScore, 100),
    newsScore: newsSentiment.score,
    optionsFlowScore: optionsFlow.score,
    priceActionScore: priceAction.score,
    direction,
    rationale,
  };
}
