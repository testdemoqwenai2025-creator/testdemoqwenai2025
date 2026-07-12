import { NextRequest, NextResponse } from "next/server";
import { analyzePortfolio } from "@/lib/portfolio-risk";

/**
 * POST /api/portfolio-risk
 * Body: { holdings: [{ ticker: "GE", weight: 25 }, { ticker: "F", weight: 25 }, ...], year?: number }
 *
 * Computes professional risk metrics for a portfolio:
 * - VaR (Value at Risk) — 1-day and 10-day, 95% and 99%
 * - Expected Shortfall (CVaR)
 * - Sharpe ratio, Sortino ratio
 * - Maximum drawdown
 * - Beta vs market index
 * - Correlation matrix
 *
 * Institutional-grade risk analytics.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const holdings: { ticker: string; weight: number }[] = body.holdings ?? [];
    const year: number = body.year ?? 2017;

    if (holdings.length === 0) {
      return NextResponse.json(
        { error: "holdings array is required (e.g. [{ticker: 'GE', weight: 25}, {ticker: 'F', weight: 75}])" },
        { status: 400 }
      );
    }

    const result = analyzePortfolio(holdings, year);
    if (!result) {
      return NextResponse.json(
        { error: "Insufficient data for one or more tickers. Each ticker needs at least 30 trading days." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...result,
      lineage: {
        job_id: "PortfolioRiskAnalyzer",
        title: "Portfolio Risk Analyzer (VaR, Sharpe, Drawdown)",
        stage: "derived",
        description:
          "Institutional-grade risk metrics: Value at Risk (historical method), Expected Shortfall, " +
          "Sharpe & Sortino ratios, maximum drawdown, beta, and correlation matrix. " +
          "Same metrics used by professional risk managers.",
      },
    });
  } catch (err: any) {
    console.error("Portfolio risk error:", err);
    return NextResponse.json({ error: err.message ?? "internal error" }, { status: 500 });
  }
}
