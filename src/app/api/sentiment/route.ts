import { NextRequest, NextResponse } from "next/server";
import { computeSentiment } from "@/lib/sentiment";

/**
 * GET /api/sentiment?year=2008
 *
 * Computes a composite market sentiment score (0-100) from price patterns.
 *
 * Indicators (weighted):
 * - Market Momentum (20%): current vs 125-day SMA
 * - Market Volatility (15%): 20d vol vs 60d vol
 * - Market Breadth (15%): advancing vs declining issues
 * - Price Trend (20%): 20-day return
 * - Safe Haven Demand (15%): defensive vs cyclical volume
 * - Volume Sentiment (15%): up-volume vs down-volume
 *
 * Score interpretation:
 * 0-25: Extreme Fear (buying opportunity)
 * 25-45: Fear (cautious accumulation)
 * 45-55: Neutral
 * 55-75: Greed (take profits)
 * 75-100: Extreme Greed (selling opportunity)
 */
export async function GET(req: NextRequest) {
  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : 2017;

  const result = computeSentiment(year);
  if (!result) {
    return NextResponse.json(
      { error: `Insufficient data for year ${year}` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ...result,
    lineage: {
      job_id: "SentimentAnalyzer",
      title: "Market Fear & Greed Index (Price-Pattern Based)",
      stage: "derived",
      description:
        "Composite sentiment score from 6 price-based indicators. " +
        "Inspired by CNN's Fear & Greed Index but computed entirely from OHLCV data.",
    },
  });
}
