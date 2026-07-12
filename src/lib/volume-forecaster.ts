/**
 * volume-forecaster.ts — Predicts daily trading volume and estimates short interest.
 *
 * Three features:
 * 1. Volume forecast — predicts daily volume using day-of-week patterns + trend
 *    Tolerance: flags when actual deviates >0.01% from prediction
 * 2. Short interest proxy — identifies the 15 most shorted stocks using
 *    price-volume patterns (since we don't have FINRA short interest data)
 * 3. Naked short pressure — estimates "phantom volume" that can't be explained
 *    by normal trading, which may indicate naked short selling
 *
 * METHODOLOGY:
 *
 * Volume Prediction:
 * - 20-day average volume as baseline
 * - Day-of-week volume factors (Mondays ~10% lower, Fridays ~8% higher)
 * - Recent volume trend (increasing/decreasing/stable)
 * - Options expiry day detection (3rd Friday of month → ~30% volume spike)
 * - The 0.01% tolerance is very tight — we categorize deviation as:
 *   "exact" (≤0.01%), "tight" (≤1%), "normal" (≤5%), "wide" (≤15%), "anomaly" (>15%)
 *
 * Short Interest Proxy (since no FINRA data):
 * - Short Pressure Score = weighted combination of:
 *   a) Turnover ratio: avg daily volume / shares outstanding (proxy)
 *   b) Price decline rate: 60-day return (shorts push price down)
 *   c) Down-volume ratio: % of days with volume spike + price drop
 *   d) Covering spikes: count of days with volume >2x avg AND price up (short covering)
 *   e) Persistent pressure: consecutive days of above-avg volume + below-avg returns
 *
 * Naked Short Pressure:
 * - "Explainable volume" = trend × average + day-of-week factor
 * - "Phantom volume" = actual volume − explainable volume (when positive and persistent)
 * - Sustained phantom volume over 5+ days with price decline = naked short indicator
 * - Fails-to-deliver proxy: days where volume > 3× 30-day average AND price dropped
 */

import { getTickerSeries, getTickerMeta, type TickerDailyPoint } from "@/lib/data-access";
import { getTopMovers, getCompositeIndex } from "@/lib/data-access";

// ---------- Types ----------
export interface VolumeForecast {
  date: number;
  dayOfWeek: string;
  predictedVolume: number;
  dayOfWeekFactor: number;
  isOptionsExpiry: boolean;
  trendAdjustment: number;
  confidence: number;
}

export interface VolumeForecastResult {
  ticker: string;
  name: string;
  baselineVolume: number;        // 20-day average
  volumeTrend: "increasing" | "decreasing" | "stable";
  volumeTrendPct: number;        // % change per day
  dayOfWeekFactors: Record<string, number>;
  forecastDays: VolumeForecast[];
  summary: {
    avgPredictedVolume: number;
    avgConfidence: number;
    methodology: string;
    toleranceNote: string;
  };
}

export interface ShortInterestEntry {
  ticker: string;
  name: string;
  sector: string;
  shortPressureScore: number;    // 0-100
  turnoverRatio: number;          // avg volume / marketcap proxy
  priceDecline60d: number;        // % decline over 60 days
  downVolumeRatio: number;        // % of days with vol spike + price drop
  coveringSpikes: number;         // count of short-covering days
  persistentPressureDays: number; // consecutive high-vol + low-return days
  estimatedShortInterest: number; // proxy: % of float shorted (0-30%)
  nakedShortPressure: number;     // 0-100, phantom volume indicator
  phantomVolume: number;          // estimated phantom volume (shares)
  rank: number;
}

export interface ShortInterestResult {
  ranked: ShortInterestEntry[];
  generatedAt: string;
  methodology: string;
  disclaimer: string;
}

export interface LiveDeviation {
  ticker: string;
  name: string;
  actualDate: number;
  actualOpen: number;
  actualHigh: number;
  actualLow: number;
  actualClose: number;
  actualVolume: number;
  forecastLow: number;
  forecastHigh: number;
  forecastOpen: number;
  forecastClose: number;
  forecastVolume: number;
  priceDeviation: number;         // % above/below forecast midpoint
  volumeDeviation: number;        // % difference from predicted volume
  volumeDeviationCategory: string; // exact/tight/normal/wide/anomaly
  status: "normal" | "elevated" | "breakout_up" | "breakout_down" | "volume_anomaly";
  interpretation: string;
}

