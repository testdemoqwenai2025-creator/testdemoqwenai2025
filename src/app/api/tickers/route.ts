import { NextRequest, NextResponse } from "next/server";
import { getTickerLookup } from "@/lib/data-access";

/**
 * GET /api/tickers?q=aapl&limit=20
 * Search the ticker lookup table. Returns matching tickers with metadata.
 *
 * Lineage: StockCompanyJoinDistCache (Hadoop MapReduce).
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toUpperCase();
  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 20;
  const all = getTickerLookup();
  if (!q) {
    // Return the top N by total volume if no query
    const top = [...all]
      .sort((a, b) => b.total_volume - a.total_volume)
      .slice(0, limit);
    return NextResponse.json({ tickers: top });
  }
  const matches = all
    .filter(
      (t) =>
        t.ticker.includes(q) ||
        t.name.toUpperCase().includes(q)
    )
    .slice(0, limit);
  return NextResponse.json({ tickers: matches });
}
