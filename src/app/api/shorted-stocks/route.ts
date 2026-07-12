import { NextRequest, NextResponse } from "next/server";
import { getMostShortedStocks } from "@/lib/volume-forecaster";

/**
 * GET /api/shorted-stocks?year=2017&limit=15
 *
 * Returns the top N most shorted stocks based on a price-volume proxy.
 *
 * IMPORTANT: This is a STATISTICAL PROXY, not actual FINRA short interest data.
 * For real short interest, use FINRA's bi-weekly reports or SEC filings.
 *
 * The Short Pressure Score combines:
 * - Turnover ratio (20%)
 * - Price decline rate (25%)
 * - Down-volume ratio: days with vol spike + price drop (20%)
 * - Covering spikes: days with vol spike + price up (15%)
 * - Persistent pressure: consecutive high-vol + low-return days (20%)
 *
 * Also includes naked short pressure (phantom volume on high-vol down days).
 */
export async function GET(req: NextRequest) {
  const year = parseInt(req.nextUrl.searchParams.get("year") ?? "2017", 10);
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "15", 10);

  const result = getMostShortedStocks(year, Math.min(limit, 50));
  if (!result) {
    return NextResponse.json(
      { error: `No data available for year ${year}` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ...result,
    lineage: {
      job_id: "ShortInterestProxy",
      title: "Most Shorted Stocks (Price-Volume Proxy)",
      stage: "derived",
      description:
        "Statistical proxy for short interest based on turnover, price decline, down-volume ratio, " +
        "covering spikes, and persistent pressure. NOT actual FINRA data — for estimation only.",
    },
  });
}
