/**
 * forecaster.ts — Statistical range forecasting engine.
 *
 * Generates a 12-month daily forecast for any ticker, showing the most likely
 * intraday trading range (low–high) for each upcoming trading day.
 *
 * METHODOLOGY (statistical baseline, NOT a price prediction):
 *
 * 1. Historical volatility — 20-day rolling σ of log returns
 * 2. Average daily range — 60-day mean of (high−low)/close
 * 3. Day-of-week seasonality — Mondays are statistically more volatile
 * 4. Trend projection — linear regression on recent 20 closes
 * 5. Outlier exclusion — drop days >3σ (significant-news days) so the
 *    baseline reflects NORMAL market conditions only
 *
 * IMPORTANT — "No Significant News" caveat:
 * This forecast explicitly assumes no material events (mergers, product
 * launches, geopolitical shocks, earnings surprises). It tells traders what
 * "normal" looks like. When actual price breaks outside the forecast range,
 * it signals that something material is happening — which is itself useful
 * information for a day trader.
 *
 * Data limitation: our NYSE dataset runs 1997–2017. The forecast extends
 * 12 months from the last available data point. When a real API is connected
 * via the market-data-adapter (Stage 6), the forecast extends from today.
 */

import { getTickerSeries, type TickerDailyPoint } from "@/lib/data-access";

// ---------- Types ----------
export interface DayForecast {
  date: number;           // yyyymmdd
  dayOfWeek: string;      // Mon, Tue, Wed, Thu, Fri
  expectedOpen: number;
  forecastLow: number;
  forecastHigh: number;
  expectedClose: number;
  rangePercent: number;   // (high-low)/open * 100
  confidence: number;     // 0-100
  trend: "up" | "down" | "flat";
  weekNumber: number;     // 1-52
}

export interface ForecastResult {
  ticker: string;
  name: string;
  startDate: number;
  endDate: number;
  forecastDays: DayForecast[];
  summary: {
    avgDailyRange: number;       // average expected range % over 12 months
    avgConfidence: number;       // 0-100
    trendDirection: "up" | "down" | "flat";
    trendStrength: number;       // annualized % drift
    volatilityRegime: "low" | "normal" | "high" | "extreme";
    baselinePrice: number;       // starting price for the forecast
    twelveMonthTarget: number;   // expected close 12 months out
    twelveMonthRange: { low: number; high: number }; // widest range over 12 months
    excludedOutliers: number;    // how many "news days" were filtered out
    methodology: string;
  };
  warnings: string[];
}

// ---------- Helpers ----------
function yyyymmddToDate(yyyymmdd: number): Date {
  const s = String(yyyymmdd);
  return new Date(
    parseInt(s.slice(0, 4)),
    parseInt(s.slice(4, 6)) - 1,
    parseInt(s.slice(6, 8))
  );
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
  const day = d.getDay();
  return day === 0 || day === 6;
}

// ---------- Statistical functions ----------
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };
  const xs = Array.from({ length: n }, (_, i) => i);
  const xMean = mean(xs);
  const yMean = mean(values);
  const numerator = xs.reduce((s, x, i) => s + (x - xMean) * (values[i] - yMean), 0);
  const denominator = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

// ---------- Outlier exclusion (remove "significant news" days) ----------
function filterOutliers(
  points: TickerDailyPoint[]
): { cleaned: TickerDailyPoint[]; excluded: number } {
  if (points.length < 10) return { cleaned: points, excluded: 0 };

  // Compute log returns
  const returns: number[] = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i - 1].close > 0 && points[i].close > 0) {
      returns.push(Math.log(points[i].close / points[i - 1].close));
    }
  }

  const mu = mean(returns);
  const sigma = std(returns);

  // If sigma is 0, no outliers to detect
  if (sigma === 0) return { cleaned: points, excluded: 0 };

  // Mark days where |return - mean| > 3σ as outliers (significant news days)
  const cleaned: TickerDailyPoint[] = [points[0]];
  let excluded = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i - 1].close > 0 && points[i].close > 0) {
      const r = Math.log(points[i].close / points[i - 1].close);
      if (Math.abs(r - mu) > 3 * sigma) {
        excluded++;
        continue; // skip this day — it was a "news day"
      }
    }
    cleaned.push(points[i]);
  }

  return { cleaned, excluded };
}