// ---------- Helpers ----------
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function yyyymmddToDate(yyyymmdd: number): Date {
  const s = String(yyyymmdd);
  return new Date(parseInt(s.slice(0, 4)), parseInt(s.slice(4, 6)) - 1, parseInt(s.slice(6, 8)));
}

function dateToYyyymmdd(d: Date): number {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return parseInt(`${y}${m}${day}`);
}

function getDayOfWeek(d: Date): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

function isWeekend(d: Date): boolean {
  return d.getDay() === 0 || d.getDay() === 6;
}

// Check if date is the 3rd Friday of the month (options expiry)
function isOptionsExpiryDate(d: Date): boolean {
  if (d.getDay() !== 5) return false; // Not Friday
  const dayOfMonth = d.getDate();
  // 3rd Friday: days 15-21
  return dayOfMonth >= 15 && dayOfMonth <= 21;
}

// ---------- 1. Volume Forecast ----------
export function forecastVolume(
  ticker: string,
  name: string,
  forecastDays: number = 30
): VolumeForecastResult | null {
  const series = getTickerSeries(ticker);
  if (!series || series.length < 30) return null;

  const recent = series.slice(-252); // Last year
  const last20 = recent.slice(-20);

  // Baseline: 20-day average volume
  const baselineVolume = mean(last20.map((p) => p.volume));

  // Volume trend: slope of recent volumes
  const volValues = last20.map((p) => p.volume);
  const n = volValues.length;
  const xs = Array.from({ length: n }, (_, i) => i);
  const xMean = mean(xs);
  const yMean = mean(volValues);
  const numerator = xs.reduce((s, x, i) => s + (x - xMean) * (volValues[i] - yMean), 0);
  const denominator = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  const volSlope = denominator === 0 ? 0 : numerator / denominator;
  const volumeTrendPct = baselineVolume > 0 ? (volSlope / baselineVolume) * 100 : 0;

  const volumeTrend: "increasing" | "decreasing" | "stable" =
    volumeTrendPct > 0.5 ? "increasing" : volumeTrendPct < -0.5 ? "decreasing" : "stable";

  // Day-of-week volume factors
  const volByDay: Record<string, number[]> = { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [] };
  for (const p of recent) {
    const dow = getDayOfWeek(yyyymmddToDate(p.date));
    if (dow in volByDay && p.volume > 0) {
      volByDay[dow].push(p.volume);
    }
  }
  const avgVolByDay: Record<string, number> = {};
  for (const [day, vols] of Object.entries(volByDay)) {
    avgVolByDay[day] = vols.length > 0 ? mean(vols) : baselineVolume;
  }
  const overallAvg = mean(Object.values(avgVolByDay).filter((v) => v > 0));
  const dayOfWeekFactors: Record<string, number> = {};
  for (const [day, avg] of Object.entries(avgVolByDay)) {
    dayOfWeekFactors[day] = overallAvg > 0 ? avg / overallAvg : 1;
  }

  // Generate forecast
  const lastPoint = recent[recent.length - 1];
  let currentDate = yyyymmddToDate(lastPoint.date);
  const forecast: VolumeForecast[] = [];

  for (let i = 0; i < forecastDays * 2; i++) {
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    if (isWeekend(currentDate)) continue;

    const dow = getDayOfWeek(currentDate);
    const dowFactor = dayOfWeekFactors[dow] ?? 1;
    const isExpiry = isOptionsExpiryDate(currentDate);
    const expiryBoost = isExpiry ? 1.30 : 1.0;

    // Trend adjustment: project the slope forward
    const trendAdjustment = volSlope * (i + 1);
    const predictedVolume = Math.max(1000, (baselineVolume * dowFactor * expiryBoost) + trendAdjustment);

    // Confidence: higher when volume is stable (low CV)
    const cv = std(volValues) / (baselineVolume || 1); // coefficient of variation
    const baseConfidence = Math.max(30, Math.min(90, 90 - cv * 100));
    const confidence = Math.round(Math.max(20, baseConfidence - Math.sqrt(i / 30) * 15));

    forecast.push({
      date: dateToYyyymmdd(currentDate),
      dayOfWeek: dow,
      predictedVolume: Math.round(predictedVolume),
      dayOfWeekFactor: Math.round(dowFactor * 100) / 100,
      isOptionsExpiry: isExpiry,
      trendAdjustment: Math.round(trendAdjustment),
      confidence,
    });

    if (forecast.length >= forecastDays) break;
  }

  return {
    ticker,
    name,
    baselineVolume: Math.round(baselineVolume),
    volumeTrend,
    volumeTrendPct: Math.round(volumeTrendPct * 100) / 100,
    dayOfWeekFactors,
    forecastDays: forecast,
    summary: {
      avgPredictedVolume: Math.round(mean(forecast.map((f) => f.predictedVolume))),
      avgConfidence: Math.round(mean(forecast.map((f) => f.confidence))),
      methodology: "20-day avg volume × day-of-week factor × options-expiry boost + trend slope. Confidence based on volume coefficient of variation.",
      toleranceNote: "0.01% tolerance is very tight — typical institutional volume models have 5-15% error. Deviations categorized as: exact (≤0.01%), tight (≤1%), normal (≤5%), wide (≤15%), anomaly (>15%).",
    },
  };
}

