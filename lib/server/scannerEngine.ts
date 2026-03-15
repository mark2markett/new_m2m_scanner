import 'server-only';
import { TechnicalIndicators } from '@/lib/utils/technicalIndicators';
import { SupportResistanceAnalyzer } from '@/lib/utils/supportResistance';
import { TradeSetupAnalyzer } from '@/lib/utils/tradeSetupAnalysis';
import { PolygonService } from './polygonService';
import { NewsService } from './newsService';
import { OpenAIService } from './openaiService';
import { assessQuality } from '@/lib/utils/qualityAssessment';
import { calculateCompositeScore } from '@/lib/utils/scoringEngine';
import { buildFundamentalData } from '@/lib/utils/fundamentalAnalysis';
import type { SP500Stock, ScannerStockResult, SpyRelativeStrength } from '@/lib/types';

const CONCURRENCY = 10;

/**
 * Compute SPY relative strength for 10, 20, and 50 trading-day windows.
 * Returns null if SPY data is unavailable.
 */
async function computeSpyRS(
  stockCloses: number[],
  spyCloses: number[]
): Promise<SpyRelativeStrength | null> {
  try {
    const periods = [10, 20, 50] as const;
    const returns: Record<number, number> = {};

    for (const p of periods) {
      if (stockCloses.length < p + 1 || spyCloses.length < p + 1) return null;
      const stockReturn = (stockCloses[stockCloses.length - 1] - stockCloses[stockCloses.length - 1 - p]) /
                          stockCloses[stockCloses.length - 1 - p];
      const spyReturn   = (spyCloses[spyCloses.length - 1]   - spyCloses[spyCloses.length - 1 - p]) /
                          spyCloses[spyCloses.length - 1 - p];
      // Relative strength ratio: >1 means stock outperforming SPY
      returns[p] = spyReturn !== 0 ? (1 + stockReturn) / (1 + spyReturn) : 1;
    }

    const rs10d = returns[10];
    const rs20d = returns[20];
    const rs50d = returns[50];

    // Label: leading if avg RS > 1.02, lagging if < 0.98, otherwise inline
    const avgRS = (rs10d + rs20d + rs50d) / 3;
    const label: SpyRelativeStrength['label'] =
      avgRS > 1.02 ? 'leading' :
      avgRS < 0.98 ? 'lagging' : 'inline';

    return { rs10d, rs20d, rs50d, label };
  } catch {
    return null;
  }
}