// ---------- Day-of-week seasonality ----------
function computeDayOfWeekFactors(points: TickerDailyPoint[]): Record<string, number> {
  const rangesByDay: Record<string, number[]> = {
    Mon: [], Tue: [], Wed: [], Thu: [], Fri: [],
  };

  for (const p of points) {
    const date = yyyymmddToDate(p.date);
    const dow = getDayOfWeek(date);
    if (dow in rangesByDay && p.close > 0) {
      const rangePct = (p.high - p.low) / p.close;
      rangesByDay[dow].push(rangePct);
    }
  }

  // Compute average range for each day, then normalize to a factor
  const avgRanges: Record<string, number> = {};
  for (const [day, ranges] of Object.entries(rangesByDay)) {
    avgRanges[day] = ranges.length > 0 ? mean(ranges) : 0;
  }

  const overallAvg = mean(Object.values(avgRanges).filter((v) => v > 0));
  if (overallAvg === 0) return { Mon: 1, Tue: 1, Wed: 1, Thu: 1, Fri: 1 };

  const factors: Record<string, number> = {};
  for (const [day, avg] of Object.entries(avgRanges)) {
    factors[day] = avg > 0 ? avg / overallAvg : 1;
  }
  return factors;
}

// ---------- Main forecast function ----------
export function forecastTicker(
  ticker: string,
  name: string,
  forecastMonths: number = 12
): ForecastResult | null {
  const series = getTickerSeries(ticker);
  if (!series || series.length < 60) {
    return null;
  }

  // Step 1: Filter out "significant news" days (outliers > 3σ)
  const { cleaned, excluded } = filterOutliers(series);

  // Use the last 252 trading days (1 year) for the baseline
  const baseline = cleaned.slice(-252);
  if (baseline.length < 20) {
    return null;
  }

  const lastPoint = baseline[baseline.length - 1];
  const baselinePrice = lastPoint.close;

  // Step 2: Compute historical volatility (20-day rolling σ of log returns)
  const recentReturns: number[] = [];
  for (let i = 1; i < baseline.length; i++) {
    if (baseline[i - 1].close > 0 && baseline[i].close > 0) {
      recentReturns.push(Math.log(baseline[i].close / baseline[i - 1].close));
    }
  }
  const recentReturnsForVol = recentReturns.slice(-20);
  const dailyVol = std(recentReturnsForVol);
  const annualVol = dailyVol * Math.sqrt(252);

  // Step 3: Average daily range (60-day mean of (high-low)/close)
  const recentRanges: number[] = [];
  for (const p of baseline.slice(-60)) {
    if (p.close > 0) {
      recentRanges.push((p.high - p.low) / p.close);
    }
  }
  const avgRangePct = mean(recentRanges);

  // Step 4: Day-of-week seasonality factors
  const dowFactors = computeDayOfWeekFactors(baseline);

  // Step 5: Trend projection using average daily log return (geometric, can't go negative)
  const allReturns: number[] = [];
  for (let i = 1; i < baseline.length; i++) {
    if (baseline[i - 1].close > 0 && baseline[i].close > 0) {
      allReturns.push(Math.log(baseline[i].close / baseline[i - 1].close));
    }
  }
  // Use the last 60 days for trend (more stable than 20)
  const trendReturns = allReturns.slice(-60);
  const dailyDrift = mean(trendReturns); // average daily log return
  const annualTrendPct = dailyDrift * 252 * 100;

  // Step 6: Volatility regime classification
  let volatilityRegime: "low" | "normal" | "high" | "extreme";
  if (annualVol < 0.15) volatilityRegime = "low";
  else if (annualVol < 0.30) volatilityRegime = "normal";
  else if (annualVol < 0.60) volatilityRegime = "high";
  else volatilityRegime = "extreme";

  // Step 7: Generate daily forecasts for ~252 trading days (12 months)
  const forecastDays: DayForecast[] = [];
  const tradingDaysNeeded = Math.round(252 * (forecastMonths / 12));

  let currentDate = yyyymmddToDate(lastPoint.date);
  let currentPrice = baselinePrice;
  let weekNumber = 1;
  let lastWeek = -1;

  for (let i = 0; i < tradingDaysNeeded * 2; i++) {
    // Skip to next day
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);

    // Skip weekends
    if (isWeekend(currentDate)) continue;

    const dow = getDayOfWeek(currentDate);
    const dowFactor = dowFactors[dow] ?? 1;

    // Expected open = previous close (plus tiny overnight drift)
    const expectedOpen = currentPrice * Math.exp(dailyDrift * 0.3);

    // Forecast range: average range * day-of-week factor * volatility adjustment
    // Volatility grows slightly with forecast horizon (uncertainty compounds)
    const horizonFactor = 1 + Math.sqrt(i / 252) * 0.15; // up to 15% wider at 12 months
    const rangeForDay = avgRangePct * dowFactor * horizonFactor;

    const forecastHigh = expectedOpen * (1 + rangeForDay / 2);
    const forecastLow = Math.max(0.01, expectedOpen * (1 - rangeForDay / 2));

    // Expected close: open + drift (geometric, can't go negative)
    const expectedClose = expectedOpen * Math.exp(dailyDrift);

    // Confidence: inverse of recent volatility stability
    // If recent vol is stable (low σ of σ), confidence is high
    const volOfVol = std(recentReturnsForVol.slice(-10).map((_, idx, arr) =>
      idx > 0 ? Math.abs(arr[idx] - arr[idx - 1]) : 0
    ));
    const baseConfidence = Math.max(30, Math.min(90, 90 - annualVol * 100));
    const confidence = Math.round(baseConfidence - (volOfVol * 1000) - Math.sqrt(i / 252) * 10);

    // Trend direction
    const trend: "up" | "down" | "flat" =
      dailyDrift > 0.0005 ? "up" : dailyDrift < -0.0005 ? "down" : "flat";

    // Week number
    const thisWeek = Math.floor(i / 5);
    if (thisWeek !== lastWeek) {
      weekNumber = thisWeek + 1;
      lastWeek = thisWeek;
    }

    forecastDays.push({
      date: dateToYyyymmdd(currentDate),
      dayOfWeek: dow,
      expectedOpen: Math.round(expectedOpen * 100) / 100,
      forecastLow: Math.round(forecastLow * 100) / 100,
      forecastHigh: Math.round(forecastHigh * 100) / 100,
      expectedClose: Math.round(expectedClose * 100) / 100,
      rangePercent: Math.round(rangeForDay * 10000) / 100,
      confidence: Math.max(20, Math.min(95, confidence)),
      trend,
      weekNumber,
    });

    // Advance the price for next day
    currentPrice = expectedClose;

    if (forecastDays.length >= tradingDaysNeeded) break;
  }

  // Step 8: Compute 12-month summary
  const avgDailyRange = mean(forecastDays.map((d) => d.rangePercent));
  const avgConfidence = Math.round(mean(forecastDays.map((d) => d.confidence)));
  const trendDirection: "up" | "down" | "flat" =
    annualTrendPct > 2 ? "up" : annualTrendPct < -2 ? "down" : "flat";

  const twelveMonthTarget = forecastDays[forecastDays.length - 1]?.expectedClose ?? baselinePrice;
  const allLows = forecastDays.map((d) => d.forecastLow);
  const allHighs = forecastDays.map((d) => d.forecastHigh);
  const twelveMonthRange = {
    low: Math.min(...allLows),
    high: Math.max(...allHighs),
  };

  const warnings: string[] = [];
  if (volatilityRegime === "extreme") {
    warnings.push("Extreme volatility detected — forecast ranges will be very wide. Reduce position sizing.");
  }
  if (excluded > 20) {
    warnings.push(`${excluded} outlier days were excluded as "significant news" events. The baseline reflects normal conditions only.`);
  }
  warnings.push("This forecast assumes no material news (mergers, geopolitical shocks, earnings surprises). When actual price breaks outside the forecast range, it signals a material event.");

  return {
    ticker,
    name,
    startDate: forecastDays[0]?.date ?? lastPoint.date,
    endDate: forecastDays[forecastDays.length - 1]?.date ?? lastPoint.date,
    forecastDays,
    summary: {
      avgDailyRange: Math.round(avgDailyRange * 100) / 100,
      avgConfidence,
      trendDirection,
      trendStrength: Math.round(annualTrendPct * 100) / 100,
      volatilityRegime,
      baselinePrice,
      twelveMonthTarget: Math.round(twelveMonthTarget * 100) / 100,
      twelveMonthRange: {
        low: Math.round(twelveMonthRange.low * 100) / 100,
        high: Math.round(twelveMonthRange.high * 100) / 100,
      },
      excludedOutliers: excluded,
      methodology: "Statistical baseline: 20-day vol + 60-day avg range + day-of-week seasonality + linear trend. Outliers >3σ excluded as 'news days'. Forecast assumes no material events.",
    },
    warnings,
  };
}
