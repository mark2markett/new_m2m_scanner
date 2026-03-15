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
    const ageMs  = Date.now() - new Date(dateStr).getTime();
    const ageHrs = ageMs / (1000 * 60 * 60);
    if (ageHrs < 24)  return 1.0;
    if (ageHrs < 48)  return 0.75;
    if (ageHrs < 168) return 0.50;  // 7 days
    if (ageHrs < 720) return 0.30;  // 30 days
    return 0.10;
  } catch {
    return 0.50;
  }
}

const SENTIMENT_VALUE: Record<'Positive' | 'Neutral' | 'Negative', number> = {
  Positive:  1,
  Neutral:   0,
  Negative: -1,
};

function scoreNewsSentiment(news: NewsItem[]): { score: number; rationale: string } {
  if (news.length === 0) {
    return { score: 25, rationale: 'No news available — neutral score applied' };
  }

  let totalWeight  = 0;
  let weightedSum  = 0;

  for (const item of news) {
    const weight = newsRecencyWeight(item.date);
    const value  = SENTIMENT_VALUE[item.sentiment];
    weightedSum  += value * weight;
    totalWeight  += weight;
  }

  const weightedAvg = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const posCnt = news.filter(n => n.sentiment === 'Positive').length;
  const negCnt = news.filter(n => n.sentiment === 'Negative').length;

  // Map −1..+1 → 0..50
  const rawScore = ((weightedAvg + 1) / 2) * 50;
  const score    = Math.round(Math.max(0, Math.min(50, rawScore)));

  let rationale: string;
  if (weightedAvg > 0.3) {
    rationale = `Positive news sentiment (${posCnt}/${news.length} articles bullish, weighted avg ${weightedAvg.toFixed(2)})`;
  } else if (weightedAvg < -0.3) {
    rationale = `Negative news sentiment (${negCnt}/${news.length} articles bearish, weighted avg ${weightedAvg.toFixed(2)})`;
  } else {
    rationale = `Mixed/neutral news sentiment (${news.length} articles, weighted avg ${weightedAvg.toFixed(2)})`;
  }

  return { score, rationale };
}

// ─── Options Flow Sentiment (30 pts) ─────────────────────────────────────────

function scoreOptionsFlow(optionsData: OptionsData | null | undefined): { score: number; rationale: string } {
  if (!optionsData) {
    return { score: 15, rationale: 'Options data unavailable — neutral score applied' };
  }

  const pcr = optionsData.putCallRatio;
  let score: number;
  let rationale: string;

  if (pcr < 0.5) {
    score    = 30;
    rationale = `Heavy call buying — P/C ratio ${pcr.toFixed(2)} (very bullish)`;
  } else if (pcr < 0.7) {
    score    = 24;
    rationale = `Moderate call buying — P/C ratio ${pcr.toFixed(2)} (bullish)`;
  } else if (pcr <= 1.0) {
    score    = 16;
    rationale = `Neutral options flow — P/C ratio ${pcr.toFixed(2)}`;
  } else if (pcr <= 1.5) {
    score    = 8;
    rationale = `Moderate put buying — P/C ratio ${pcr.toFixed(2)} (bearish)`;
  } else {
    score    = 2;
    rationale = `Heavy put buying — P/C ratio ${pcr.toFixed(2)} (very bearish)`;
  }

  // IV adjustment — unusual IV spike can mean large expected move
  if (optionsData.avgImpliedVolatility > 0.60) {
    score = Math.max(0, score - 4);
    rationale += '; IV elevated (>60%) — uncertainty premium';
  }

  return { score: Math.min(score, 30), rationale };
}

// ─── Price Action Sentiment (20 pts) ─────────────────────────────────────────

/**
 * Price action scoring uses the EMA stack and volume momentum
 * from the pre-computed technical indicators.
 */
