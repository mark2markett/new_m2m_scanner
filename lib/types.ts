export interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  peRatio: number;
  lastUpdated: string;
}

export interface TechnicalIndicators {
  rsi: number;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  };
  ema20: number;
  ema50: number;
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
  };
  atr: number;
  adx: number;
  stochastic: {
    k: number;
    d: number;
  };
  cmf: number;
}

export interface NewsItem {
  headline: string;
  sentiment: 'Positive' | 'Negative' | 'Neutral';
  date: string;
  source: string;
}

export interface M2MScoreFactor {
  name: string;
  maxPoints: number;
  score: number;
  passed: boolean;
  rationale: string;
}

export interface M2MScorecard {
  totalScore: number;
  maxScore: number;
  factorsPassed: number;
  totalFactors: number;
  meetsPublicationThreshold: boolean;
  meetsMultiFactorRule: boolean;
  publishable: boolean;
  factors: M2MScoreFactor[];
}

export interface OptionsData {
  putCallRatio: number;
  totalCallVolume: number;
  totalPutVolume: number;
  totalCallOI: number;
  totalPutOI: number;
  avgImpliedVolatility: number;
  nearMoneyIV: number;
  contractCount: number;
  topContracts?: OptionContract[];
}

export interface OptionContract {
  ticker: string;
  contractType: 'call' | 'put';
  strikePrice: number;
  expirationDate: string;
  daysToExpiry: number;
  bid: number;
  ask: number;
  midpoint: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

// --- SPY Relative Strength ---

export interface SpyRelativeStrength {
  rs10d: number;  // stock 10d return / SPY 10d return (1.0 = inline)
  rs20d: number;
  rs50d: number;
  label: 'leading' | 'inline' | 'lagging';
}

// --- Fundamental Analysis Types ---

export interface FundamentalData {
  peRatio?: number;
  marketCap?: number;
  revenueGrowthYoY?: number;  // as decimal, e.g. 0.15 = 15%
  epsGrowthYoY?: number;       // as decimal
  debtToEquity?: number;
  profitMargin?: number;       // as decimal
  sector?: string;
}

export interface FundamentalScorecard {
  totalScore: number;         // 0–100
  dataAvailable: boolean;
  valuationScore: number;     // 0–40
  growthScore: number;        // 0–35
  healthScore: number;        // 0–25
  rationale: string;
}

// --- Sentiment Scoring Types ---

export interface SentimentScorecard {
  totalScore: number;         // 0–100
  newsScore: number;          // 0–50
  optionsFlowScore: number;   // 0–30
  priceActionScore: number;   // 0–20
  direction: 'bullish' | 'bearish' | 'neutral';
  rationale: string;
}

// --- Composite Scoring Types ---

export type ConfidenceTier = 'high' | 'moderate' | 'low' | 'filtered';
export type SetupDirection = 'bullish' | 'bearish' | 'neutral';

export interface CompositeScore {
  /** Final composite score 0–100 */
  score: number;
  /** Score tier classification */
  tier: ConfidenceTier;
  /** Directional bias */
  direction: SetupDirection;
  /** Weighted TA contribution (0–55) */
  technicalContribution: number;
  /** Weighted FA contribution (0–25) */
  fundamentalContribution: number;
  /** Weighted SA contribution (0–20) */
  sentimentContribution: number;
  /** Raw technical score before weighting (0–100) */
  technicalScore: number;
  /** Raw fundamental score before weighting (0–100) */
  fundamentalScore: number;
  /** Raw sentiment score before weighting (0–100) */
  sentimentScore: number;
  /** Whether setup meets the 75+ high-confidence threshold for tracking */
  isHighConfidence: boolean;
  /** Whether setup should be published/shown */
  isPublishable: boolean;
}

// --- Backtesting / Performance Tracking Types ---

export interface SetupTrackingEntry {
  symbol: string;
  scanDate: string;
  entryPrice: number;
  compositeScore: number;
  confidenceTier: ConfidenceTier;
  direction: SetupDirection;
  target1: number;
  target2: number;
  stopLoss: number;
  rr1: number;
  rr2: number;
  setupStage: string;
  technicalScore: number;
  fundamentalScore: number;
  sentimentScore: number;
}

export interface SetupResolution {
  symbol: string;
  scanDate: string;
  resolvedAt: string;
  outcome: 'win' | 'loss' | 'open';
  exitPrice: number;
  returnPct: number;
  daysHeld: number;
}

export interface PerformanceSummary {
  totalTracked: number;
  totalResolved: number;
  wins: number;
  losses: number;
  open: number;
  winRate: number;           // 0–100 percentage
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;      // avgWin / avgLoss
  targetWinRate: number;     // 75 (the 75% target)
  meetsTarget: boolean;
}

// --- Scanner Types ---

export interface SP500Stock {
  symbol: string;
  name: string;
  sector: string;
}

export interface ScannerStockResult {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  // Legacy M2M 5-factor fields (kept for backwards compatibility)
  m2mScore: number;
  m2mMaxScore: number;
  factorsPassed: number;
  totalFactors: number;
  publishable: boolean;
  // Composite score fields (v2.0+)
  compositeScore?: number;
  compositeTier?: ConfidenceTier;
  technicalScore?: number;
  fundamentalScore?: number;
  sentimentScore?: number;
  setupDirection?: SetupDirection;
  // Setup metadata
  setupStage: string;
  volatilityRegime: string;
  rsi: number;
  macdSignal: 'bullish' | 'bearish';
  trendAlignment: 'bullish' | 'bearish' | 'neutral';
  recommendation: string;
  // AI quality assessment
  aiSetupQuality: 'high' | 'moderate' | 'low';
  aiConfidence: number;
  aiEarlyStage: boolean;
  aiKeySignal: string;
  aiRisk: string;
  aiCatalystPresent: boolean;
  aiSummary: string;
  spyRS?: SpyRelativeStrength | null;
  partial: boolean;
  error?: string;
  analyzedAt: string;
}

export interface ScannerResult {
  scanDate: string;
  startedAt: string;
  completedAt: string;
  totalStocks: number;
  successCount: number;
  errorCount: number;
  stocks: ScannerStockResult[];
  topByScore: string[];
  justTriggered: string[];
  publishable: string[];
  earlyStage: string[];
  highQuality: string[];
  bySector: Record<string, number>;
}

export interface ScanBatchStatus {
  scanDate: string;
  totalBatches: number;
  completedBatches: number;
  currentBatch: number;
  status: 'running' | 'completed' | 'failed';
  stocksProcessed: number;
  totalStocks: number;
  startedAt: string;
  lastUpdatedAt: string;
}

// --- Watchlist Types ---

export interface WatchlistStock {
  symbol: string;
  name: string;
  sector: string;
}

export interface WatchlistMeta {
  id: string;
  name: string;
  description?: string;
  count: number;
}
