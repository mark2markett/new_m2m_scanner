/**
 * Fundamental Analysis Engine
 *
 * Scores stocks on three fundamental dimensions:
 *   1. Valuation Quality   (0–40 pts)
 *   2. Growth Quality      (0–35 pts)
 *   3. Financial Health    (0–25 pts)
 *
 * Total: 0–100 (normalized to 25-point composite contribution)
 *
 * All sub-scores degrade gracefully to neutral when data is unavailable.
 * See docs/ALGORITHM_STRATEGY.md §4 for full specification.
 */

import type { FundamentalData, FundamentalScorecard } from '@/lib/types';

// ─── Valuation Quality (40 pts) ──────────────────────────────────────────────

function scoreValuation(data: FundamentalData): { score: number; rationale: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // P/E Ratio scoring (up to 20 pts)
  if (data.peRatio === undefined || data.peRatio === null || data.peRatio === 0) {
    score += 10; // neutral fallback
    reasons.push('P/E ratio unavailable — neutral score applied');
  } else if (data.peRatio < 0) {
    score += 2;
    reasons.push(`P/E negative (${data.peRatio.toFixed(1)}) — loss-making or one-time charges`);
  } else if (data.peRatio >= 5 && data.peRatio < 10) {
    score += 10;
    reasons.push(`P/E ${data.peRatio.toFixed(1)}x — deep value zone (sector-dependent)`);
  } else if (data.peRatio >= 10 && data.peRatio < 20) {
    score += 20;
    reasons.push(`P/E ${data.peRatio.toFixed(1)}x — value zone`);
  } else if (data.peRatio >= 20 && data.peRatio < 30) {
    score += 14;
    reasons.push(`P/E ${data.peRatio.toFixed(1)}x — fair value`);
  } else if (data.peRatio >= 30 && data.peRatio < 50) {
    score += 8;
    reasons.push(`P/E ${data.peRatio.toFixed(1)}x — growth premium`);
  } else {
    score += 2;
    reasons.push(`P/E ${data.peRatio.toFixed(1)}x — speculative/elevated valuation`);
  }

  // Market Cap scoring (up to 10 pts)
  if (data.marketCap === undefined || data.marketCap === null || data.marketCap === 0) {
    score += 5; // neutral fallback
    reasons.push('Market cap unavailable — neutral score applied');
  } else if (data.marketCap >= 10_000_000_000) {
    score += 10;
    reasons.push(`Large-cap $${(data.marketCap / 1e9).toFixed(1)}B — institutional support`);
  } else if (data.marketCap >= 2_000_000_000) {
    score += 7;
    reasons.push(`Mid-cap $${(data.marketCap / 1e9).toFixed(1)}B — growth potential`);
  } else {
    score += 3;
    reasons.push(`Small-cap $${(data.marketCap / 1e6).toFixed(0)}M — higher risk/reward`);
  }

  // Sector momentum placeholder (up to 10 pts)
  // Note: Full sector momentum requires sector return data; defaults to neutral
  // until sector rotation module is implemented (v2.1 planned enhancement)
  score += 5;
  reasons.push('Sector momentum — neutral (sector rotation data pending)');

  return { score: Math.min(score, 40), rationale: reasons };
}

// ─── Growth Quality (35 pts) ─────────────────────────────────────────────────

function scoreGrowth(data: FundamentalData): { score: number; rationale: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Revenue Growth YoY (up to 20 pts)
  if (data.revenueGrowthYoY === undefined || data.revenueGrowthYoY === null) {
    score += 8; // neutral fallback
    reasons.push('Revenue growth unavailable — neutral score applied');
  } else {
    const revPct = data.revenueGrowthYoY * 100;
    if (revPct >= 20) {
      score += 20;
      reasons.push(`Revenue growth ${revPct.toFixed(1)}% YoY — high growth`);
    } else if (revPct >= 10) {
      score += 15;
      reasons.push(`Revenue growth ${revPct.toFixed(1)}% YoY — solid growth`);
    } else if (revPct >= 5) {
      score += 10;
      reasons.push(`Revenue growth ${revPct.toFixed(1)}% YoY — moderate growth`);
    } else if (revPct >= 0) {
      score += 5;
      reasons.push(`Revenue growth ${revPct.toFixed(1)}% YoY — slow growth`);
    } else {
      score += 1;
      reasons.push(`Revenue decline ${revPct.toFixed(1)}% YoY — contraction`);
    }
  }

  // EPS Growth YoY (up to 15 pts)
  if (data.epsGrowthYoY === undefined || data.epsGrowthYoY === null) {
    score += 7; // neutral fallback
    reasons.push('EPS growth unavailable — neutral score applied');
  } else {
    const epsPct = data.epsGrowthYoY * 100;
    if (epsPct >= 15) {
      score += 15;
      reasons.push(`EPS growth ${epsPct.toFixed(1)}% YoY — strong earnings momentum`);
    } else if (epsPct >= 5) {
      score += 10;
      reasons.push(`EPS growth ${epsPct.toFixed(1)}% YoY — positive earnings trend`);
    } else if (epsPct >= 0) {
      score += 5;
      reasons.push(`EPS growth ${epsPct.toFixed(1)}% YoY — flat earnings`);
    } else {
      score += 1;
      reasons.push(`EPS decline ${epsPct.toFixed(1)}% YoY — earnings contraction`);
    }
  }

  return { score: Math.min(score, 35), rationale: reasons };
}

