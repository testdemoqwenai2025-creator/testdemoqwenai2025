import { NextRequest, NextResponse } from "next/server";
import { getLiveDeviation } from "@/lib/volume-forecaster";

/**
 * GET /api/live-deviation?ticker=GE
 *
 * Compares the last actual trading day to its forecast range.
 * Shows whether the stock is behaving "normally" or if something
 * material is happening.
 *
 * Returns:
 * - Actual OHLCV for the day
 * - Forecast range (low/high/open/close)
 * - Price deviation from forecast midpoint
 * - Volume deviation with category (exact/tight/normal/wide/anomaly)
 * - Status: normal, elevated, breakout_up, breakout_down, volume_anomaly
 * - Human-readable interpretation
 *
 * NOTE: Uses the last available historical day as "today".
 * When a real-time API is connected, this will use the current trading day.
 */
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: "ticker parameter is required" }, { status: 400 });
  }

  const result = getLiveDeviation(ticker);
  if (!result) {
    return NextResponse.json(
      { error: `Insufficient data for ticker ${ticker}` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ...result,
    lineage: {
      job_id: "LiveDeviation",
      title: "Live Deviation from Forecast Range",
      stage: "derived",
      description:
        "Compares actual price/volume to the statistical forecast. When price breaks outside " +
        "the range or volume deviates significantly, it signals a material event.",
    },
  });
}
