import { NextRequest, NextResponse } from "next/server";
import { forecastVolume } from "@/lib/volume-forecaster";

/**
 * GET /api/volume-forecast?ticker=GE&days=30
 *
 * Predicts daily trading volume for the next N trading days.
 * Uses day-of-week patterns, trend, and options-expiry detection.
 *
 * Tolerance: flags when actual deviates >0.01% from prediction.
 * Categories: exact (≤0.01%), tight (≤1%), normal (≤5%), wide (≤15%), anomaly (>15%)
 */
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10);

  if (!ticker) {
    return NextResponse.json({ error: "ticker parameter is required" }, { status: 400 });
  }

  const result = forecastVolume(ticker, ticker, Math.min(days, 252));
  if (!result) {
    return NextResponse.json(
      { error: `Insufficient data for ticker ${ticker}. Need at least 30 trading days.` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ...result,
    lineage: {
      job_id: "VolumeForecaster",
      title: "Daily Volume Forecast with 0.01% Tolerance",
      stage: "derived",
      description:
        "Predicts daily volume using 20-day average × day-of-week factor × options-expiry boost + trend slope. " +
        "Flags deviations: exact (≤0.01%), tight (≤1%), normal (≤5%), wide (≤15%), anomaly (>15%).",
    },
  });
}
