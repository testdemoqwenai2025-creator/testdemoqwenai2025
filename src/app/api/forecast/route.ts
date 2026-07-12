import { NextRequest, NextResponse } from "next/server";
import { forecastTicker } from "@/lib/forecaster";
import { getTickerMeta } from "@/lib/data-access";

/**
 * GET /api/forecast?ticker=GE&months=12
 *
 * Returns a 12-month daily range forecast for the given ticker.
 *
 * The forecast is a STATISTICAL BASELINE — it tells you what "normal"
 * trading looks like, assuming no significant news events. When actual
 * price breaks outside the forecast range, it signals a material event.
 *
 * Methodology:
 * 1. 20-day rolling volatility of log returns
 * 2. 60-day average daily range (high-low)/close
 * 3. Day-of-week seasonality (Mondays are more volatile, etc.)
 * 4. Linear trend projection on recent 20 closes
 * 5. Outlier exclusion: days with |return| > 3σ are treated as "news days"
 *    and removed from the baseline
 *
 * Each forecast day includes:
 * - date, dayOfWeek
 * - expectedOpen, forecastLow, forecastHigh, expectedClose
 * - rangePercent (expected range as % of open)
 * - confidence (0-100, based on volatility stability)
 * - trend (up/down/flat)
 * - weekNumber (1-52)
 */
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  const months = parseInt(req.nextUrl.searchParams.get("months") ?? "12", 10);

  if (!ticker) {
    return NextResponse.json(
      { error: "ticker parameter is required" },
      { status: 400 }
    );
  }

  const meta = getTickerMeta(ticker);
  const name = meta?.name ?? ticker;

  const result = forecastTicker(ticker, name, months);
  if (!result) {
    return NextResponse.json(
      { error: `Insufficient data for ticker ${ticker}. Need at least 60 trading days.` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ...result,
    lineage: {
      job_id: "StatisticalForecaster",
      title: "Statistical Range Forecaster (No-News Baseline)",
      stage: "derived",
      description:
        "Generates a 12-month daily range forecast using historical volatility, " +
        "day-of-week seasonality, and trend projection. Outliers >3σ are excluded " +
        "as 'significant news' days. The baseline assumes no material events — " +
        "when actual price breaks outside the range, it signals news.",
    },
  });
}