// ─── Financial Health (25 pts) ───────────────────────────────────────────────

function scoreFinancialHealth(data: FundamentalData): { score: number; rationale: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Debt-to-Equity (up to 15 pts)
  if (data.debtToEquity === undefined || data.debtToEquity === null) {
    score += 8; // neutral fallback
    reasons.push('Debt/Equity unavailable — neutral score applied');
  } else if (data.debtToEquity < 0.5) {
    score += 15;
    reasons.push(`D/E ${data.debtToEquity.toFixed(2)} — low leverage`);
  } else if (data.debtToEquity < 1.5) {
    score += 10;
    reasons.push(`D/E ${data.debtToEquity.toFixed(2)} — moderate leverage`);
  } else if (data.debtToEquity < 3.0) {
    score += 5;
    reasons.push(`D/E ${data.debtToEquity.toFixed(2)} — high leverage`);
  } else {
    score += 1;
    reasons.push(`D/E ${data.debtToEquity.toFixed(2)} — distressed leverage level`);
  }

  // Profit Margin (up to 10 pts)
  if (data.profitMargin === undefined || data.profitMargin === null) {
    score += 5; // neutral fallback
    reasons.push('Profit margin unavailable — neutral score applied');
  } else {
    const marginPct = data.profitMargin * 100;
    if (marginPct >= 20) {
      score += 10;
      reasons.push(`Profit margin ${marginPct.toFixed(1)}% — high-margin business`);
    } else if (marginPct >= 10) {
      score += 7;
      reasons.push(`Profit margin ${marginPct.toFixed(1)}% — solid margins`);
    } else if (marginPct >= 5) {
      score += 4;
      reasons.push(`Profit margin ${marginPct.toFixed(1)}% — thin margins`);
    } else {
      score += 1;
      reasons.push(`Profit margin ${marginPct.toFixed(1)}% — very thin or negative`);
    }
  }

  return { score: Math.min(score, 25), rationale: reasons };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Calculate the fundamental scorecard for a stock.
 * Returns a score of 0–100 with sub-scores for each dimension.
 * All fields degrade gracefully to neutral when data is unavailable.
 */
export function calculateFundamentalScore(data: FundamentalData): FundamentalScorecard {
  const valuation = scoreValuation(data);
  const growth = scoreGrowth(data);
  const health = scoreFinancialHealth(data);

  const totalScore = valuation.score + growth.score + health.score;

  // Determine if meaningful fundamental data was actually provided
  const dataAvailable =
    (data.peRatio !== undefined && data.peRatio !== null) ||
    (data.revenueGrowthYoY !== undefined && data.revenueGrowthYoY !== null) ||
    (data.epsGrowthYoY !== undefined && data.epsGrowthYoY !== null) ||
    (data.debtToEquity !== undefined && data.debtToEquity !== null) ||
    (data.profitMargin !== undefined && data.profitMargin !== null);

  const allRationale = [
    ...valuation.rationale,
    ...growth.rationale,
    ...health.rationale,
  ].join('; ');

  return {
    totalScore: Math.min(totalScore, 100),
    dataAvailable,
    valuationScore: valuation.score,
    growthScore: growth.score,
    healthScore: health.score,
    rationale: allRationale,
  };
}

/**
 * Build a FundamentalData object from the stock details returned by PolygonService.
 * Maps available Polygon fields; leaves undefined when data is missing.
 */
export function buildFundamentalData(stockDetails: {
  peRatio?: number;
  marketCap?: number;
  sector?: string;
}): FundamentalData {
  return {
    peRatio: stockDetails.peRatio || undefined,
    marketCap: stockDetails.marketCap || undefined,
    sector: stockDetails.sector || undefined,
    // Revenue/EPS growth and D/E require premium data endpoints
    // These will be populated as data integrations expand
    revenueGrowthYoY: undefined,
    epsGrowthYoY: undefined,
    debtToEquity: undefined,
    profitMargin: undefined,
  };
}
