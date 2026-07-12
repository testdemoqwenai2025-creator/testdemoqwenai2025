/**
 * backtester.ts — Trading strategy backtesting engine.
 *
 * Tests trading strategies against historical data and computes:
 * - Total return vs buy-and-hold
 * - Sharpe ratio
 * - Max drawdown
 * - Win rate
 * - Number of trades
 * - Average win/loss
 * - Equity curve
 *
 * Strategies supported:
 * 1. SMA Crossover — buy when fast SMA > slow SMA, sell when opposite
 * 2. Momentum — buy when recent return > threshold, sell when < 0
 * 3. Mean Reversion — buy when price < lower Bollinger Band, sell when > middle
 * 4. Breakout — buy when price > N-day high, sell when < N-day low
 * 5. RSI — buy when RSI < 30 (oversold), sell when RSI > 70 (overbought)
 */

import { getTickerSeries, type TickerDailyPoint } from "@/lib/data-access";

export interface BacktestTrade {
  entryDate: number;
  entryPrice: number;
  exitDate: number;
  exitPrice: number;
  returnPct: number;
  holdingDays: number;
  reason: string;
}

export interface EquityPoint {
  date: number;
  equity: number;
  drawdown: number;
}

export interface BacktestResult {
  ticker: string;
  strategy: string;
  parameters: Record<string, number>;
  period: { start: number; end: number };
  metrics: {
    totalReturn: number;
    buyHoldReturn: number;
    alpha: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    numTrades: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    avgHoldingDays: number;
    annualizedReturn: number;
    annualizedVolatility: number;
  };
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  interpretation: {
    performance: "poor" | "below_average" | "average" | "good" | "excellent";
    summary: string;
  };
}

// ---------- Indicators ----------
function sma(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      result.push(slice.reduce((s, v) => s + v, 0) / period);
    }
  }
  return result;
}

function rsi(values: number[], period: number = 14): number[] {
  const result: number[] = [NaN];
  const gains: number[] = [0];
  const losses: number[] = [0];

  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);

    if (i < period) {
      result.push(NaN);
    } else {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0) / period;
      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
      }
    }
  }
  return result;
}

function bollingerBands(values: number[], period: number, mult: number) {
  const mid = sma(values, period);
  const upper: number[] = [];
  const lower: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      const m = mid[i];
      const variance = slice.reduce((s, v) => s + (v - m) ** 2, 0) / period;
      const sd = Math.sqrt(variance);
      upper.push(m + mult * sd);
      lower.push(m - mult * sd);
    }
  }
  return { mid, upper, lower };
}

function rollingMax(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      result.push(Math.max(...slice));
    }
  }
  return result;
}

function rollingMin(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      result.push(Math.min(...slice));
    }
  }
  return result;
}

// ---------- Strategy signals ----------
interface Signal {
  action: "buy" | "sell" | "hold";
  reason: string;
}

function smaCrossoverSignals(
  closes: number[],
  fastPeriod: number,
  slowPeriod: number
): Signal[] {
  const fast = sma(closes, fastPeriod);
  const slow = sma(closes, slowPeriod);
  const signals: Signal[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i === 0 || isNaN(fast[i]) || isNaN(slow[i]) || isNaN(fast[i - 1]) || isNaN(slow[i - 1])) {
      signals.push({ action: "hold", reason: "warming up" });
    } else if (fast[i] > slow[i] && fast[i - 1] <= slow[i - 1]) {
      signals.push({ action: "buy", reason: `SMA${fastPeriod} crossed above SMA${slowPeriod}` });
    } else if (fast[i] < slow[i] && fast[i - 1] >= slow[i - 1]) {
      signals.push({ action: "sell", reason: `SMA${fastPeriod} crossed below SMA${slowPeriod}` });
    } else {
      signals.push({ action: "hold", reason: "no crossover" });
    }
  }
  return signals;
}

function momentumSignals(
  closes: number[],
  lookback: number,
  threshold: number
): Signal[] {
  const signals: Signal[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < lookback) {
      signals.push({ action: "hold", reason: "warming up" });
    } else {
      const ret = ((closes[i] / closes[i - lookback]) - 1) * 100;
      if (ret > threshold) {
        signals.push({ action: "buy", reason: `${lookback}d return ${ret.toFixed(1)}% > ${threshold}%` });
      } else if (ret < 0) {
        signals.push({ action: "sell", reason: `${lookback}d return ${ret.toFixed(1)}% < 0%` });
      } else {
        signals.push({ action: "hold", reason: `${lookback}d return ${ret.toFixed(1)}%` });
      }
    }
  }
  return signals;
}

