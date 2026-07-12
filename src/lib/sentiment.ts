/**
 * sentiment.ts — Market sentiment analyzer (Fear & Greed from price patterns).
 *
 * Computes a composite sentiment score (0-100) from multiple price-based indicators:
 *
 * 1. Market Momentum — current index vs 125-day moving average
 * 2. Market Volatility — 20-day volatility vs long-term average
 * 3. Breadth — advancing vs declining issues
 * 4. Volume Sentiment — up-volume vs down-volume ratio
 * 5. Safe Haven Demand — how much money is flowing to defensive sectors
 * 6. Junk Bond Demand — proxy from low-priced stock activity
 * 7. Price Trend — recent price direction strength
 *
 * Final score: 0-25 Extreme Fear, 25-45 Fear, 45-55 Neutral, 55-75 Greed, 75-100 Extreme Greed
 */

import { getCompositeIndex, getSectorHeatmap, getTopMovers } from "@/lib/data-access";

export interface SentimentIndicator {
  name: string;
  score: number;        // 0-100 (0=fear, 100=greed)
  value: string;        // human-readable value
  interpretation: string;
  weight: number;       // how much it contributes to the composite
}

export interface SentimentResult {
  score: number;        // 0-100 composite
  label: string;        // Extreme Fear / Fear / Neutral / Greed / Extreme Greed
  color: string;
  year: number;
  indicators: SentimentIndicator[];
  summary: string;
  recommendation: string;
  historicalComparison?: {
    previousYearScore: number;
    change: number;
    trend: string;
  };
}

