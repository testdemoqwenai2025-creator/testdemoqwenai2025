import { NextRequest, NextResponse } from "next/server";
import { runBacktest } from "@/lib/backtester";

/**
 * GET /api/backtest?ticker=GE&strategy=sma_crossover&year=2008
 *   &fastPeriod=10&slowPeriod=30
 *
 * Runs a trading strategy backtest and returns performance metrics.
 *
 * Strategies:
 * - sma_crossover: params fastPeriod (default 10), slowPeriod (default 30)
 * - momentum: params lookback (default 20), threshold (default 5)
 * - mean_reversion: params period (default 20), mult (default 2)
 * - breakout: params period (default 20)
 * - rsi: params period (default 14), oversold (default 30), overbought (default 70)
 */
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  const strategy = req.nextUrl.searchParams.get("strategy") ?? "sma_crossover";
  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : undefined;

  if (!ticker) {
    return NextResponse.json({ error: "ticker parameter is required" }, { status: 400 });
  }

  // Collect numeric params from query string
  const params: Record<string, number> = {};
  for (const [key, value] of req.nextUrl.searchParams.entries()) {
    if (["ticker", "strategy", "year"].includes(key)) continue;
    const num = parseFloat(value);
    if (!isNaN(num)) params[key] = num;
  }

  const result = runBacktest(ticker, strategy, params, year);
  if (!result) {
    return NextResponse.json(
      { error: `Insufficient data for ticker ${ticker} or unknown strategy ${strategy}` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ...result,
    lineage: {
      job_id: "Backtester",
      title: "Trading Strategy Backtester",
      stage: "derived",
      description:
        "Tests trading strategies against historical data. Computes total return, alpha vs buy-and-hold, " +
        "Sharpe ratio, max drawdown, win rate, and equity curve. Strategies: SMA crossover, momentum, " +
        "mean reversion, breakout, RSI.",
    },
  });
}