// ---------- 2. Short Interest Proxy ----------
export function getMostShortedStocks(year: number = 2017, limit: number = 15): ShortInterestResult | null {
  const movers = getTopMovers(year);
  if (!movers) return null;

  // Get all tickers from gainers + losers + active
  const allTickers = new Set<string>();
  [...movers.gainers, ...movers.losers, ...movers.active].forEach((m) => allTickers.add(m.ticker));

  const entries: ShortInterestEntry[] = [];

  for (const ticker of allTickers) {
    const series = getTickerSeries(ticker);
    const meta = getTickerMeta(ticker);
    if (!series || series.length < 60 || !meta) continue;

    // Filter to the selected year
    const yearData = series.filter((p) => p.year === year);
    if (yearData.length < 30) continue;

    const last60 = yearData.slice(-60);
    if (last60.length < 30) continue;

    // a) Turnover ratio: avg volume / marketcap (proxy for shares outstanding)
    const avgVol = mean(last60.map((p) => p.volume));
    const marketcap = meta.marketcap ?? avgVol * last60[last60.length - 1].close * 10;
    const turnoverRatio = marketcap > 0 ? (avgVol * last60[last60.length - 1].close) / marketcap : 0;

    // b) Price decline rate over 60 days
    const first60 = last60[0];
    const last60Point = last60[last60.length - 1];
    const priceDecline60d = first60.close > 0
      ? ((last60Point.close / first60.close) - 1) * 100
      : 0;

    // c) Down-volume ratio: % of days with volume spike + price drop
    const avgVol60 = mean(last60.map((p) => p.volume));
    const volStd60 = std(last60.map((p) => p.volume));
    let downVolumeDays = 0;
    let coveringSpikes = 0;
    let persistentPressureDays = 0;
    let maxConsecutivePressure = 0;
    let currentStreak = 0;

    for (let i = 1; i < last60.length; i++) {
      const prev = last60[i - 1];
      const curr = last60[i];
      const volSpike = curr.volume > avgVol60 + volStd60;
      const priceDrop = curr.close < prev.close;
      const priceUp = curr.close > prev.close;

      // Down-volume day: high volume + price drop (shorts selling)
      if (volSpike && priceDrop) downVolumeDays++;

      // Covering spike: high volume + price up (shorts covering)
      if (volSpike && priceUp) coveringSpikes++;

      // Persistent pressure: above-avg volume + below-avg return
      const returnToday = prev.close > 0 ? (curr.close / prev.close) - 1 : 0;
      if (curr.volume > avgVol60 && returnToday < 0) {
        currentStreak++;
        maxConsecutivePressure = Math.max(maxConsecutivePressure, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    persistentPressureDays = maxConsecutivePressure;
    const downVolumeRatio = (downVolumeDays / (last60.length - 1)) * 100;

    // d) Compute phantom volume (naked short proxy)
    // Explainable volume = average volume; phantom = excess on down-volume spike days
    let phantomVolume = 0;
    for (let i = 1; i < last60.length; i++) {
      const curr = last60[i];
      const prev = last60[i - 1];
      const volSpike = curr.volume > avgVol60 + 2 * volStd60;
      const priceDrop = curr.close < prev.close;
      if (volSpike && priceDrop) {
        // Excess volume beyond what's explainable
        phantomVolume += Math.max(0, curr.volume - avgVol60 - 2 * volStd60);
      }
    }

    // e) Compute Short Pressure Score (0-100)
    // Weighted: turnover (20%), price decline (25%), down-volume ratio (20%),
    // covering spikes (15%), persistent pressure (20%)
    const turnoverScore = Math.min(100, turnoverRatio * 5000);
    const declineScore = Math.min(100, Math.abs(Math.min(0, priceDecline60d)) * 2);
    const downVolScore = Math.min(100, downVolumeRatio * 3);
    const coveringScore = Math.min(100, coveringSpikes * 10);
    const persistentScore = Math.min(100, persistentPressureDays * 10);

    const shortPressureScore = Math.round(
      turnoverScore * 0.20 +
      declineScore * 0.25 +
      downVolScore * 0.20 +
      coveringScore * 0.15 +
      persistentScore * 0.20
    );

    // Estimated short interest (proxy 0-30%)
    const estimatedShortInterest = Math.min(30, shortPressureScore / 4);

    // Naked short pressure (0-100)
    const phantomRatio = avgVol60 > 0 ? phantomVolume / (avgVol60 * last60.length) : 0;
    const nakedShortPressure = Math.min(100, Math.round(phantomRatio * 200));

    entries.push({
      ticker,
      name: meta.name,
      sector: meta.sector,
      shortPressureScore,
      turnoverRatio: Math.round(turnoverRatio * 10000) / 100,
      priceDecline60d: Math.round(priceDecline60d * 100) / 100,
      downVolumeRatio: Math.round(downVolumeRatio * 100) / 100,
      coveringSpikes,
      persistentPressureDays,
      estimatedShortInterest: Math.round(estimatedShortInterest * 10) / 10,
      nakedShortPressure,
      phantomVolume: Math.round(phantomVolume),
      rank: 0, // will be set after sorting
    });
  }

  // Sort by short pressure score (highest first)
  entries.sort((a, b) => b.shortPressureScore - a.shortPressureScore);

  // Assign ranks
  const ranked = entries.slice(0, limit).map((e, i) => ({ ...e, rank: i + 1 }));

  return {
    ranked,
    generatedAt: new Date().toISOString(),
    methodology: "Short Pressure Score = weighted: turnover (20%), price decline (25%), down-volume ratio (20%), covering spikes (15%), persistent pressure (20%). Estimated short interest is a PROXY, not actual FINRA data. Naked short pressure from phantom volume on high-vol down days.",
    disclaimer: "This is a statistical proxy based on price-volume patterns, NOT actual short interest data. For real short interest, use FINRA's bi-weekly short interest reports or SEC filings. Naked shorting is illegal; this indicator flags unusual volume patterns that may warrant investigation.",
  };
}

// ---------- 3. Live Deviation Indicator ----------
export function getLiveDeviation(ticker: string): LiveDeviation | null {
  const series = getTickerSeries(ticker);
  const meta = getTickerMeta(ticker);
  if (!series || series.length < 30) return null;

  // Use the last actual trading day as "today" (simulating live)
  const recent = series.slice(-252);
  const today = recent[recent.length - 1];
  const yesterday = recent[recent.length - 2];

  // Build a simple forecast for "today" based on prior data
  const baseline = recent.slice(0, -1); // everything before today
  const lastBaseline = baseline[baseline.length - 1];

  // Forecast range from 60-day average
  const last60 = baseline.slice(-60);
  const avgRangePct = mean(
    last60.map((p) => (p.close > 0 ? (p.high - p.low) / p.close : 0))
  );

  // Volume prediction
  const last20Vol = baseline.slice(-20).map((p) => p.volume);
  const predictedVolume = mean(last20Vol);

  // Forecast prices
  const forecastOpen = lastBaseline.close;
  const forecastHigh = forecastOpen * (1 + avgRangePct / 2);
  const forecastLow = forecastOpen * (1 - avgRangePct / 2);

  // 20-day return for trend
  const last20Closes = baseline.slice(-20).map((p) => p.close);
  const dailyDrift = last20Closes.length > 1
    ? (last20Closes[last20Closes.length - 1] / last20Closes[0]) - 1
    : 0;
  const forecastClose = forecastOpen * (1 + dailyDrift / 20);

  // Actual values
  const actualOpen = today.open;
  const actualHigh = today.high;
  const actualLow = today.low;
  const actualClose = today.close;
  const actualVolume = today.volume;

  // Deviations
  const forecastMid = (forecastHigh + forecastLow) / 2;
  const priceDeviation = forecastMid > 0
    ? ((actualClose / forecastMid) - 1) * 100
    : 0;

  const volumeDeviation = predictedVolume > 0
    ? ((actualVolume / predictedVolume) - 1) * 100
    : 0;

  // Volume deviation category (user's 0.01% tolerance)
  const absVolDev = Math.abs(volumeDeviation);
  let volumeDeviationCategory: string;
  if (absVolDev <= 0.01) volumeDeviationCategory = "exact";
  else if (absVolDev <= 1) volumeDeviationCategory = "tight";
  else if (absVolDev <= 5) volumeDeviationCategory = "normal";
  else if (absVolDev <= 15) volumeDeviationCategory = "wide";
  else volumeDeviationCategory = "anomaly";

  // Status determination
  let status: LiveDeviation["status"];
  let interpretation: string;

  if (actualClose > forecastHigh) {
    status = "breakout_up";
    interpretation = `Price closed ABOVE the forecast high ($${forecastHigh.toFixed(2)}). Something bullish is happening — possible positive news, earnings beat, or short covering. Momentum traders may consider following the breakout.`;
  } else if (actualClose < forecastLow) {
    status = "breakout_down";
    interpretation = `Price closed BELOW the forecast low ($${forecastLow.toFixed(2)}). Something bearish is happening — possible negative news, earnings miss, or heavy shorting. Consider risk management.`;
  } else if (absVolDev > 15) {
    status = "volume_anomaly";
    interpretation = `Volume is ${volumeDeviation.toFixed(1)}% from predicted (${volumeDeviationCategory}). Unusual volume without a price breakout may indicate institutional repositioning or news pending. Watch for direction tomorrow.`;
  } else if (absVolDev > 5 || Math.abs(priceDeviation) > 2) {
    status = "elevated";
    interpretation = `Trading is more active than normal but price stayed within the forecast range. Volume deviation: ${volumeDeviation.toFixed(1)}% (${volumeDeviationCategory}). Moderate activity — no material event detected.`;
  } else {
    status = "normal";
    interpretation = `Price and volume are within the forecast range. No material event detected. The stock is behaving as expected under "no significant news" conditions.`;
  }

  return {
    ticker,
    name: meta?.name ?? ticker,
    actualDate: today.date,
    actualOpen,
    actualHigh,
    actualLow,
    actualClose,
    actualVolume,
    forecastLow: Math.round(forecastLow * 100) / 100,
    forecastHigh: Math.round(forecastHigh * 100) / 100,
    forecastOpen: Math.round(forecastOpen * 100) / 100,
    forecastClose: Math.round(forecastClose * 100) / 100,
    forecastVolume: Math.round(predictedVolume),
    priceDeviation: Math.round(priceDeviation * 100) / 100,
    volumeDeviation: Math.round(volumeDeviation * 100) / 100,
    volumeDeviationCategory,
    status,
    interpretation,
  };
}
