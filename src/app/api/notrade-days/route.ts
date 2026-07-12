import { NextRequest, NextResponse } from "next/server";
import { getNoTradeDays, withLineage } from "@/lib/data-access";

/**
 * GET /api/notrade-days?year=2008
 * Returns the top 50 tickers with the most missing trading days in the year.
 *
 * Lineage: NoTradeDays counter (Hadoop MapReduce) — original course uses
 * MapReduce counters; here we compute the same answer via set difference.
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
  const data = getNoTradeDays(year);
  return NextResponse.json(withLineage("NoTradeDays", data));
}