function meanReversionSignals(
  closes: number[],
  period: number,
  mult: number
): Signal[] {
  const { mid, upper, lower } = bollingerBands(closes, period, mult);
  const signals: Signal[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(lower[i])) {
      signals.push({ action: "hold", reason: "warming up" });
    } else if (closes[i] < lower[i]) {
      signals.push({ action: "buy", reason: `price $${closes[i].toFixed(2)} < lower BB $${lower[i].toFixed(2)}` });
    } else if (closes[i] > mid[i]) {
      signals.push({ action: "sell", reason: `price $${closes[i].toFixed(2)} > middle BB $${mid[i].toFixed(2)}` });
    } else {
      signals.push({ action: "hold", reason: "within bands" });
    }
  }
  return signals;
}

function breakoutSignals(
  closes: number[],
  period: number
): Signal[] {
  // Use rolling max/min of PRIOR period (exclude today to avoid look-ahead)
  const highs = closes;
  const rollingHigh = rollingMax(highs, period + 1);
  const rollingLow = rollingMin(highs, period + 1);
  const signals: Signal[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      signals.push({ action: "hold", reason: "warming up" });
    } else {
      const prevHigh = rollingHigh[i - 1];
      const prevLow = rollingLow[i - 1];
      if (closes[i] > prevHigh) {
        signals.push({ action: "buy", reason: `price $${closes[i].toFixed(2)} broke ${period}d high $${prevHigh.toFixed(2)}` });
      } else if (closes[i] < prevLow) {
        signals.push({ action: "sell", reason: `price $${closes[i].toFixed(2)} broke ${period}d low $${prevLow.toFixed(2)}` });
      } else {
        signals.push({ action: "hold", reason: "within range" });
      }
    }
  }
  return signals;
}

function rsiSignals(
  closes: number[],
  period: number,
  oversold: number,
  overbought: number
): Signal[] {
  const rsiValues = rsi(closes, period);
  const signals: Signal[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(rsiValues[i])) {
      signals.push({ action: "hold", reason: "warming up" });
    } else if (rsiValues[i] < oversold) {
      signals.push({ action: "buy", reason: `RSI ${rsiValues[i].toFixed(1)} < ${oversold} (oversold)` });
    } else if (rsiValues[i] > overbought) {
      signals.push({ action: "sell", reason: `RSI ${rsiValues[i].toFixed(1)} > ${overbought} (overbought)` });
    } else {
      signals.push({ action: "hold", reason: `RSI ${rsiValues[i].toFixed(1)}` });
    }
  }
  return signals;
}