async function analyzeStock(
  stock: SP500Stock,
  spyCloses: number[]
): Promise<ScannerStockResult> {
  const historicalLimit = 120;
  const newsLimit = 3;

  const [stockData, historicalData, newsData] = await Promise.all([
    PolygonService.getStockDetails(stock.symbol),
    PolygonService.getHistoricalData(stock.symbol, 'day', historicalLimit),
    NewsService.getStockNews(stock.symbol, newsLimit),
  ]);

  const closes = historicalData.map((d: any) => d.close);
  const highs = historicalData.map((d: any) => d.high);
  const lows = historicalData.map((d: any) => d.low);
  const volumes = historicalData.map((d: any) => d.volume);

  const indicatorResults = TechnicalIndicators.computeIndicators(highs, lows, closes, volumes, 'daily');
  const indicators = indicatorResults.indicators;

  const pivots = SupportResistanceAnalyzer.findPivotPoints(highs, lows, closes);
  const { support, resistance } = SupportResistanceAnalyzer.getKeyLevels(pivots, stockData.price);

  const setupStage = TradeSetupAnalyzer.analyzeSetupStage(indicators, stockData.price, support, resistance, closes);

  // Bug Fix #8: pass recentPrices for pullback penalty calculation
  const scorecard = TradeSetupAnalyzer.calculateM2MScorecard(
    indicators,
    setupStage,
    indicatorResults.regime as 'High' | 'Normal' | 'Low',
    newsData,
    stockData.price,
    support,
    resistance,
    null,   // skip options data for scanner
    closes  // pass closes for pullback penalty
  );

  const macdSignal: 'bullish' | 'bearish' = indicators.macd.macd > indicators.macd.signal ? 'bullish' : 'bearish';
  const ema20above50 = indicators.ema20 > indicators.ema50;
  const priceAboveEma20 = stockData.price > indicators.ema20;
  const trendAlignment: 'bullish' | 'bearish' | 'neutral' =
    ema20above50 && priceAboveEma20 ? 'bullish' :
    !ema20above50 && !priceAboveEma20 ? 'bearish' : 'neutral';

  const sentiment = newsData.length > 0
    ? newsData.map((n: any) => `${n.headline} (${n.sentiment})`).join('; ')
    : 'No significant news';

  // SPY Relative Strength
  const spyRS = await computeSpyRS(closes, spyCloses);

  // ── Composite Score (v2.0) ───────────────────────────────────────────────────
  // Builds fundamental data from available stock details (peRatio, marketCap)
  const fundamentalData = buildFundamentalData({
    peRatio: stockData.peRatio,
    marketCap: stockData.marketCap,
    sector: stock.sector,
  });

  const compositeResult = calculateCompositeScore({
    indicators,
    scorecard,
    fundamentalData,
    news: newsData,
    currentPrice: stockData.price,
    volumes,
    optionsData: null,  // options data not fetched in scanner (too many API calls)
    spyRsLabel: spyRS?.label ?? null,
  });
  // ────────────────────────────────────────────────────────────────────────────

  // Algorithmic scoring — deterministic, transparent, consistent across runs
  const quality = assessQuality(scorecard, indicators, setupStage, false);
  const aiSetupQuality = quality.setupQuality;
  const aiConfidence = quality.signalConfidence;
  const aiEarlyStage = quality.earlyStage;
  const aiCatalystPresent = quality.catalystPresent;

  // AI narrative — contextual interpretation that algorithms can't do
  let aiKeySignal = '';
  let aiRisk = '';
  let aiSummary = '';

  try {
    const insight = await OpenAIService.generateScannerInsight({
      symbol: stock.symbol,
      price: stockData.price,
      change: stockData.changePercent,
      rsi: indicators.rsi,
      macd: indicators.macd.macd,
      signal: indicators.macd.signal,
      histogram: indicators.macd.histogram,
      ema20: indicators.ema20,
      ema50: indicators.ema50,
      adx: indicators.adx,
      atr: indicators.atr,
      bbLower: indicators.bollingerBands.lower,
      bbUpper: indicators.bollingerBands.upper,
      stochK: indicators.stochastic.k,
      stochD: indicators.stochastic.d,
      cmf: indicators.cmf,
      support,
      resistance,
      setupStage,
      volatilityRegime: indicatorResults.regime as string,
      score: scorecard.totalScore,
      maxScore: scorecard.maxScore,
      factorsPassed: scorecard.factorsPassed,
      totalFactors: scorecard.totalFactors,
      publishable: scorecard.publishable,
      sentiment,
      spyRS,
    });

    aiKeySignal = insight.keySignal;
    aiRisk = insight.risk;
    aiSummary = insight.summary;
  } catch (err) {
    console.error(`[Scanner] AI narrative failed for ${stock.symbol}: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // Build recommendation algorithmically (uses composite score for v2.0)
  const scoreSummary = `Composite: ${compositeResult.score}/100 | M2M: ${scorecard.totalScore}/${scorecard.maxScore} (${scorecard.factorsPassed}/${scorecard.totalFactors} factors).`;
  const recommendation = compositeResult.isPublishable
    ? `${scoreSummary} Setup signals aligned. Tier: ${compositeResult.tier}.`
    : `${scoreSummary} Signals mixed or insufficient.`;

  return {
    symbol: stockData.symbol,
    name: stock.name,
    sector: stock.sector,
    price: stockData.price,
    change: stockData.change,
    changePercent: stockData.changePercent,
    volume: stockData.volume,
    marketCap: stockData.marketCap,
    // Legacy M2M fields (backwards compatibility)
    m2mScore: scorecard.totalScore,
    m2mMaxScore: scorecard.maxScore,
    factorsPassed: scorecard.factorsPassed,
    totalFactors: scorecard.totalFactors,
    publishable: compositeResult.isPublishable,
    // Composite score fields (v2.0)
    compositeScore: compositeResult.score,
    compositeTier: compositeResult.tier,
    technicalScore: compositeResult.technicalScore,
    fundamentalScore: compositeResult.fundamentalScore,
    sentimentScore: compositeResult.sentimentScore,
    setupDirection: compositeResult.direction,
    // Setup metadata
    setupStage,
    volatilityRegime: indicatorResults.regime as string,
    rsi: indicators.rsi,
    macdSignal,
    trendAlignment,
    recommendation: recommendation.slice(0, 300),
    aiSetupQuality,
    aiConfidence,
    aiEarlyStage,
    aiKeySignal,
    aiRisk,
    aiCatalystPresent,
    aiSummary,
    spyRS,
    partial: false,
    analyzedAt: new Date().toISOString(),
  };
}

function mapToErrorResult(stock: SP500Stock, error: string): ScannerStockResult {
  return {
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector,
    price: 0,
    change: 0,
    changePercent: 0,
    volume: 0,
    marketCap: 0,
    m2mScore: 0,
    m2mMaxScore: 0,
    factorsPassed: 0,
    totalFactors: 0,
    publishable: false,
    compositeScore: 0,
    compositeTier: 'filtered',
    technicalScore: 0,
    fundamentalScore: 0,
    sentimentScore: 0,
    setupDirection: 'neutral',
    setupStage: 'Unknown',
    volatilityRegime: 'Normal',
    rsi: 0,
    macdSignal: 'bearish',
    trendAlignment: 'neutral',
    recommendation: '',
    aiSetupQuality: 'low',
    aiConfidence: 0,
    aiEarlyStage: false,
    aiKeySignal: '',
    aiRisk: '',
    aiCatalystPresent: false,
    aiSummary: '',
    spyRS: null,
    partial: false,
    error,
    analyzedAt: new Date().toISOString(),
  };
}

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) {
        await fn(item);
      }
    }
  });
  await Promise.all(workers);
}

export class ScannerEngine {
  /**
   * Analyze a batch of stocks. Fetches SPY closes once and shares them
   * across all stock analyses in the batch for efficiency.
   */
  static async analyzeBatch(stocks: SP500Stock[]): Promise<ScannerStockResult[]> {
    // Fetch SPY data once for the entire batch
    let spyCloses: number[] = [];
    try {
      const spyData = await PolygonService.getHistoricalData('SPY', 'day', 120);
      spyCloses = spyData.map((d: any) => d.close);
    } catch (err) {
      console.warn('[Scanner] Could not fetch SPY data for RS computation:', err instanceof Error ? err.message : 'unknown');
    }

    const results: ScannerStockResult[] = [];

    await runWithConcurrency(
      stocks,
      async (stock) => {
        try {
          const result = await analyzeStock(stock, spyCloses);
          results.push(result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          console.error(`[Scanner] Failed to analyze ${stock.symbol}: ${msg}`);
          results.push(mapToErrorResult(stock, msg));
        }
      },
      CONCURRENCY
    );

    return results;
  }
}
