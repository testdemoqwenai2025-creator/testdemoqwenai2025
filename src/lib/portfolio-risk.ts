/**
 * portfolio-risk.ts — Portfolio risk analytics engine.
 *
 * Computes professional risk metrics for a portfolio of stocks:
 * - Value at Risk (VaR) — 1-day and 10-day, 95% and 99% confidence
 * - Expected Shortfall (CVaR) — average loss beyond VaR
 * - Sharpe ratio — risk-adjusted return
 * - Sortino ratio — downside-deviation-adjusted return
 * - Maximum drawdown — worst peak-to-trough decline
 * - Beta — sensitivity to market index
 * - Correlation matrix — how stocks move together
 * - Volatility — annualized
 *
 * These are the same metrics used by institutional risk managers.
 */

import { getTickerSeries, getCompositeIndex, type TickerDailyPoint } from "@/lib/data-access";

export interface PortfolioMetrics {
  tickers: string[];
  weights: number[];
  period: { start: number; end: number };
  returns: {
    daily: number;
    annualized: number;
    cumulative: number;
  };
  volatility: {
    daily: number;
    annualized: number;
  };
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  var: {
    var95_1day: number;
    var99_1day: number;
    var95_10day: number;
    var99_10day: number;
  };
  expectedShortfall: {
    es95: number;
    es99: number;
  };
  beta: number;
  correlationMatrix: {
    tickers: string[];
    matrix: number[][];
  };
  interpretation: {
    riskLevel: "low" | "moderate" | "high" | "extreme";
    riskAdjustedReturn: "poor" | "adequate" | "good" | "excellent";
    diversification: "poor" | "moderate" | "good" | "excellent";
    summary: string;
  };
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

export function analyzePortfolio(
  holdings: { ticker: string; weight: number }[],
  year: number = 2017
): PortfolioMetrics | null {
  if (holdings.length === 0) return null;

  // Normalize weights to sum to 1
  const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
  if (totalWeight === 0) return null;
  const weights = holdings.map((h) => h.weight / totalWeight);
  const tickers = holdings.map((h) => h.ticker.toUpperCase());

  // Load daily series for each ticker, filtered to the selected year
  const seriesMap: Record<string, TickerDailyPoint[]> = {};
  for (const ticker of tickers) {
    const series = getTickerSeries(ticker);
    if (!series || series.length === 0) return null;
    seriesMap[ticker] = series.filter((p) => p.year === year);
    if (seriesMap[ticker].length < 30) return null;
  }

  // Align all series to the same dates (use the shortest)
  const allDates = new Set<string>();
  for (const ticker of tickers) {
    for (const p of seriesMap[ticker]) {
      allDates.add(String(p.date));
    }
  }
  const sortedDates = Array.from(allDates).sort();

  // Build aligned close-price matrix
  const closeMatrix: Record<string, number[]> = {};
  for (const ticker of tickers) {
    closeMatrix[ticker] = [];
    const tickerData = seriesMap[ticker];
    const dateMap = new Map(tickerData.map((p) => [String(p.date), p.close]));
    for (const date of sortedDates) {
      const close = dateMap.get(date);
      if (close != null) {
        closeMatrix[ticker].push(close);
      } else {
        // Use previous close if missing
        const prev = closeMatrix[ticker][closeMatrix[ticker].length - 1];
        closeMatrix[ticker].push(prev ?? 0);
      }
    }
  }

  // Compute daily returns for each ticker
  const returnsMatrix: Record<string, number[]> = {};
  for (const ticker of tickers) {
    returnsMatrix[ticker] = [];
    const closes = closeMatrix[ticker];
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] > 0) {
        returnsMatrix[ticker].push((closes[i] / closes[i - 1]) - 1);
      }
    }
  }

  // Compute portfolio daily returns (weighted sum)
  const nDays = returnsMatrix[tickers[0]].length;
  const portfolioReturns: number[] = [];
  for (let i = 0; i < nDays; i++) {
    let dailyReturn = 0;
    for (let j = 0; j < tickers.length; j++) {
      dailyReturn += weights[j] * returnsMatrix[tickers[j]][i];
    }
    portfolioReturns.push(dailyReturn);
  }

  // Portfolio metrics
  const dailyReturn = mean(portfolioReturns);
  const annualReturn = dailyReturn * 252;
  const dailyVol = std(portfolioReturns);
  const annualVol = dailyVol * Math.sqrt(252);

  // Cumulative return
  const cumulativeReturn = portfolioReturns.reduce((s, r) => s * (1 + r), 1) - 1;

  // Sharpe ratio (assuming 2% risk-free rate)
  const riskFreeRate = 0.02;
  const sharpeRatio = annualVol > 0 ? (annualReturn - riskFreeRate) / annualVol : 0;

  // Sortino ratio (downside deviation only)
  const downsideReturns = portfolioReturns.filter((r) => r < 0);
  const downsideDev = downsideReturns.length > 0 ? std(downsideReturns) : 0;
  const annualDownsideDev = downsideDev * Math.sqrt(252);
  const sortinoRatio = annualDownsideDev > 0 ? (annualReturn - riskFreeRate) / annualDownsideDev : 0;

  // Maximum drawdown
  let peak = 1;
  let maxDrawdown = 0;
  let maxDrawdownDuration = 0;
  let currentDuration = 0;
  let cumulative = 1;
  for (const r of portfolioReturns) {
    cumulative *= (1 + r);
    if (cumulative > peak) {
      peak = cumulative;
      currentDuration = 0;
    } else {
      currentDuration++;
      const drawdown = (cumulative - peak) / peak;
      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownDuration = currentDuration;
      }
    }
  }
  maxDrawdown = maxDrawdown * 100;

  // Value at Risk (historical method)
  const var95_1day = Math.abs(percentile(portfolioReturns, 5)) * 100;
  const var99_1day = Math.abs(percentile(portfolioReturns, 1)) * 100;
  const var95_10day = var95_1day * Math.sqrt(10);
  const var99_10day = var99_1day * Math.sqrt(10);

  // Expected Shortfall (average of worst 5% / 1%)
  const sortedReturns = [...portfolioReturns].sort((a, b) => a - b);
  const worst5pct = sortedReturns.slice(0, Math.floor(sortedReturns.length * 0.05));
  const worst1pct = sortedReturns.slice(0, Math.floor(sortedReturns.length * 0.01));
  const es95 = Math.abs(mean(worst5pct)) * 100;
  const es99 = Math.abs(mean(worst1pct)) * 100;

  // Beta (vs composite index)
  const composite = getCompositeIndex(year);
  let beta = 1;
  if (composite && composite.length > 1) {
    const indexReturns: number[] = [];
    for (let i = 1; i < composite.length; i++) {
      if (composite[i - 1].avg_close > 0) {
        indexReturns.push((composite[i].avg_close / composite[i - 1].avg_close) - 1);
      }
    }
    // Align lengths
    const minLen = Math.min(portfolioReturns.length, indexReturns.length);
    const portSlice = portfolioReturns.slice(-minLen);
    const indexSlice = indexReturns.slice(-minLen);
    const indexVol = std(indexSlice);
    if (indexVol > 0) {
      const cov = mean(portSlice.map((r, i) => (r - mean(portSlice)) * (indexSlice[i] - mean(indexSlice))));
      beta = cov / (indexVol * indexVol);
    }
  }

  // Correlation matrix
  const corrMatrix: number[][] = [];
  for (let i = 0; i < tickers.length; i++) {
    corrMatrix.push([]);
    for (let j = 0; j < tickers.length; j++) {
      if (i === j) {
        corrMatrix[i].push(1);
      } else {
        const returns1 = returnsMatrix[tickers[i]];
        const returns2 = returnsMatrix[tickers[j]];
        const minLen = Math.min(returns1.length, returns2.length);
        const r1 = returns1.slice(-minLen);
        const r2 = returns2.slice(-minLen);
        const m1 = mean(r1);
        const m2 = mean(r2);
        const cov = mean(r1.map((v, k) => (v - m1) * (r2[k] - m2)));
        const s1 = std(r1);
        const s2 = std(r2);
        corrMatrix[i].push(s1 > 0 && s2 > 0 ? Math.round((cov / (s1 * s2)) * 100) / 100 : 0);
      }
    }
  }

  // Interpretation
  let riskLevel: "low" | "moderate" | "high" | "extreme";
  if (annualVol < 0.15) riskLevel = "low";
  else if (annualVol < 0.30) riskLevel = "moderate";
  else if (annualVol < 0.50) riskLevel = "high";
  else riskLevel = "extreme";

  let riskAdjustedReturn: "poor" | "adequate" | "good" | "excellent";
  if (sharpeRatio < 0.5) riskAdjustedReturn = "poor";
  else if (sharpeRatio < 1.0) riskAdjustedReturn = "adequate";
  else if (sharpeRatio < 2.0) riskAdjustedReturn = "good";
  else riskAdjustedReturn = "excellent";

  // Diversification: average off-diagonal correlation
  let avgCorr = 0;
  let count = 0;
  for (let i = 0; i < tickers.length; i++) {
    for (let j = 0; j < tickers.length; j++) {
      if (i !== j) {
        avgCorr += corrMatrix[i][j];
        count++;
      }
    }
  }
  avgCorr = count > 0 ? avgCorr / count : 0;

  let diversification: "poor" | "moderate" | "good" | "excellent";
  if (avgCorr > 0.7) diversification = "poor";
  else if (avgCorr > 0.4) diversification = "moderate";
  else if (avgCorr > 0.2) diversification = "good";
  else diversification = "excellent";

  const summary = `Portfolio has ${riskLevel} volatility (${(annualVol * 100).toFixed(1)}% annualized) with ${riskAdjustedReturn} risk-adjusted returns (Sharpe ${sharpeRatio.toFixed(2)}). Maximum drawdown was ${maxDrawdown.toFixed(1)}%. Diversification is ${diversification} (avg correlation ${avgCorr.toFixed(2)}). 1-day 95% VaR is ${var95_1day.toFixed(2)}%.`;

  return {
    tickers,
    weights: weights.map((w) => Math.round(w * 10000) / 100),
    period: {
      start: parseInt(sortedDates[0] ?? "0"),
      end: parseInt(sortedDates[sortedDates.length - 1] ?? "0"),
    },
    returns: {
      daily: Math.round(dailyReturn * 10000) / 100,
      annualized: Math.round(annualReturn * 10000) / 100,
      cumulative: Math.round(cumulativeReturn * 10000) / 100,
    },
    volatility: {
      daily: Math.round(dailyVol * 10000) / 100,
      annualized: Math.round(annualVol * 10000) / 100,
    },
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    maxDrawdownDuration,
    var: {
      var95_1day: Math.round(var95_1day * 100) / 100,
      var99_1day: Math.round(var99_1day * 100) / 100,
      var95_10day: Math.round(var95_10day * 100) / 100,
      var99_10day: Math.round(var99_10day * 100) / 100,
    },
    expectedShortfall: {
      es95: Math.round(es95 * 100) / 100,
      es99: Math.round(es99 * 100) / 100,
    },
    beta: Math.round(beta * 100) / 100,
    correlationMatrix: {
      tickers,
      matrix: corrMatrix,
    },
    interpretation: {
      riskLevel,
      riskAdjustedReturn,
      diversification,
      summary,
    },
  };
}
