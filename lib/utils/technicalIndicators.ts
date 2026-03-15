/**
 * Technical Indicator Calculations
 *
 * Implements all M2M scanner indicators:
 *   RSI (Wilder's), EMA, MACD, ATR, Bollinger Bands,
 *   ADX (+DI / -DI), Stochastic %K/%D, Chaikin Money Flow (CMF)
 *
 * See docs/ALGORITHM_STRATEGY.md §3 for full specification.
 */

import type { TechnicalIndicators as TI } from '@/lib/types';

export type VolatilityRegime = 'High' | 'Normal' | 'Low';

export interface ComputeIndicatorsResult {
  indicators: TI;
  regime: VolatilityRegime;
}

export class TechnicalIndicators {
  // ─── RSI (Wilder's smoothing) ─────────────────────────────────────────────

  static rsi(prices: number[], period: number = 14): number[] {
    const result: number[] = [];
    if (prices.length < period + 1) return result;

    const deltas: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      deltas.push(prices[i] - prices[i - 1]);
    }

    const gains  = deltas.map(d => d > 0 ? d : 0);
    const losses = deltas.map(d => d < 0 ? -d : 0);

    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - (100 / (1 + rs)));

    for (let i = period; i < gains.length; i++) {
      avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
      avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
      const rs2 = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - (100 / (1 + rs2)));
    }

    return result;
  }

  // ─── EMA ──────────────────────────────────────────────────────────────────

  static ema(prices: number[], span: number): number[] {
    const result: number[] = [];
    if (prices.length === 0) return result;
    const alpha = 2 / (span + 1);
    let ema = prices[0];
    result.push(ema);
    for (let i = 1; i < prices.length; i++) {
      ema = alpha * prices[i] + (1 - alpha) * ema;
      result.push(ema);
    }
    return result;
  }

  // ─── MACD ─────────────────────────────────────────────────────────────────

  static macd(prices: number[], fast: number = 12, slow: number = 26, signal: number = 9) {
    const fastEma   = this.ema(prices, fast);
    const slowEma   = this.ema(prices, slow);
    const macdLine: number[] = [];

    for (let i = 0; i < Math.min(fastEma.length, slowEma.length); i++) {
      macdLine.push(fastEma[i] - slowEma[i]);
    }

    const signalLine = this.ema(macdLine, signal);

    const macdVal    = macdLine[macdLine.length - 1] ?? 0;
    const signalVal  = signalLine[signalLine.length - 1] ?? 0;

    return {
      macd:      macdVal,
      signal:    signalVal,
      histogram: macdVal - signalVal,
      macdLine,
      signalLine,
    };
  }

  // ─── ATR ──────────────────────────────────────────────────────────────────

  static atr(highs: number[], lows: number[], closes: number[], period: number = 14): number {
    if (highs.length < 2) return 0;

    const trueRanges: number[] = [];
    for (let i = 1; i < highs.length; i++) {
      const tr1 = highs[i] - lows[i];
      const tr2 = Math.abs(highs[i] - closes[i - 1]);
      const tr3 = Math.abs(lows[i] - closes[i - 1]);
      trueRanges.push(Math.max(tr1, tr2, tr3));
    }

    if (trueRanges.length < period) {
      return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
    }

    // Wilder's smoothed ATR
    let atrVal = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trueRanges.length; i++) {
      atrVal = (atrVal * (period - 1) + trueRanges[i]) / period;
    }
    return atrVal;
  }

  // ─── Bollinger Bands ──────────────────────────────────────────────────────

  static bollingerBands(prices: number[], period: number = 20, stdDev: number = 2) {
    if (prices.length < period) {
      const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
      return { upper: mean, middle: mean, lower: mean };
    }

    const recentPrices = prices.slice(-period);
    const sma          = recentPrices.reduce((a, b) => a + b, 0) / period;
    const variance     = recentPrices.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
    const std          = Math.sqrt(variance);

    return {
      upper:  sma + stdDev * std,
      middle: sma,
      lower:  sma - stdDev * std,
    };
  }

  // ─── ADX (+DI / -DI) ─────────────────────────────────────────────────────

  /**
   * Compute ADX using Wilder's smoothing (standard method).
   * Returns the final ADX value (0–100).
   */
  static adx(highs: number[], lows: number[], closes: number[], period: number = 14): number {
    if (highs.length < period * 2) return 20; // insufficient data — return moderate default

    const len = highs.length;
    const plusDM:  number[] = [];
    const minusDM: number[] = [];
    const tr:      number[] = [];

    for (let i = 1; i < len; i++) {
      const upMove   = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];

      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

      const trueRange = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      tr.push(trueRange);
    }

    // Wilder's first smoothed value
    let smoothTR     = tr.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

    const dx: number[] = [];

    for (let i = period; i < tr.length; i++) {
      smoothTR      = smoothTR      - smoothTR / period      + tr[i];
      smoothPlusDM  = smoothPlusDM  - smoothPlusDM / period  + plusDM[i];
      smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];

      const diPlus  = smoothTR > 0 ? (smoothPlusDM  / smoothTR) * 100 : 0;
      const diMinus = smoothTR > 0 ? (smoothMinusDM / smoothTR) * 100 : 0;
      const diSum   = diPlus + diMinus;

      dx.push(diSum > 0 ? (Math.abs(diPlus - diMinus) / diSum) * 100 : 0);
    }

    if (dx.length < period) return dx.length > 0 ? dx[dx.length - 1] : 20;

    // Wilder's smoothed ADX
    let adxVal = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dx.length; i++) {
      adxVal = (adxVal * (period - 1) + dx[i]) / period;
    }

    return adxVal;
  }

  // ─── Stochastic %K / %D ──────────────────────────────────────────────────

  /**
   * Slow stochastic: %K uses 14-bar lookback; %D is 3-bar SMA of %K.
   */
  static stochastic(
    highs: number[],
    lows:  number[],
    closes: number[],
    kPeriod: number = 14,
    dPeriod: number = 3
  ): { k: number; d: number } {
    if (closes.length < kPeriod) {
      return { k: 50, d: 50 }; // neutral default
    }

    const kValues: number[] = [];
    for (let i = kPeriod - 1; i < closes.length; i++) {
      const periodHighs  = highs.slice(i - kPeriod + 1, i + 1);
      const periodLows   = lows.slice(i - kPeriod + 1, i + 1);
      const highestHigh  = Math.max(...periodHighs);
      const lowestLow    = Math.min(...periodLows);
      const range        = highestHigh - lowestLow;
      const k = range > 0 ? ((closes[i] - lowestLow) / range) * 100 : 50;
      kValues.push(k);
    }

    const k = kValues[kValues.length - 1] ?? 50;

    if (kValues.length < dPeriod) return { k, d: k };

    const dValues = kValues.slice(-dPeriod);
    const d = dValues.reduce((a, b) => a + b, 0) / dPeriod;

    return { k, d };
  }

  // ─── Chaikin Money Flow (CMF) ─────────────────────────────────────────────

  /**
   * CMF = sum(MFV, period) / sum(volume, period)
   * where MFV = ((close - low) - (high - close)) / (high - low) * volume
   * Range: –1 to +1 (positive = buying pressure)
   */
  static cmf(
    highs:   number[],
    lows:    number[],
    closes:  number[],
    volumes: number[],
    period:  number = 20
  ): number {
    const len = Math.min(highs.length, lows.length, closes.length, volumes.length);
    if (len < period) return 0;

    const start = len - period;
    let mfvSum = 0;
    let volSum = 0;

    for (let i = start; i < len; i++) {
      const hl = highs[i] - lows[i];
      if (hl === 0) continue;
      const mfv = ((closes[i] - lows[i]) - (highs[i] - closes[i])) / hl * volumes[i];
      mfvSum += mfv;
      volSum += volumes[i];
    }

    return volSum > 0 ? mfvSum / volSum : 0;
  }

  // ─── Volatility Regime ───────────────────────────────────────────────────

  /**
   * Classify volatility regime from ATR as % of price.
   *   High:   ATR% > 3.5%
   *   Low:    ATR% < 1.0%
   *   Normal: otherwise
   */
  static volatilityRegime(
    atrValue: number,
    currentPrice: number
  ): VolatilityRegime {
    if (currentPrice <= 0) return 'Normal';
    const atrPct = (atrValue / currentPrice) * 100;
    if (atrPct > 3.5) return 'High';
    if (atrPct < 1.0) return 'Low';
    return 'Normal';
  }

  // ─── Master Compute Method ────────────────────────────────────────────────

  /**
   * Compute all indicators from raw OHLCV arrays and return a typed result.
   * This is the primary entry-point used by scannerEngine.ts.
   *
   * @param highs   - Array of bar high prices (oldest→newest)
   * @param lows    - Array of bar low prices
   * @param closes  - Array of bar close prices
   * @param volumes - Array of bar volumes
   * @param _timespan - Reserved for future multi-timeframe use
   */
  static computeIndicators(
    highs:    number[],
    lows:     number[],
    closes:   number[],
    volumes:  number[],
    _timespan: 'daily' | 'hourly' = 'daily'
  ): ComputeIndicatorsResult {
    const currentPrice = closes[closes.length - 1] ?? 0;

    // ── RSI ──
    const rsiArr = this.rsi(closes, 14);
    const rsi    = rsiArr[rsiArr.length - 1] ?? 50;

    // ── MACD ──
    const macdResult = this.macd(closes, 12, 26, 9);

    // ── EMAs ──
    const ema20Arr = this.ema(closes, 20);
    const ema50Arr = this.ema(closes, 50);
    const ema20    = ema20Arr[ema20Arr.length - 1] ?? currentPrice;
    const ema50    = ema50Arr[ema50Arr.length - 1] ?? currentPrice;

    // ── Bollinger Bands ──
    const bb = this.bollingerBands(closes, 20, 2);

    // ── ATR ──
    const atrVal = this.atr(highs, lows, closes, 14);

    // ── ADX ──
    const adxVal = this.adx(highs, lows, closes, 14);

    // ── Stochastic ──
    const stoch = this.stochastic(highs, lows, closes, 14, 3);

    // ── CMF ──
    const cmfVal = this.cmf(highs, lows, closes, volumes, 20);

    // ── Volatility Regime ──
    const regime = this.volatilityRegime(atrVal, currentPrice);

    const indicators: TI = {
      rsi,
      macd: {
        macd:      macdResult.macd,
        signal:    macdResult.signal,
        histogram: macdResult.histogram,
      },
      ema20,
      ema50,
      bollingerBands: bb,
      atr:  atrVal,
      adx:  adxVal,
      stochastic: { k: stoch.k, d: stoch.d },
      cmf:  cmfVal,
    };

    return { indicators, regime };
  }
}
