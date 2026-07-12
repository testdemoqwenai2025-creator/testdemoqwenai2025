import { NextRequest, NextResponse } from "next/server";
import { getTopMovers, getTickerLookup } from "@/lib/data-access";

/**
 * GET /api/treemap?year=2008
 * Returns a nested tree of sector → industry → ticker, with each leaf
 * carrying total_volume (for sizing) and return_pct (for coloring).
 *
 * Lineage: derived — combines TotalVolumePerYear + StockCompanyJoinDistCache.
 */
export async function GET(req: NextRequest) {
  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : 2008;

  const movers = getTopMovers(year);
  if (!movers) {
    return NextResponse.json({ error: `no data for year ${year}` }, { status: 404 });
  }

  // Combine gainers + losers + active into one pool
  const pool = new Map<string, { return_pct: number; total_volume: number; last_close: number }>();
  [...movers.gainers, ...movers.losers, ...movers.active].forEach((m) => {
    const existing = pool.get(m.ticker);
    if (!existing || m.total_volume > existing.total_volume) {
      pool.set(m.ticker, {
        return_pct: m.return_pct,
        total_volume: m.total_volume,
        last_close: m.last_close,
      });
    }
  });

  // Add sector/industry from ticker lookup
  const allTickers = getTickerLookup();
  const tickerMetaMap = new Map(allTickers.map((t) => [t.ticker, t]));

  // Build the tree: { sector → { industry → [tickers] } }
  const tree: Record<string, Record<string, Array<{
    ticker: string;
    name: string;
    return_pct: number;
    total_volume: number;
    last_close: number;
  }>>> = {};

  let totalVolumeAll = 0;
  for (const [ticker, data] of pool.entries()) {
    const meta = tickerMetaMap.get(ticker);
    const sector = meta?.sector ?? "Unknown";
    const industry = meta?.industry ?? "Unknown";
    const name = meta?.name ?? ticker;

    if (!tree[sector]) tree[sector] = {};
    if (!tree[sector][industry]) tree[sector][industry] = [];

    tree[sector][industry].push({
      ticker,
      name,
      return_pct: data.return_pct,
      total_volume: data.total_volume,
      last_close: data.last_close,
    });
    totalVolumeAll += data.total_volume;
  }

  // Convert to nested array format for the frontend
  const sectors = Object.entries(tree)
    .map(([sectorName, industries]) => {
      const industryList = Object.entries(industries).map(([industryName, tickers]) => {
        const industryVolume = tickers.reduce((s, t) => s + t.total_volume, 0);
        return {
          name: industryName,
          volume: industryVolume,
          children: tickers.map((t) => ({
            name: t.ticker,
            fullName: t.name,
            volume: t.total_volume,
            return_pct: t.return_pct,
            last_close: t.last_close,
          })),
        };
      });
      const sectorVolume = industryList.reduce((s, i) => s + i.volume, 0);
      return {
        name: sectorName,
        volume: sectorVolume,
        children: industryList,
      };
    })
    .sort((a, b) => b.volume - a.volume);

  return NextResponse.json({
    year,
    total_volume: totalVolumeAll,
    children: sectors,
  });
}