// ---------- Main backtest function ----------
export function runBacktest(
  ticker: string,
  strategy: string,
  params: Record<string, number> = {},
  year?: number
): BacktestResult | null {
  const series = getTickerSeries(ticker);
  if (!series || series.length < 60) return null;

  const data = year ? series.filter((p) => p.year === year) : series;
  if (data.length < 30) return null;

  const closes = data.map((p) => p.close);

  // Generate signals based on strategy
  let signals: Signal[];
  let parameters: Record<string, number>;

  switch (strategy) {
    case "sma_crossover":
      parameters = { fastPeriod: params.fastPeriod ?? 10, slowPeriod: params.slowPeriod ?? 30 };
      signals = smaCrossoverSignals(closes, parameters.fastPeriod, parameters.slowPeriod);
      break;
    case "momentum":
      parameters = { lookback: params.lookback ?? 20, threshold: params.threshold ?? 5 };
      signals = momentumSignals(closes, parameters.lookback, parameters.threshold);
      break;
    case "mean_reversion":
      parameters = { period: params.period ?? 20, mult: params.mult ?? 2 };
      signals = meanReversionSignals(closes, parameters.period, parameters.mult);
      break;
    case "breakout":
      parameters = { period: params.period ?? 20 };
      signals = breakoutSignals(closes, parameters.period);
      break;
    case "rsi":
      parameters = { period: params.period ?? 14, oversold: params.oversold ?? 30, overbought: params.overbought ?? 70 };
      signals = rsiSignals(closes, parameters.period, parameters.oversold, parameters.overbought);
      break;
    default:
      return null;
  }

  // Simulate trading
  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let position = 0; // 0 = cash, 1 = holding
  let entryPrice = 0;
  let entryDate = 0;
  let entryIdx = 0;
  let equity = 1.0; // start with $1
  let peak = 1.0;

  for (let i = 0; i < data.length; i++) {
    const sig = signals[i];
    const price = closes[i];
    const date = data[i].date;

    // Update equity based on position
    if (position === 1 && i > 0) {
      const dailyReturn = (closes[i] / closes[i - 1]) - 1;
      equity *= (1 + dailyReturn);
    }

    // Track peak and drawdown
    if (equity > peak) peak = equity;
    const drawdown = ((equity - peak) / peak) * 100;

    equityCurve.push({ date, equity: Math.round(equity * 10000) / 10000, drawdown: Math.round(drawdown * 100) / 100 });

    // Execute signals
    if (sig.action === "buy" && position === 0) {
      position = 1;
      entryPrice = price;
      entryDate = date;
      entryIdx = i;
    } else if (sig.action === "sell" && position === 1) {
      position = 0;
      const returnPct = ((price / entryPrice) - 1) * 100;
      trades.push({
        entryDate,
        entryPrice,
        exitDate: date,
        exitPrice: price,
        returnPct: Math.round(returnPct * 100) / 100,
        holdingDays: i - entryIdx,
        reason: sig.reason,
      });
    }
  }

  // Close any open position at the end
  if (position === 1) {
    const lastIdx = data.length - 1;
    const returnPct = ((closes[lastIdx] / entryPrice) - 1) * 100;
    trades.push({
      entryDate,
      entryPrice,
      exitDate: data[lastIdx].date,
      exitPrice: closes[lastIdx],
      returnPct: Math.round(returnPct * 100) / 100,
      holdingDays: lastIdx - entryIdx,
      reason: "position closed at end of period",
    });
  }

  // Compute metrics
  const totalReturn = ((equity - 1) * 100);
  const buyHoldReturn = ((closes[closes.length - 1] / closes[0]) - 1) * 100;
  const alpha = totalReturn - buyHoldReturn;

  // Win rate
  const wins = trades.filter((t) => t.returnPct > 0);
  const losses = trades.filter((t) => t.returnPct <= 0);
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.returnPct, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.returnPct, 0) / losses.length : 0;
  const profitFactor = avgLoss !== 0 ? Math.abs(avgWin * wins.length / (avgLoss * losses.length)) : 0;
  const avgHoldingDays = trades.length > 0 ? trades.reduce((s, t) => s + t.holdingDays, 0) / trades.length : 0;

  // Sharpe ratio from equity curve returns
  const equityReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    equityReturns.push((equityCurve[i].equity / equityCurve[i - 1].equity) - 1);
  }
  const meanReturn = equityReturns.reduce((s, r) => s + r, 0) / (equityReturns.length || 1);
  const stdReturn = Math.sqrt(
    equityReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / (equityReturns.length || 1)
  );
  const sharpeRatio = stdReturn > 0 ? (meanReturn * 252 - 0.02) / (stdReturn * Math.sqrt(252)) : 0;

  // Max drawdown
  const maxDrawdown = Math.min(...equityCurve.map((e) => e.drawdown));

  // Annualized return and volatility
  const tradingDays = data.length;
  const annualizedReturn = (Math.pow(equity, 252 / tradingDays) - 1) * 100;
  const annualizedVol = stdReturn * Math.sqrt(252) * 100;

  // Interpretation
  let performance: BacktestResult["interpretation"]["performance"];
  if (alpha < -10) performance = "poor";
  else if (alpha < 0) performance = "below_average";
  else if (alpha < 10) performance = "average";
  else if (alpha < 30) performance = "good";
  else performance = "excellent";

  const summary = `${strategy} strategy on ${ticker}: ${totalReturn.toFixed(1)}% return vs ${buyHoldReturn.toFixed(1)}% buy-and-hold (alpha ${alpha >= 0 ? "+" : ""}${alpha.toFixed(1)}%). ${trades.length} trades, ${winRate.toFixed(0)}% win rate, Sharpe ${sharpeRatio.toFixed(2)}, max drawdown ${maxDrawdown.toFixed(1)}%. Performance: ${performance}.`;

  return {
    ticker,
    strategy,
    parameters,
    period: { start: data[0].date, end: data[data.length - 1].date },
    metrics: {
      totalReturn: Math.round(totalReturn * 100) / 100,
      buyHoldReturn: Math.round(buyHoldReturn * 100) / 100,
      alpha: Math.round(alpha * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      winRate: Math.round(winRate * 10) / 10,
      numTrades: trades.length,
      avgWin: Math.round(avgWin * 100) / 100,
      avgLoss: Math.round(avgLoss * 100) / 100,
      profitFactor: Math.round(profitFactor * 100) / 100,
      avgHoldingDays: Math.round(avgHoldingDays * 10) / 10,
      annualizedReturn: Math.round(annualizedReturn * 100) / 100,
      annualizedVolatility: Math.round(annualizedVol * 100) / 100,
    },
    trades,
    equityCurve,
    interpretation: { performance, summary },
  };
}