function scorePriceAction(
  indicators: TechnicalIndicators,
  volumes:    number[],
  currentPrice: number
): { score: number; rationale: string } {
  let score = 0;
  const reasons: string[] = [];

  // EMA stack (up to 10 pts)
  if (indicators.ema20 > indicators.ema50 && currentPrice > indicators.ema20) {
    score += 10;
    reasons.push('Price > EMA20 > EMA50 — bullish trend stack');
  } else if (indicators.ema20 > indicators.ema50) {
    score += 6;
    reasons.push('EMA20 > EMA50 — trend intact, price below EMA20');
  } else if (indicators.ema20 < indicators.ema50 && currentPrice < indicators.ema20) {
    score += 2;
    reasons.push('Price < EMA20 < EMA50 — bearish trend stack');
  } else {
    score += 4;
    reasons.push('EMAs mixed — no clear trend stack');
  }

  // Volume momentum (up to 10 pts): compare recent 5-bar avg vs prior 15-bar avg
  if (volumes.length >= 20) {
    const recent5    = volumes.slice(-5);
    const prior15    = volumes.slice(-20, -5);
    const avgRecent  = recent5.reduce((a, b) => a + b, 0)  / recent5.length;
    const avgPrior   = prior15.reduce((a, b) => a + b, 0) / prior15.length;
    const volRatio   = avgPrior > 0 ? avgRecent / avgPrior : 1;

    if (volRatio >= 1.5) {
      score += 10;
      reasons.push(`Volume surge ${(volRatio).toFixed(1)}x above avg — strong conviction`);
    } else if (volRatio >= 1.2) {
      score += 7;
      reasons.push(`Volume elevated ${(volRatio).toFixed(1)}x — moderate conviction`);
    } else if (volRatio >= 0.8) {
      score += 5;
      reasons.push(`Volume normal ${(volRatio).toFixed(1)}x — average activity`);
    } else {
      score += 2;
      reasons.push(`Volume declining ${(volRatio).toFixed(1)}x — low conviction`);
    }
  } else {
    score += 5;
    reasons.push('Insufficient volume history — neutral score applied');
  }

  return { score: Math.min(score, 20), rationale: reasons.join('; ') };
}

// ─── Direction Inference ─────────────────────────────────────────────────────

function inferDirection(
  newsScore:   number,
  optionsScore: number,
  priceScore:  number,
  indicators:  TechnicalIndicators,
  currentPrice: number
): 'bullish' | 'bearish' | 'neutral' {
  const totalSentiment = newsScore + optionsScore + priceScore;

  const bullishEma  = indicators.ema20 > indicators.ema50 && currentPrice > indicators.ema20;
  const bearishEma  = indicators.ema20 < indicators.ema50 && currentPrice < indicators.ema20;

  if (totalSentiment >= 65 && bullishEma)  return 'bullish';
  if (totalSentiment <= 35 || bearishEma)  return 'bearish';
  return 'neutral';
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Calculate the composite sentiment score (0–100) for a stock.
 * Used by the composite scoring engine.
 */
export function calculateSentimentScore(params: {
  news:         NewsItem[];
  optionsData?: OptionsData | null;
  indicators:   TechnicalIndicators;
  volumes:      number[];
  currentPrice: number;
}): SentimentScorecard {
  const { news, optionsData, indicators, volumes, currentPrice } = params;

  const newsResult    = scoreNewsSentiment(news);
  const optionsResult = scoreOptionsFlow(optionsData);
  const priceResult   = scorePriceAction(indicators, volumes, currentPrice);

  const totalScore = newsResult.score + optionsResult.score + priceResult.score;

  const direction = inferDirection(
    newsResult.score,
    optionsResult.score,
    priceResult.score,
    indicators,
    currentPrice
  );

  const rationale = [
    `News: ${newsResult.rationale}`,
    `Options: ${optionsResult.rationale}`,
    `Price action: ${priceResult.rationale}`,
  ].join(' | ');

  return {
    totalScore:        Math.min(Math.round(totalScore), 100),
    newsScore:         newsResult.score,
    optionsFlowScore:  optionsResult.score,
    priceActionScore:  priceResult.score,
    direction,
    rationale,
  };
}
