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

// --- Backtesting Types ---

export interface BacktestSetup {
  symbol: string;
  scanDate: string;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  direction: SetupDirection;
  compositeScore: number;
  setupStage: string;
}

export interface BacktestResult {
  setup: BacktestSetup;
  exitPrice: number;
  exitDate: string;
  holdingDays: number;
  pnlPct: number;
  outcome: 'win' | 'loss' | 'breakeven';
  maxFavorableExcursion: number;
  maxAdverseExcursion: number;
}

// --- Stock / Watchlist Types ---

export interface SP500Stock {
  symbol: string;
  name: string;
  sector: string;
}

export interface WatchlistMeta {
  id: string;
  name: string;
  description: string;
  count: number;
  isCustom?: boolean;
}

// --- Scanner Result Types ---

export interface ScannerStockResult {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;

  // M2M 5-factor scorecard result
  m2mScore: number;
  m2mMaxScore: number;
  /** Number of M2M factors that passed */
  factorsPassed: number;
  /** Total number of M2M factors evaluated */
  totalFactors: number;
  publishable: boolean;

  // Composite score (TA + FA + SA)
  compositeScore: number;
  compositeTier: ConfidenceTier;
  /** Directional bias from composite score */
  setupDirection: SetupDirection;
  technicalScore: number;
  fundamentalScore: number;
  sentimentScore: number;

  // Setup classification
  setupStage: string;
  trendAlignment: 'bullish' | 'bearish' | 'neutral';
  volatilityRegime: string;

  // Technical indicators snapshot
  rsi: number;
  macdSignal: 'bullish' | 'bearish';
  macdHistogram?: number;
  ema20?: number;
  ema50?: number;
  adx?: number;
  atr?: number;
  stochK?: number;
  stochD?: number;
  cmf?: number;
  bbUpper?: number;
  bbLower?: number;

  // Support / resistance (optional — not always populated by scanner)
  support?: number[];
  resistance?: number[];

  // AI quality assessment
  aiSetupQuality: 'high' | 'moderate' | 'low';
  /** Signal confidence score 0-100 */
  aiConfidence: number;
  aiEarlyStage: boolean;
  aiCatalystPresent: boolean;

  // Algorithmic recommendation string
  recommendation: string;

  // News/sentiment summary string
  sentiment?: string;

  // AI narrative (GPT-4o)
  aiKeySignal?: string;
  aiRisk?: string;
  aiSummary?: string;

  // SPY relative strength
  spyRS?: SpyRelativeStrength | null;

  // Scan metadata
  partial: boolean;
  analyzedAt: string;

  // Backward-compat aliases (may be present in older cached scan data)
  m2mFactorsPassed?: number;
  m2mTotalFactors?: number;
  compositeDirection?: SetupDirection;
  aiSignalConfidence?: number;

  // Error handling
  error?: string;
}

export interface ScannerResult {
  scanDate: string;
  startedAt: string;
  completedAt: string;
  totalStocks: number;
  successCount: number;
  errorCount: number;
  stocks: ScannerStockResult[];

  // Quick-access symbol lists
  topByScore: string[];
  justTriggered: string[];
  publishable: string[];
  earlyStage: string[];
  highQuality: string[];

  // Sector breakdown
  bySector: Record<string, number>;
}

export interface ScanBatchStatus {
  scanDate: string;
  totalBatches: number;
  completedBatches: number;
  currentBatch: number;
  status: 'running' | 'completed' | 'error';
  stocksProcessed: number;
  totalStocks: number;
  startedAt: string;
  lastUpdatedAt: string;
  error?: string;
}

// ─── Authentication & User Types ────────────────────────────────────────────

export type UserRole = 'admin' | 'user';
export type AuthProvider = 'credentials' | 'google' | 'github';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  provider: AuthProvider;
  /** bcrypt hash — never returned in API responses */
  passwordHash?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

/** Safe subset of User returned to clients — no password hash */
export type PublicUser = Omit<User, 'passwordHash'>;

export interface AuthTokenPayload {
  sub: string;          // user id
  email: string;
  name: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
  expiresAt: string;
}

// ─── Custom Watchlist Types (user-managed) ──────────────────────────────────

export interface CustomWatchlist {
  id: string;
  userId: string;
  name: string;
  description: string;
  symbols: string[];          // uppercase ticker symbols
  createdAt: string;
  updatedAt: string;
}

export interface CreateWatchlistRequest {
  name: string;
  description?: string;
  symbols: string[];
}

export interface UpdateWatchlistRequest {
  name?: string;
  description?: string;
  symbols?: string[];
}

// ─── Historical Performance Tracking Types ───────────────────────────────────

/**
 * Represents a single tracked setup — recorded when a high-confidence
 * (compositeScore ≥ 75) setup is identified by the scanner.
 */
export interface TrackedSetup {
  id: string;                         // uuid
  userId: string;                     // who is tracking
  symbol: string;
  scanDate: string;                   // date setup was identified (YYYY-MM-DD)
  trackedAt: string;                  // ISO timestamp of tracking event
  direction: SetupDirection;
  compositeScore: number;             // score at time of identification
  entryPrice: number;                 // price at scan time
  setupStage: string;
  technicalScore: number;
  fundamentalScore: number;
  sentimentScore: number;
  sector: string;
  aiSummary?: string;
  notes?: string;                     // user notes
  status: 'open' | 'closed';
}

/**
 * Outcome recorded when a tracked setup is closed out.
 */
export interface SetupOutcome {
  id: string;                         // matches TrackedSetup.id
  exitPrice: number;
  exitDate: string;                   // YYYY-MM-DD
  holdingDays: number;
  pnlPct: number;                     // (exitPrice - entryPrice) / entryPrice * 100
  outcome: 'win' | 'loss' | 'breakeven';
  notes?: string;
}

/**
 * A TrackedSetup merged with its outcome (if closed).
 */
export interface PerformanceRecord extends TrackedSetup {
  outcome?: SetupOutcome;
}

/**
 * Aggregate statistics across all tracked setups for a user or scanner-wide.
 */
export interface PerformanceSummary {
  totalSetups: number;
  openSetups: number;
  closedSetups: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;                    // wins / closedSetups (0–1)
  avgPnlPct: number;                  // average P&L % across closed setups
  avgHoldingDays: number;
  avgCompositeScore: number;
  /** Win rate for setups with compositeScore ≥ 75 (primary KPI) */
  highConfidenceWinRate: number;
  /** Breakdown by direction */
  byDirection: {
    bullish: { total: number; wins: number; winRate: number };
    bearish: { total: number; wins: number; winRate: number };
    neutral: { total: number; wins: number; winRate: number };
  };
  /** Breakdown by sector */
  bySector: Record<string, { total: number; wins: number; winRate: number }>;
  /** Monthly rolling performance */
  byMonth: Array<{
    month: string;        // YYYY-MM
    total: number;
    wins: number;
    winRate: number;
    avgPnlPct: number;
  }>;
  calculatedAt: string;
}
