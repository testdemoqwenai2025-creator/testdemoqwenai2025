import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import {
  getTopMovers,
  getVolumeAnomalies,
  getSectorHeatmap,
  getCompositeIndex,
  getTickerMeta,
  getTickerSeries,
} from "@/lib/data-access";

/**
 * POST /api/chat-analyst
 * Body: { question: string, year: number }
 *
 * Conversational AI analyst — uses the ZAI SDK to answer questions about
 * the market data. The LLM is given a context summary of the selected year
 * (top movers, anomalies, sector heatmap, composite index stats) so it can
 * answer questions without needing to query the data itself.
 *
 * If the user asks about a specific ticker, the route also returns
 * open_ticker so the frontend can open the stock detail drawer.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const question: string = body.question?.trim();
  const year: number = body.year ?? 2008;

  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  // ---------- Build context ----------
  const context = await buildContext(year);

  // ---------- Check if user is asking about a specific ticker ----------
  const tickerMatch = question.match(/\b([A-Z]{1,5})\b/);
  let openTicker: string | null = null;
  if (tickerMatch) {
    const candidate = tickerMatch[1].toUpperCase();
    const meta = getTickerMeta(candidate);
    if (meta) {
      openTicker = candidate;
      // Add ticker-specific context
      const series = getTickerSeries(candidate);
      if (series) {
        const yearData = series.filter((p) => p.year === year);
        if (yearData.length > 0) {
          const first = yearData[0];
          const last = yearData[yearData.length - 1];
          const high = Math.max(...yearData.map((p) => p.high));
          const low = Math.min(...yearData.map((p) => p.low));
          const totalVol = yearData.reduce((s, p) => s + p.volume, 0);
          const ret = ((last.close / first.close) - 1) * 100;
          context.tickerContext = `${candidate} (${meta.name}, ${meta.sector}):
- First close ${year}: $${first.close.toFixed(2)}
- Last close ${year}: $${last.close.toFixed(2)}
- Annual return: ${ret >= 0 ? "+" : ""}${ret.toFixed(1)}%
- High: $${high.toFixed(2)}, Low: $${low.toFixed(2)}
- Total volume: ${totalVol.toLocaleString()} shares
- Trading days: ${yearData.length}`;
        }
      }
    }
  }

  // ---------- Call the LLM ----------
  const systemPrompt = `You are an AI market analyst for the NYSE Terminal dashboard. You answer questions about ${year} NYSE market data.

Here is the market context for ${year}:

${context.marketSummary}

${context.tickerContext ? `\nTicker-specific data:\n${context.tickerContext}` : ""}

Guidelines:
- Be concise but informative. Use bullet points for lists.
- Cite specific numbers from the context when relevant.
- If asked about a ticker not in the context, say you don't have detailed data for it.
- If asked to compare, use the actual numbers from context.
- When mentioning a ticker, format it as TICKER: e.g. "GE: General Electric..."
- Keep responses under 200 words unless the user asks for detail.`;

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const answer =
      completion.choices?.[0]?.message?.content ??
      "I'm sorry, I couldn't generate a response.";

    return NextResponse.json({
      answer,
      open_ticker: openTicker,
      year,
      context_used: {
        has_market_summary: !!context.marketSummary,
        has_ticker_context: !!context.tickerContext,
      },
    });
  } catch (err: any) {
    console.error("Chat analyst error:", err);
    // Fallback: return a basic answer
    return NextResponse.json({
      answer: `I'm having trouble connecting to my AI backend right now. Here's what I can tell you about ${year} from the pre-computed data:\n\n${context.marketSummary}`,
      open_ticker: openTicker,
      year,
      context_used: {
        has_market_summary: !!context.marketSummary,
        has_ticker_context: !!context.tickerContext,
        fallback: true,
      },
    });
  }
}

async function buildContext(year: number) {
  const movers = getTopMovers(year);
  const anomalies = getVolumeAnomalies(year);
  const heatmap = getSectorHeatmap();
  const composite = getCompositeIndex(year);

  let marketSummary = "";

  // Composite index stats
  if (composite && composite.length > 0) {
    const first = composite[0];
    const last = composite[composite.length - 1];
    const yearReturn = ((last.avg_close / first.avg_close) - 1) * 100;
    const high = Math.max(...composite.map((p) => p.avg_close));
    const low = Math.min(...composite.map((p) => p.avg_close));
    marketSummary += `Market Overview for ${year}:\n`;
    marketSummary += `- Composite index (equal-weighted avg close): started at $${first.avg_close.toFixed(2)}, ended at $${last.avg_close.toFixed(2)}\n`;
    marketSummary += `- Annual return: ${yearReturn >= 0 ? "+" : ""}${yearReturn.toFixed(1)}%\n`;
    marketSummary += `- Range: $${low.toFixed(2)} - $${high.toFixed(2)}\n`;
    marketSummary += `- Trading days: ${composite.length}\n\n`;
  }

  // Top movers
  if (movers) {
    marketSummary += `Top Gainers (${year}):\n`;
    movers.gainers.slice(0, 5).forEach((m) => {
      marketSummary += `- ${m.ticker}: +${m.return_pct.toFixed(1)}% ($${m.first_close.toFixed(2)} → $${m.last_close.toFixed(2)})\n`;
    });
    marketSummary += `\nTop Losers (${year}):\n`;
    movers.losers.slice(0, 5).forEach((m) => {
      marketSummary += `- ${m.ticker}: ${m.return_pct.toFixed(1)}% ($${m.first_close.toFixed(2)} → $${m.last_close.toFixed(2)})\n`;
    });
    marketSummary += `\nMost Active (${year}):\n`;
    movers.active.slice(0, 5).forEach((m) => {
      marketSummary += `- ${m.ticker}: ${(m.total_volume / 1e9).toFixed(2)}B shares, ${m.return_pct >= 0 ? "+" : ""}${m.return_pct.toFixed(1)}%\n`;
    });
    marketSummary += "\n";
  }

  // Volume anomalies
  if (anomalies && anomalies.length > 0) {
    marketSummary += `Notable Volume Anomalies (${year}):\n`;
    anomalies.slice(0, 5).forEach((a) => {
      marketSummary += `- ${a.ticker} on ${a.date}: ${a.volume.toLocaleString()} shares (${a.ratio.toFixed(1)}x 30-day avg)\n`;
    });
    marketSummary += "\n";
  }

  // Sector performance
  if (heatmap) {
    const yearCells = heatmap.cells.filter((c) => c.year === year);
    const sorted = yearCells.sort((a, b) => b.avg_monthly_volume - a.avg_monthly_volume);
    marketSummary += `Sector Volume Ranking (${year}):\n`;
    sorted.slice(0, 5).forEach((c) => {
      marketSummary += `- ${c.sector}: ${(c.avg_monthly_volume / 1e6).toFixed(1)}M/month avg${c.yoy_pct != null ? `, YoY ${c.yoy_pct >= 0 ? "+" : ""}${c.yoy_pct.toFixed(1)}%` : ""}\n`;
    });
  }

  return { marketSummary, tickerContext: null as string | null };
}
