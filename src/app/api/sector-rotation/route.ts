import { NextRequest, NextResponse } from "next/server";
import { computeSectorRotation } from "@/lib/sector-rotation";

/**
 * GET /api/sector-rotation?year=2008
 *
 * Detects sector rotation — when money moves between sectors.
 *
 * Returns:
 * - Per-sector: volume change, return, momentum score, signal (INFLOW/OUTFLOW/NEUTRAL)
 * - Phase: RISK_ON / RISK_OFF / TRANSITIONING
 * - Top 3 inflow sectors (gaining institutional interest)
 * - Top 3 outflow sectors (losing interest)
 * - Rotation chart data (current vs previous year market share)
 *
 * Theory:
 * - Risk-On: money in cyclical sectors (Technology, Finance, Consumer Discretionary)
 * - Risk-Off: money in defensive sectors (Utilities, Health Care, Consumer Staples)
 * - Early bull markets: cyclicals lead
 * - Late bull markets: defensives take over
 */
export async function GET(req: NextRequest) {
  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : 2017;

  const result = computeSectorRotation(year);
  if (!result) {
    return NextResponse.json(
      { error: `Insufficient data for year ${year}` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ...result,
    lineage: {
      job_id: "SectorRotation",
      title: "Sector Rotation Signal Detector",
      stage: "derived",
      description:
        "Identifies when money is rotating between sectors. Computes per-sector momentum, " +
        "inflow/outflow signals, and the overall market phase (Risk-On / Risk-Off / Transitioning).",
    },
  });
}
