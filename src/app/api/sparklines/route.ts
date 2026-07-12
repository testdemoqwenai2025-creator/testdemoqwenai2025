import { NextRequest, NextResponse } from "next/server";
import { getTickerSeries } from "@/lib/data-access";

/**
 * POST /api/sparklines
 * Body: { tickers: string[], year?: number, points?: number }
 *
 * Returns a map of ticker → array of close prices for the given year.
 * Used by the Top Movers panel to render inline sparklines without
 * fetching full OHLCV for each ticker.
 *
 * Lineage: StockCompanyJoinDistCache (per-ticker series storage).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const tickers: string[] = body.tickers ?? [];
  const year: number | undefined = body.year;
  const points: number = body.points ?? 30;

  if (tickers.length === 0) {
    return NextResponse.json({ sparklines: {} });
  }

  // Cap at 50 tickers to keep the response reasonable
  const capped = tickers.slice(0, 50);

  const sparklines: Record<string, number[]> = {};
  for (const ticker of capped) {
    const series = getTickerSeries(ticker);
    if (!series || series.length === 0) {
      sparklines[ticker] = [];
      continue;
    }
    const filtered = year ? series.filter((p) => p.year === year) : series;
    if (filtered.length === 0) {
      sparklines[ticker] = [];
      continue;
    }
    // Sample down to `points` evenly-spaced closes
    const closes = filtered.map((p) => p.close);
    if (closes.length <= points) {
      sparklines[ticker] = closes;
    } else {
      const sampled: number[] = [];
      const step = (closes.length - 1) / (points - 1);
      for (let i = 0; i < points; i++) {
        const idx = Math.round(i * step);
        sampled.push(closes[idx]);
      }
      sparklines[ticker] = sampled;
    }
  }

  return NextResponse.json({ sparklines });
}
