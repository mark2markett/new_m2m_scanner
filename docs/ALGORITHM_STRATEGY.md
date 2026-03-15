# M2M Scanner — Algorithm & Indicator Strategy Specification

**Version:** 2.0  
**Status:** Active  
**Last Updated:** 2026-03-14  
**Success Threshold:** 75% win rate on setups scoring ≥ 75 composite points

---

## 1. Executive Summary

The M2M S&P 500 Scanner employs a **three-pillar composite scoring framework** combining Technical Analysis (TA), Fundamental Analysis (FA), and Sentiment Analysis (SA). Each pillar is independently scored and then weighted into a final **Composite Score (0–100)**. Only setups reaching ≥75 points are designated "high-confidence" and tracked for performance measurement.

```
Composite Score = (TA × 0.55) + (FA × 0.25) + (SA × 0.20)
```

This weighting reflects empirical research showing technical signals are the most actionable for near-term setups (1–20 trading day horizon), while fundamental context reduces false positives and sentiment provides early-warning catalysts.

---

## 2. System Architecture Overview

```
Raw OHLCV Data (120 bars daily)
        │
        ▼
┌───────────────────────────────────────────────────┐
│  Technical Analysis Engine (55% weight)           │
│  ┌──────────────┐  ┌──────────────┐               │
│  │ M2M 5-Factor │  │ Setup Stage  │               │
│  │ Scorecard    │  │ Classifier   │               │
│  └──────────────┘  └──────────────┘               │
│  ┌──────────────┐  ┌──────────────┐               │
│  │ Volatility   │  │ SPY Relative │               │
│  │ Regime       │  │ Strength     │               │
│  └──────────────┘  └──────────────┘               │
└───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│  Fundamental Analysis Engine (25% weight)         │
│  ┌──────────────┐  ┌──────────────┐               │
│  │ Valuation    │  │ Growth       │               │
│  │ Quality      │  │ Quality      │               │
│  └──────────────┘  └──────────────┘               │
│  ┌──────────────┐                                 │
│  │ Sector       │                                 │
│  │ Relative     │                                 │
│  └──────────────┘                                 │
└───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│  Sentiment Analysis Engine (20% weight)           │
│  ┌──────────────┐  ┌──────────────┐               │
│  │ News         │  │ Options Flow │               │
│  │ Sentiment    │  │ Sentiment    │               │
│  └──────────────┘  └──────────────┘               │
│  ┌──────────────┐                                 │
│  │ Price Action │                                 │
│  │ Sentiment    │                                 │
│  └──────────────┘                                 │
└───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│  Composite Scoring Engine                         │
│  Score = TA(55%) + FA(25%) + SA(20%)              │
│  ≥75 pts → High Confidence Setup                  │
│  ≥60 pts → Moderate Confidence Setup              │
│  < 60 pts → Filtered Out                          │
└───────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────┐
│  AI Narrative Engine (GPT-4o)                     │
│  keySignal | risk | summary                       │
└───────────────────────────────────────────────────┘
```

---

## 3. Technical Analysis Engine (55% of Composite Score)

### 3.1 Indicator Set & Parameters

