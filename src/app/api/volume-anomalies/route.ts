import { NextRequest, NextResponse } from "next/server";
import { getVolumeAnomalies, withLineage } from "@/lib/data-access";

/**
 * GET /api/volume-anomalies?year=2008
 * Returns top 50 days in the year where a stock traded >=5x its 30-day avg volume.
 *
 * Lineage: derived job "VolumeAnomalies" — not in the original course,
 * but uses the TopThreeStocksByVolume job as conceptual inspiration.
 */
export async function GET(req: NextRequest) {
  const yearParam = req.nextUrl.searchParams.get("year");
  if (!yearParam) {
    return NextResponse.json(
      { error: "year parameter is required" },
      { status: 400 }
    );
  }
  const year = parseInt(yearParam, 10);
  const data = getVolumeAnomalies(year);
  return NextResponse.json(withLineage("VolumeAnomalies", data));
}
