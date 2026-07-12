import { NextRequest, NextResponse } from "next/server";
import { getTickerSeries, getTickerMeta, withLineage } from "@/lib/data-access";

/**
 * GET /api/stock/[ticker]?year=2008
 * Returns the daily OHLCV series for the ticker (optionally filtered by year)
 * plus the ticker's metadata (name, sector, industry, etc).
 *
 * Lineage: StockCompanyJoinDistCache (Hadoop MapReduce) — company metadata
 * comes from the distributed-cache join.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : undefined;

  const series = getTickerSeries(ticker);
  if (!series) {
    return NextResponse.json(
      { error: `ticker "${ticker}" not found` },
      { status: 404 }
    );
  }
  const meta = getTickerMeta(ticker);
  const filtered = year ? series.filter((p) => p.year === year) : series;
  return NextResponse.json(
    withLineage("StockCompanyJoinDistCache", { meta, series: filtered })
  );
}
