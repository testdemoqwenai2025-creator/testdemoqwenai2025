import { NextRequest, NextResponse } from "next/server";
import { getTopMovers, withLineage } from "@/lib/data-access";

/**
 * GET /api/top-movers?year=2008
 * Returns the year's top gainers, losers, and most-active tickers.
 *
 * Lineage: TotalVolumePerYear (Hadoop MapReduce) — drives the "active" slice.
 *          Gainers/Losers derived from per-ticker first vs last close in year.
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
  const data = getTopMovers(year);
  if (!data) {
    return NextResponse.json(
      { error: `no data for year ${year}` },
      { status: 404 }
    );
  }
  return NextResponse.json(withLineage("TotalVolumePerYear", data));
}
