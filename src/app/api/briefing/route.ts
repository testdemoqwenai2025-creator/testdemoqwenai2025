import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import {
  getTopMovers,
  getVolumeAnomalies,
  getCompositeIndex,
  getSectorHeatmap,
  getTickerMeta,
} from "@/lib/data-access";
import { getQuotes, getAllAssets } from "@/lib/market-data-adapter";

/**
 * POST /api/briefing
 * Body: { year?: number }
 *
 * Stage 8: Auto-generated daily market briefing.
 *
 * Uses the ZAI SDK to generate a comprehensive market briefing that includes:
 * - Market overview (composite index performance)
 * - Top movers summary (gainers, losers, most active)
 * - Notable volume anomalies
 * - Sector performance highlights
 * - Multi-asset summary (stocks, ETFs, crypto, forex)
 * - AI-generated "what to watch" recommendations
 *
 * The briefing is written as if it were a morning research note from an analyst.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const year: number = body.year ?? 2008;

  // ---------- Gather all context ----------
  const movers = getTopMovers(year);
  const anomalies = getVolumeAnomalies(year);
  const composite = getCompositeIndex(year);
  const heatmap = getSectorHeatmap();
  const allAssets = getAllAssets();
  const liveQuotes = getQuotes(allAssets.map((a) => a.symbol));

  // ---------- Build data summary ----------
  const dataSummary: any = {
    year,
    timestamp: new Date().toISOString(),
  };

  // Composite index
  if (composite && composite.length > 0) {
    const first = composite[0];
    const last = composite[composite.length - 1];
    const yearReturn = ((last.avg_close / first.avg_close) - 1) * 100;
    const high = Math.max(...composite.map((p) => p.avg_close));
    const low = Math.min(...composite.map((p) => p.avg_close));
    dataSummary.marketIndex = {
      start: first.avg_close,
      end: last.avg_close,
      return: yearReturn,
      high,
      low,
      tradingDays: composite.length,
      advancing: composite.reduce((s, p) => s + p.advancing, 0),
      declining: composite.reduce((s, p) => s + p.declining, 0),
    };
  }

  // Top movers
  if (movers) {
    dataSummary.topGainers = movers.gainers.slice(0, 5).map((m) => ({
      ticker: m.ticker,
      return: m.return_pct,
      volume: m.total_volume,
    }));
    dataSummary.topLosers = movers.losers.slice(0, 5).map((m) => ({
      ticker: m.ticker,
      return: m.return_pct,
      volume: m.total_volume,
    }));
    dataSummary.mostActive = movers.active.slice(0, 5).map((m) => ({
      ticker: m.ticker,
      volume: m.total_volume,
      return: m.return_pct,
    }));
  }

  // Volume anomalies
  if (anomalies && anomalies.length > 0) {
    dataSummary.anomalies = anomalies.slice(0, 5).map((a) => ({
      ticker: a.ticker,
      date: a.date,
      volume: a.volume,
      ratio: a.ratio,
    }));
  }

  // Sector performance
  if (heatmap) {
    const yearCells = heatmap.cells.filter((c) => c.year === year);
    dataSummary.sectors = yearCells
      .sort((a, b) => b.avg_monthly_volume - a.avg_monthly_volume)
      .slice(0, 5)
      .map((c) => ({
        sector: c.sector,
        volume: c.avg_monthly_volume,
        yoy: c.yoy_pct,
        tickers: c.n_tickers,
      }));
  }

  // Multi-asset live quotes
  dataSummary.liveQuotes = liveQuotes.map((q) => ({
    symbol: q.symbol,
    assetClass: q.assetClass,
    price: q.price,
    change: q.changePercent,
  }));

  // ---------- Generate briefing via LLM ----------
  const systemPrompt = `You are a senior market analyst writing a daily market briefing for the NYSE Terminal platform.

You are given structured market data for ${year} (historical) plus live multi-asset quotes (simulated).

Write a professional, engaging briefing with these sections:
1. **Market Overview** — composite index performance, breadth, key stats
2. **Top Movers** — notable gainers, losers, and most active stocks with specific numbers
3. **Volume Anomalies** — unusual trading activity worth investigating
4. **Sector Performance** — which sectors led/lagged, with volume context
5. **Multi-Asset Snapshot** — stocks, ETFs, crypto, forex highlights
6. **What to Watch** — 3 actionable items for the trader's watchlist

Guidelines:
- Be specific: cite actual tickers, percentages, and volumes
- Use bullet points for readability
- Keep it under 400 words total
- Write in a professional but accessible tone (like a Bloomberg morning note)
- Use markdown formatting (**bold** for section headers)
- If crypto/ETF quotes are synthetic, mention they are simulated

Here is the data:
${JSON.stringify(dataSummary, null, 2)}`;

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate the daily market briefing for ${year}.` },
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    const briefing =
      completion.choices?.[0]?.message?.content ??
      "Unable to generate briefing at this time.";

    return NextResponse.json({
      briefing,
      year,
      generatedAt: new Date().toISOString(),
      dataSource: dataSummary.timestamp,
      stats: {
        gainersCount: movers?.gainers.length ?? 0,
        losersCount: movers?.losers.length ?? 0,
        anomaliesCount: anomalies.length,
        liveQuotesCount: liveQuotes.length,
      },
    });
  } catch (err: any) {
    console.error("Briefing generation error:", err);
    // Fallback: generate a template briefing without the LLM
    const fallback = generateFallbackBriefing(dataSummary, year);
    return NextResponse.json({
      briefing: fallback,
      year,
      generatedAt: new Date().toISOString(),
      fallback: true,
      error: err.message,
    });
  }
}

function generateFallbackBriefing(data: any, year: number): string {
  let briefing = `## Daily Market Briefing — ${year}\n\n`;

  if (data.marketIndex) {
    const m = data.marketIndex;
    briefing += `### Market Overview\n`;
    briefing += `- Composite index: $${m.start.toFixed(2)} → $${m.end.toFixed(2)} (${m.return >= 0 ? "+" : ""}${m.return.toFixed(1)}%)\n`;
    briefing += `- Range: $${m.low.toFixed(2)} - $${m.high.toFixed(2)}\n`;
    briefing += `- Trading days: ${m.tradingDays}\n`;
    briefing += `- Breadth: ${m.advancing.toLocaleString()} advancing vs ${m.declining.toLocaleString()} declining\n\n`;
  }

  if (data.topGainers) {
    briefing += `### Top Gainers\n`;
    data.topGainers.forEach((g: any) => {
      briefing += `- **${g.ticker}**: +${g.return.toFixed(1)}% (${(g.volume / 1e9).toFixed(2)}B shares)\n`;
    });
    briefing += "\n";
  }

  if (data.topLosers) {
    briefing += `### Top Losers\n`;
    data.topLosers.forEach((l: any) => {
      briefing += `- **${l.ticker}**: ${l.return.toFixed(1)}% (${(l.volume / 1e9).toFixed(2)}B shares)\n`;
    });
    briefing += "\n";
  }

  if (data.anomalies) {
    briefing += `### Volume Anomalies\n`;
    data.anomalies.forEach((a: any) => {
      briefing += `- **${a.ticker}** on ${a.date}: ${a.ratio.toFixed(1)}x normal volume\n`;
    });
    briefing += "\n";
  }

  if (data.sectors) {
    briefing += `### Sector Performance\n`;
    data.sectors.forEach((s: any) => {
      briefing += `- **${s.sector}**: ${(s.volume / 1e6).toFixed(1)}M/month avg${s.yoy != null ? `, YoY ${s.yoy >= 0 ? "+" : ""}${s.yoy.toFixed(1)}%` : ""}\n`;
    });
    briefing += "\n";
  }

  briefing += `### What to Watch\n`;
  briefing += `- Monitor the top gainers for continuation or reversal patterns\n`;
  briefing += `- Investigate volume anomalies for potential catalysts\n`;
  briefing += `- Watch sector rotation signals from the heatmap\n`;

  return briefing;
}