| Indicator | Parameters | Purpose | Data Requirement |
|-----------|-----------|---------|-----------------|
| **RSI** (Wilder's) | Period: 14 | Momentum overbought/oversold | 30+ bars |
| **MACD** | Fast: 12, Slow: 26, Signal: 9 | Trend & momentum crossovers | 40+ bars |
| **EMA Fast** | Period: 20 | Near-term trend direction | 20+ bars |
| **EMA Slow** | Period: 50 | Medium-term trend direction | 50+ bars |
| **Bollinger Bands** | Period: 20, StdDev: 2 | Volatility & mean reversion | 20+ bars |
| **ATR** | Period: 14 | Volatility measurement & position sizing | 15+ bars |
| **ADX** | Period: 14 | Trend strength (direction-agnostic) | 30+ bars |
| **Stochastic %K/%D** | K: 14, D: 3 | Short-term momentum & divergence | 17+ bars |
| **CMF** | Period: 20 | Volume-weighted accumulation/distribution | 20+ bars |

### 3.2 Volatility Regime Detection

The scanner classifies each stock into one of three volatility regimes using ATR Z-score:

```
ATR% = (ATR / CurrentPrice) × 100
Z = (ATR% - Historical_Mean_ATR%) / Historical_Std_ATR%

  Z > +1.0  → High Volatility Regime
  Z < -1.0  → Low Volatility Regime
  Otherwise → Normal Volatility Regime
```

**Regime impact on scoring:**
- **High Volatility**: Reduces Technical Structure score by up to 5 points (momentum signals are noisier). Expands S/R tolerance to 3%.
- **Low Volatility**: Increases Technical Structure score by 2 points (cleaner signals). Tightens S/R tolerance to 1%.
- **Normal**: No adjustment.

### 3.3 SPY Relative Strength

Computed across three windows (10d, 20d, 50d):

```
RS_Nd = (1 + Stock_Return_N) / (1 + SPY_Return_N)

  RS > 1.02 → Leading  (bonus: +5 pts to Technical score)
  RS < 0.98 → Lagging  (penalty: -3 pts from Technical score)
  Otherwise → Inline   (no adjustment)
```

Composite label uses the **average** of all three RS ratios.

### 3.4 M2M 5-Factor Technical Scorecard

Maximum Technical score: **100 points** (normalized to 55-point composite contribution)

#### Factor 1: Strategy Signal Strength (30 pts)
Measures directional consensus across three core momentum signals.

| Condition | Points |
|-----------|--------|
| All 3 signals aligned (EMA, MACD, RSI) | 18 |
| 2 of 3 signals aligned | 10 |
| Mixed / no direction | 5 |
| RSI in healthy range (30–70) | +6 |
| MACD histogram confirms momentum direction | +6 |

**Threshold to pass:** ≥ 15 points

#### Factor 2: Technical Structure (25 pts)
Measures trend quality, setup stage, and price structure.

| Condition | Points |
|-----------|--------|
| ADX > 25 (strong trend) | 8 |
| ADX 20–25 (moderate trend) | 4 |
| ADX < 20 (weak/no trend) | 0 |
| Price within Bollinger mid-zone (20–80%) | 5 |
| Price near Bollinger band (< 20% or > 80%) | 2 |
| Volume confirmation (5-bar avg ≥ 80% of 20-bar avg) | +3 |
| Setup Stage: Just Triggered | 9 |
| Setup Stage: Mid Setup | 7 |
| Setup Stage: Setup Forming | 4 |
| Setup Stage: Late Setup | 1 |
| Stochastic %K in healthy zone (20–80) | +3 |
| Pullback penalty: > 5% from 20-bar high | -1 to -5 |

**Threshold to pass:** ≥ 12.5 points (50%)

#### Factor 3: Options Quality (25 pts)
When options data is available, measures liquidity and sentiment signals from the options market.

| Condition | Points |
|-----------|--------|
| High liquidity (Vol > 10K, OI > 50K) | 10 |
| Good liquidity (Vol > 5K, OI > 20K) | 7 |
| Moderate liquidity (Vol > 1K, OI > 5K) | 4 |
| Low liquidity | 1 |
| P/C Ratio < 0.7 (bullish flow) | 8 |
| P/C Ratio 0.7–1.0 (neutral flow) | 5 |
| P/C Ratio > 1.0 (bearish flow) | 2 |
| IV / Realized Vol ratio 0.8–1.5 (normal) | 7 |
| IV crushed or elevated | 2–4 |

*When options data is unavailable, factor is set to 13/25 (neutral, passes).*

**Threshold to pass:** ≥ 12.5 points (50%)

#### Factor 4: Risk/Reward Ratio (10 pts)
Computes implied R/R from nearest S/R levels.

| Condition | Points |
|-----------|--------|
| Risk/Reward ≥ 3:1 | 10 |
| Risk/Reward 2:1 – 2.99:1 | 7 |
| Risk/Reward 1.5:1 – 1.99:1 | 5 |
| Risk/Reward 1:1 – 1.49:1 | 3 |
| Risk/Reward < 1:1 | 1 |

**Threshold to pass:** ≥ 5 points (R/R ≥ 1.5:1)

#### Factor 5: Catalyst Presence (10 pts)
Measures if a meaningful news catalyst exists.

| Condition | Points |
|-----------|--------|
| Recent positive news (< 48 hrs) | 8–10 |
| Older positive news (2–7 days) | 5–7 |
| Neutral / no news | 3 |
| Negative news | 1 |

**Threshold to pass:** ≥ 5 points

#### Publication Rules
A setup is **published** (shown as actionable) only when:
1. `totalScore ≥ 65` (publication threshold), AND
2. `factorsPassed ≥ 3` (multi-factor confirmation)

---

## 4. Fundamental Analysis Engine (25% of Composite Score)

> **Note:** Fundamental data is fetched from Polygon.io reference endpoints and supplemented by market cap data. Full P/E, revenue growth, and debt ratios require a premium data subscription. The engine degrades gracefully when data is unavailable.

### 4.1 Fundamental Scoring Components

Maximum Fundamental score: **100 points** (normalized to 25-point composite contribution)

#### Valuation Quality (40 pts)

| Metric | Condition | Points |
|--------|-----------|--------|
| P/E Ratio | 10–20x (value zone) | 20 |
| P/E Ratio | 20–30x (fair value) | 14 |
| P/E Ratio | 5–10x (deep value, sector-dependent) | 10 |
| P/E Ratio | 30–50x (growth premium, justified) | 8 |
| P/E Ratio | > 50x or negative (speculative/loss) | 2 |
| P/E Ratio | Not available | 10 (neutral) |
| Market Cap | Large-cap > $10B (institutional support) | +10 |
| Market Cap | Mid-cap $2B–$10B (high growth potential) | +7 |
| Market Cap | Small-cap < $2B (high risk/reward) | +3 |
| Market Cap | Not available | +5 (neutral) |
| Sector Momentum | Sector outperforming S&P 500 this month | +10 |
| Sector Momentum | Sector inline ± 1% | +5 |
| Sector Momentum | Sector underperforming | 0 |

#### Growth Quality (35 pts)

| Metric | Condition | Points |
|--------|-----------|--------|
| Revenue Growth YoY | > 20% | 20 |
| Revenue Growth YoY | 10–20% | 15 |
| Revenue Growth YoY | 5–10% | 10 |
| Revenue Growth YoY | 0–5% | 5 |
| Revenue Growth YoY | Negative | 1 |
| Revenue Growth YoY | Not available | 8 (neutral) |
| EPS Growth YoY | > 15% | 15 |
| EPS Growth YoY | 5–15% | 10 |
| EPS Growth YoY | 0–5% | 5 |
| EPS Growth YoY | Negative | 1 |
| EPS Growth YoY | Not available | 7 (neutral) |

#### Financial Health (25 pts)

| Metric | Condition | Points |
|--------|-----------|--------|
| Debt/Equity | < 0.5 (low leverage) | 15 |
| Debt/Equity | 0.5–1.5 (moderate leverage) | 10 |
| Debt/Equity | 1.5–3.0 (high leverage) | 5 |
| Debt/Equity | > 3.0 (distressed) | 1 |
| Debt/Equity | Not available | 8 (neutral) |
| Profit Margin | > 20% (high margin business) | 10 |
| Profit Margin | 10–20% | 7 |
| Profit Margin | 5–10% | 4 |
| Profit Margin | < 5% or negative | 1 |
| Profit Margin | Not available | 5 (neutral) |

### 4.2 Data Availability Degradation

When fundamental data is unavailable (common with free API tiers):
- All sub-scores fall back to **neutral** values
- Fundamental pillar contributes `50/100 × 25 = 12.5 pts` to composite (neutral, non-disqualifying)
- A `fundamentalDataAvailable: boolean` flag is exposed in results

---

## 5. Sentiment Analysis Engine (20% of Composite Score)

### 5.1 Sentiment Scoring Components

Maximum Sentiment score: **100 points** (normalized to 20-point composite contribution)

#### News Sentiment (50 pts)

Scoring accounts for both recency decay and signal strength.

| Condition | Points |
|-----------|--------|
| Strong positive (≥ 70% positive articles, < 24 hrs) | 45–50 |
| Moderate positive (> 50% positive articles, < 48 hrs) | 35–44 |
| Mixed / neutral (40–60% neutral articles) | 20–34 |
| Moderate negative (> 50% negative articles) | 10–19 |
| Strong negative (≥ 70% negative articles) | 0–9 |
| No news available | 25 (neutral) |

**Recency decay factor:** Articles older than 7 days are weighted at 50%; > 30 days at 10%.

#### Options Flow Sentiment (30 pts)

Derived from Put/Call ratio and unusual options activity.

| Condition | Points |
|-----------|--------|
| Heavy call buying: P/C < 0.5, high unusual volume | 28–30 |
| Moderate call buying: P/C 0.5–0.7 | 20–27 |
| Neutral flow: P/C 0.7–1.0 | 12–19 |
| Moderate put buying: P/C 1.0–1.5 | 5–11 |
| Heavy put buying: P/C > 1.5 | 0–4 |
| Options data unavailable | 15 (neutral) |

#### Price Action Sentiment (20 pts)

Derived from short-term price momentum signals.

| Condition | Points |
|-----------|--------|
| Price > EMA20 > EMA50 + volume expansion | 18–20 |
| Price > EMA20 > EMA50, volume flat/down | 13–17 |
| Price between EMA20 and EMA50 | 8–12 |
| Price < EMA20 or EMA20 < EMA50 | 3–7 |
| Price < EMA20 < EMA50 + volume expansion | 0–2 |

---

## 6. Composite Scoring Engine

### 6.1 Final Score Formula

```typescript
CompositeScore = 
  (TechnicalScore / 100) × 55 +
  (FundamentalScore / 100) × 25 +
  (SentimentScore / 100) × 20
```

The composite score is always in the range **0–100**.

### 6.2 Confidence Tier Classification

| Composite Score | Tier | Action |
|----------------|------|--------|
| ≥ 75 | **High Confidence** | Published, tracked for backtesting |
| 60–74.9 | **Moderate Confidence** | Published with lower priority |
| 45–59.9 | **Low Confidence** | Shown but not tracked |
| < 45 | **Filtered** | Not displayed |

### 6.3 Direction Classification

Every setup is classified directionally:

| Condition | Direction |
|-----------|-----------|
| EMA20 > EMA50 AND Price > EMA20 AND MACD Bullish | Bullish |
| EMA20 < EMA50 AND Price < EMA20 AND MACD Bearish | Bearish |
| Mixed signals | Neutral |

**Bullish setups** suggest long stock or long call options strategies.  
**Bearish setups** suggest short stock or long put options strategies.

### 6.4 Setup Stage Lifecycle

```
Setup Forming → Just Triggered → Mid Setup → Late Setup
      │                │               │           │
 Near S/R,       Breakout +       All signals   Extended,
 signals         MACD cross +     aligned +     overbought/
 building        volume surge     momentum      oversold
```

**Optimal entry window:** `Just Triggered` → early `Mid Setup`  
**Exit signal:** `Late Setup` classification

---

## 7. Backtesting Parameters & Success Criteria

### 7.1 Historical Lookback for Indicator Validation

| Indicator | Min Bars Required | Recommended Bars |
|-----------|------------------|-----------------|
| RSI | 15 | 30 |
| MACD | 35 | 50 |
| EMA 20 | 20 | 40 |
| EMA 50 | 50 | 80 |
| Bollinger Bands | 20 | 40 |
| ATR | 15 | 30 |
| ADX | 28 | 50 |
| Stochastic | 17 | 30 |
| CMF | 20 | 40 |
| **Full Engine** | **60 bars** | **120 bars** |

The scanner fetches 120 bars of daily data to ensure all indicators have adequate warm-up periods.

### 7.2 Success Measurement Criteria

A setup is considered a **success** if, within the tracking window, the stock reaches the projected target price before hitting the stop-loss level.

```
Entry Price:     Close price on day of setup detection
Target Price:    Nearest resistance (bullish) or support (bearish)
Stop-Loss:       Entry ± 1.5× ATR (default)
Tracking Window: 20 trading days (1 calendar month)
```

**Minimum R/R for tracking:** 1.5:1

### 7.3 Performance Benchmarking

| Metric | Target | Measurement |
|--------|--------|------------|
| Win Rate (≥75 composite) | ≥ 75% | Tracked setups hitting target before stop |
| Win Rate (60–74 composite) | ≥ 60% | Secondary tier performance |
| Average Win / Average Loss | ≥ 2.0 | Profit factor |
| Maximum Drawdown | < 15% per setup | Risk control |
| False Positive Rate | < 25% | Setups scoring ≥75 that fail |

### 7.4 Backtesting Simulation Parameters

When running offline backtests against historical S&P 500 data:

```
Data Horizon:          5 years of daily OHLCV
Universe:              All current S&P 500 constituents (503 stocks)
Scan Frequency:        Daily (end-of-day data)
Entry Timing:          Next open after signal detection (realistic)
Slippage Model:        0.05% per trade
Commission Model:      $0 (reflects modern zero-commission brokers)
Position Sizing:       Equal weight (2% of portfolio per setup)
Maximum Positions:     25 simultaneous (50% capital)
Minimum Volume Filter: 500,000 avg daily volume (liquidity filter)
Minimum Price Filter:  $5.00 (penny stock exclusion)
```

### 7.5 Parameter Optimization Ranges

The following parameter ranges should be tested during backtesting to find optimal settings:

| Parameter | Current Value | Test Range | Step |
|-----------|--------------|-----------|------|
| RSI Period | 14 | 10–21 | 1 |
| MACD Fast | 12 | 8–16 | 2 |
| MACD Slow | 26 | 20–34 | 2 |
| MACD Signal | 9 | 7–12 | 1 |
| EMA Fast | 20 | 15–25 | 5 |
| EMA Slow | 50 | 40–60 | 10 |
| BB Period | 20 | 15–25 | 5 |
| ADX Period | 14 | 10–21 | 1 |
| Publication Threshold | 65 | 55–80 | 5 |
| TA Weight | 55% | 45–65% | 5% |
| FA Weight | 25% | 15–35% | 5% |
| SA Weight | 20% | 10–30% | 5% |

---

## 8. Filter Hierarchy & Scan Flow

### 8.1 Pre-Scan Filters (applied before indicator calculation)

1. **Minimum Price:** > $5.00 (exclude penny stocks)
2. **Minimum Volume:** > 500,000 shares avg daily volume
3. **Data Availability:** Minimum 60 bars of daily OHLCV data
4. **Market Status:** Regular market hours only (no pre/after-hours anomalies)

### 8.2 Scan Execution Flow

```
1. Load Universe (S&P 500 or custom CSV watchlist)
2. Fetch SPY data for relative strength baseline
3. For each stock (batches of 10, parallel within batch):
   a. Fetch 120-bar OHLCV daily data
   b. Fetch 3 most recent news articles
   c. Compute all technical indicators
   d. Detect volatility regime
   e. Compute SPY relative strength
   f. Calculate M2M 5-factor Technical scorecard
   g. Calculate Fundamental scorecard (data permitting)
   h. Calculate Sentiment scorecard
   i. Compute Composite Score
   j. Classify setup stage, direction, confidence tier
   k. If compositeScore ≥ 45: run AI narrative generation
4. Sort results by composite score descending
5. Tag: topByScore, justTriggered, publishable, highQuality, earlyStage
6. Store results in KV store with timestamp
```

### 8.3 Custom Watchlist Support

The scanner accepts CSV watchlists in the following format:
```csv
symbol,name,sector
AAPL,Apple Inc,Technology
MSFT,Microsoft Corp,Technology
```

Watchlists are stored in `public/watchlists/` and selected via the `?watchlist=<id>` query parameter.

---

## 9. AI Narrative Generation Strategy

The AI (GPT-4o) receives quantitative indicators as structured input and generates **three narrative fields only**:
- `keySignal`: Single most important technical signal (≤ 80 chars)
- `risk`: Primary risk to the setup (≤ 80 chars)
- `summary`: 2–3 sentence educational assessment (≤ 250 chars)

**AI does NOT:**
- Override algorithmically computed scores
- Make buy/sell recommendations (educational language only)
- Generate price targets (these are computed algorithmically from S/R levels)

**AI input includes:**
- All 9 technical indicator values
- S/R levels, setup stage, volatility regime
- M2M scorecard totals (not individual factor breakdown)
- Composite score and confidence tier
- News sentiment classification
- SPY relative strength ratios

---

## 10. Risk Management Integration

### 10.1 Algorithmically Computed Trade Parameters

For every published setup, the system computes:

```
Entry Zone:    [currentPrice - 0.5×ATR, currentPrice + 0.5×ATR]
Stop-Loss:     Entry - 1.5×ATR (bullish) | Entry + 1.5×ATR (bearish)
Target 1:      Nearest resistance (bullish) | nearest support (bearish)
Target 2:      Second resistance/support level
Risk (R):      Entry - Stop
Reward 1 (R1): Target1 - Entry
Reward 2 (R2): Target2 - Entry
R/R Ratio 1:   R1 / Risk
R/R Ratio 2:   R2 / Risk
```

### 10.2 Position Sizing Guidance

Using the 2% risk rule:
```
Max Risk Per Trade: 2% of portfolio value
Position Size: (Portfolio × 0.02) / (Entry - Stop)
```

---

## 11. Indicator Selection Rationale

### Why This Combination?

The nine indicators were selected through analysis of backtested performance, complementarity, and coverage of the four essential dimensions of a quality setup:

| Dimension | Indicators | Why |
|-----------|-----------|-----|
| **Trend Direction** | EMA20, EMA50, ADX | EMAs define direction; ADX confirms strength without false signals in ranging markets |
| **Momentum** | RSI, MACD, Stochastic | Three independent momentum oscillators. RSI for overbought/oversold; MACD for crossover timing; Stochastic for short-term turns |
| **Volatility** | Bollinger Bands, ATR | BB defines breakout levels; ATR provides absolute volatility for position sizing and stop placement |
| **Volume/Flow** | CMF | Money flow confirms whether price moves have institutional backing |

### Indicator Redundancy Strategy

Deliberate redundancy across the momentum dimension (RSI + MACD + Stochastic) is intentional:
- **Agreement** among all three = high-conviction signal
- **Divergence** among them = warning of weakening setup
- This is the core of the "alignment score" in Factor 1

### What Was Excluded & Why

| Excluded Indicator | Reason |
|-------------------|--------|
| Simple Moving Averages (SMA) | EMA provides more responsive signals; SMA adds redundancy |
| Ichimoku Cloud | Complex, requires 52-bar minimum, difficult to explain to retail users |
| Williams %R | Redundant with Stochastic; same information different scale |
| OBV (On-Balance Volume) | CMF provides superior volume flow information |
| Parabolic SAR | Frequently whipsaws in volatile markets; ATR-based stops are superior |
| VWAP | Intraday metric not applicable to daily bar analysis |

---

## 12. Failure Mode Analysis & Mitigations

| Failure Mode | Probability | Impact | Mitigation |
|-------------|-------------|--------|-----------|
| False breakout signals | Medium | High | Require volume confirmation + MACD cross simultaneously |
| Whipsaw in ranging markets | High | Medium | ADX filter (< 20 = low confidence); volatility regime detection |
| Late entries (Mid/Late Setup) | Medium | Medium | Setup stage classifier reduces score for Late setups |
| Fundamental trap (good tech, bad fundamentals) | Low | High | FA engine penalizes negative earnings/high debt |
| Sentiment reversal (bad news after entry) | Low | High | AI risk field surfaces sentiment risk; news recency decay |
| Data gaps / API failures | Medium | Medium | Graceful degradation; partial: true flag; cached fallbacks |
| Overfitting to recent market conditions | Unknown | High | Parameter optimization ranges defined; quarterly re-evaluation |

---

## 13. Version History & Planned Enhancements

### v2.0 (Current) — Released 2026-03-14
- ✅ Three-pillar composite scoring (TA + FA + SA)
- ✅ Fundamental analysis engine with graceful degradation
- ✅ Enhanced sentiment scoring with recency decay
- ✅ Unified composite scoring engine
- ✅ Direction-aware setup classification (bullish/bearish)
- ✅ Volume confirmation requirement for setup stages
- ✅ Pullback penalty in Technical Structure scoring
- ✅ Algorithm specification document (this document)

### v1.0 (Legacy) — 5-Factor TA-only scoring
- M2M 5-factor scorecard (TA only)
- SPY relative strength
- Basic news sentiment (positive/negative/neutral)
- AI narrative (GPT-4o)

### Planned v2.1 Enhancements
- [ ] Earnings calendar integration (filter out setups within 2 days of earnings)
- [ ] Sector rotation scoring (weight sectors trending into favor)
- [ ] Multi-timeframe confirmation (weekly trend confirmation for daily signals)
- [ ] Options unusual activity scanner (unusual volume detection)
- [ ] Backtesting harness with S&P 500 historical data
- [ ] Performance tracking dashboard (win rate calculation against 75-point threshold)
- [ ] Weekly/4-hour timeframe scan modes

---

## 14. Success Tracking Protocol

Setups with **compositeScore ≥ 75** are automatically logged for performance tracking:

```
Log Entry:
  - symbol
  - scanDate (entry date)
  - entryPrice (scan-day close)
  - compositeScore
  - confidenceTier
  - direction (bullish/bearish)
  - target1, target2 (S/R based)
  - stopLoss (ATR based)
  - rr1, rr2
  - setupStage
  - technicalScore, fundamentalScore, sentimentScore

Resolution Entry (added after tracking window):
  - resolvedAt
  - outcome: 'win' | 'loss' | 'open'
  - exitPrice
  - returnPct
  - daysHeld
```

**Running Win Rate** is computed as:
```
WinRate = (ResolvdWins / TotalResolved) × 100
Target: ≥ 75%
```

---

*This document defines the canonical algorithm strategy for the M2M S&P 500 Scanner. All code implementations in `lib/utils/` must conform to the specifications defined herein.*