function scoreToLabel(score: number): { label: string; color: string } {
  if (score < 25) return { label: "Extreme Fear", color: "text-down" };
  if (score < 45) return { label: "Fear", color: "text-amber-400" };
  if (score < 55) return { label: "Neutral", color: "text-muted-foreground" };
  if (score < 75) return { label: "Greed", color: "text-primary" };
  return { label: "Extreme Greed", color: "text-up" };
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function computeSentiment(year: number): SentimentResult | null {
  const composite = getCompositeIndex(year);
  if (!composite || composite.length < 30) return null;

  const indicators: SentimentIndicator[] = [];

  // ---------- 1. Market Momentum ----------
  // Compare current index to 125-day SMA (~6 months)
  const closes = composite.map((p) => p.avg_close);
  if (closes.length >= 125) {
    const last125 = closes.slice(-125);
    const sma125 = last125.reduce((s, v) => s + v, 0) / 125;
    const current = closes[closes.length - 1];
    const momentumPct = ((current / sma125) - 1) * 100;
    // Map: -10% → 0 (extreme fear), 0% → 50, +10% → 100 (extreme greed)
    const score = clampScore(50 + momentumPct * 5);
    indicators.push({
      name: "Market Momentum",
      score,
      value: `${current.toFixed(2)} vs 125-day SMA ${sma125.toFixed(2)} (${momentumPct >= 0 ? "+" : ""}${momentumPct.toFixed(1)}%)`,
      interpretation: momentumPct > 5 ? "Strong upward momentum" : momentumPct < -5 ? "Strong downward momentum" : "Neutral momentum",
      weight: 0.20,
    });
  }

  // ---------- 2. Market Volatility ----------
  // 20-day volatility vs 60-day average
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  const last20Returns = returns.slice(-20);
  const last60Returns = returns.slice(-60);
  const vol20 = Math.sqrt(last20Returns.reduce((s, r) => s + r * r, 0) / 20) * Math.sqrt(252);
  const vol60 = Math.sqrt(last60Returns.reduce((s, r) => s + r * r, 0) / 60) * Math.sqrt(252);
  const volRatio = vol60 > 0 ? vol20 / vol60 : 1;
  // High volatility = fear, low = greed
  // Ratio 1.5 → 20 (fear), 1.0 → 50, 0.5 → 80 (greed)
  const volScore = clampScore(50 + (1 - volRatio) * 60);
  indicators.push({
    name: "Market Volatility",
    score: volScore,
    value: `20d vol ${(vol20 * 100).toFixed(1)}% vs 60d vol ${(vol60 * 100).toFixed(1)}% (ratio ${volRatio.toFixed(2)})`,
    interpretation: volRatio > 1.3 ? "Volatility spiking — fear increasing" : volRatio < 0.8 ? "Volatility declining — calm market" : "Normal volatility",
    weight: 0.15,
  });

  // ---------- 3. Market Breadth ----------
  // Advancing vs declining issues
  const advancing = composite.reduce((s, p) => s + p.advancing, 0);
  const declining = composite.reduce((s, p) => s + p.declining, 0);
  const breadthRatio = advancing + declining > 0 ? advancing / (advancing + declining) : 0.5;
  const breadthScore = clampScore(breadthRatio * 100);
  indicators.push({
    name: "Market Breadth",
    score: breadthScore,
    value: `${advancing.toLocaleString()} advancing vs ${declining.toLocaleString()} declining (${(breadthRatio * 100).toFixed(1)}%)`,
    interpretation: breadthRatio > 0.55 ? "Broad participation in rallies" : breadthRatio < 0.45 ? "Broad selling pressure" : "Mixed breadth",
    weight: 0.15,
  });

  // ---------- 4. Price Trend Strength ----------
  // Last 20 days return
  const last20Closes = closes.slice(-20);
  if (last20Closes.length >= 2) {
    const trendReturn = ((last20Closes[last20Closes.length - 1] / last20Closes[0]) - 1) * 100;
    const trendScore = clampScore(50 + trendReturn * 5);
    indicators.push({
      name: "Price Trend (20d)",
      score: trendScore,
      value: `${trendReturn >= 0 ? "+" : ""}${trendReturn.toFixed(1)}% over 20 days`,
      interpretation: trendReturn > 5 ? "Strong uptrend" : trendReturn < -5 ? "Strong downtrend" : "Sideways trend",
      weight: 0.20,
    });
  }

  // ---------- 5. Safe Haven Demand ----------
  // Compare defensive sectors (Utilities, Health Care) vs cyclical (Finance, Technology)
  const heatmap = getSectorHeatmap();
  if (heatmap) {
    const yearCells = heatmap.cells.filter((c) => c.year === year);
    const defensive = yearCells
      .filter((c) => ["Public Utilities", "Health Care", "Consumer Non-Durables"].includes(c.sector))
      .reduce((s, c) => s + c.avg_monthly_volume, 0);
    const cyclical = yearCells
      .filter((c) => ["Finance", "Technology", "Capital Goods", "Consumer Durables"].includes(c.sector))
      .reduce((s, c) => s + c.avg_monthly_volume, 0);
    const ratio = cyclical > 0 ? defensive / cyclical : 0.5;
    // High ratio = money flowing to safe havens = fear
    // Ratio 0.3 → 70 (greed), 0.5 → 50, 0.8 → 20 (fear)
    const safeHavenScore = clampScore(50 + (0.5 - ratio) * 100);
    indicators.push({
      name: "Safe Haven Demand",
      score: safeHavenScore,
      value: `Defensive/Cyclical volume ratio: ${ratio.toFixed(2)}`,
      interpretation: ratio > 0.6 ? "Money flowing to safe havens — fear" : ratio < 0.35 ? "Risk-on — money in cyclicals" : "Balanced sector flows",
      weight: 0.15,
    });
  }

  // ---------- 6. Volume Anomaly Sentiment ----------
  // High volume on down days = fear, high volume on up days = greed
  const movers = getTopMovers(year);
  if (movers) {
    const upVol = movers.active.filter((m) => m.return_pct > 0).reduce((s, m) => s + m.total_volume, 0);
    const downVol = movers.active.filter((m) => m.return_pct < 0).reduce((s, m) => s + m.total_volume, 0);
    const upVolRatio = upVol + downVol > 0 ? upVol / (upVol + downVol) : 0.5;
    const volSentScore = clampScore(upVolRatio * 100);
    indicators.push({
      name: "Volume Sentiment",
      score: volSentScore,
      value: `${(upVol / 1e9).toFixed(1)}B up-volume vs ${(downVol / 1e9).toFixed(1)}B down-volume`,
      interpretation: upVolRatio > 0.6 ? "Volume concentrated in gainers" : upVolRatio < 0.4 ? "Volume concentrated in losers" : "Balanced volume",
      weight: 0.15,
    });
  }

  // ---------- Composite Score ----------
  const totalWeight = indicators.reduce((s, i) => s + i.weight, 0);
  const composite_score = indicators.reduce((s, i) => s + i.score * i.weight, 0) / totalWeight;
  const score = clampScore(composite_score);
  const { label, color } = scoreToLabel(score);

  // ---------- Recommendation ----------
  let recommendation: string;
  if (score < 25) {
    recommendation = "Extreme Fear — historically a buying opportunity for long-term investors. Markets oversold, consider accumulating quality stocks.";
  } else if (score < 45) {
    recommendation = "Fear in the market — cautious accumulation warranted. Look for oversold quality names. Avoid leveraged positions.";
  } else if (score < 55) {
    recommendation = "Neutral sentiment — maintain balanced positions. Wait for clearer directional signals before committing.";
  } else if (score < 75) {
    recommendation = "Greed emerging — trim extended positions. Consider taking partial profits on winners. Tighten stop-losses.";
  } else {
    recommendation = "Extreme Greed — market euphoric. Historically a selling opportunity. Reduce risk, raise cash, prepare for potential correction.";
  }

  const summary = `Market sentiment is ${label} (${score}/100). ${indicators.length} indicators contributing. ${recommendation}`;

  return {
    score,
    label,
    color,
    year,
    indicators,
    summary,
    recommendation,
  };
}
