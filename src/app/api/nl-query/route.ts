import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { getTickerLookup, getTopMovers } from "@/lib/data-access";

/**
 * POST /api/nl-query
 * Body: { query: string, year?: number }
 *
 * Translates a natural-language query about the market into a structured
 * filter, executes it against the pre-computed data, and returns matching
 * tickers with explanations.
 *
 * Uses the ZAI SDK (server-side only) to parse the NL query into a JSON
 * filter spec, then applies the filter locally.
 */

interface TickerMeta {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  ipoyear: number | null;
  marketcap: number | null;
  first_close: number;
  last_close: number;
  total_volume: number;
  trading_days: number;
  total_return_pct: number | null;
}

interface MoverEntry {
  ticker: string;
  return_pct: number;
  total_volume: number;
  first_close: number;
  last_close: number;
  high: number;
  low: number;
  n_days: number;
}

interface FilterSpec {
  sector?: string | string[];
  min_return_pct?: number;
  max_return_pct?: number;
  min_volume?: number;
  min_close?: number;
  max_close?: number;
  ipo_year_after?: number;
  ipo_year_before?: number;
  sort_by?: "return_pct" | "total_volume" | "marketcap";
  sort_desc?: boolean;
  limit?: number;
  explanation: string;
}

const SYSTEM_PROMPT = `You translate natural-language queries about NYSE stocks into a JSON filter spec.

Available data per ticker (for the selected year):
- ticker (string, e.g. "GE")
- name (company name)
- sector (one of: Basic Industries, Capital Goods, Consumer Durables, Consumer Non-Durables, Consumer Services, Energy, Finance, Health Care, Miscellaneous, Public Utilities, Technology, Transportation, Unknown)
- industry (string)
- ipoyear (integer or null)
- marketcap (float, USD)
- first_close, last_close (float, USD — for the selected year)
- total_volume (integer, shares traded in the selected year)
- return_pct (float, percent change from first to last close in the selected year)
- trading_days (integer, days the stock traded in the selected year)

Return ONLY a JSON object with these optional fields:
{
  "sector": "Technology" | ["Technology", "Finance"] | undefined,
  "min_return_pct": number | undefined,
  "max_return_pct": number | undefined,
  "min_volume": number | undefined,
  "min_close": number | undefined,
  "max_close": number | undefined,
  "ipo_year_after": number | undefined,
  "ipo_year_before": number | undefined,
  "sort_by": "return_pct" | "total_volume" | "marketcap" | undefined,
  "sort_desc": true | false | undefined,
  "limit": number | undefined,
  "explanation": "one-sentence human-readable summary of the filter"
}

Examples:
- "tech stocks that doubled in 2009" → {"sector":"Technology","min_return_pct":100,"sort_by":"return_pct","sort_desc":true,"limit":20,"explanation":"Technology sector tickers with >=100% return"}
- "energy stocks with volume over 100M" → {"sector":"Energy","min_volume":100000000,"sort_by":"total_volume","sort_desc":true,"limit":20,"explanation":"Energy sector tickers with >100M shares traded"}
- "biggest losers in finance" → {"sector":"Finance","sort_by":"return_pct","sort_desc":false,"limit":20,"explanation":"Finance sector tickers sorted by lowest return"}
- "stocks that survived 2008 with positive returns" → {"min_return_pct":0,"sort_by":"return_pct","sort_desc":true,"limit":20,"explanation":"Any ticker with positive return"}

Return ONLY the JSON, no markdown, no explanation outside the JSON.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query: string = body.query?.trim();
    const year: number = body.year ?? 2008;

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    // Step 1: ask the LLM to translate NL → filter spec
    let filter: FilterSpec;
    let usedLLM = false;
    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Year context: ${year}\nQuery: "${query}"` },
        ],
        temperature: 0.1,
      });
      const content = completion.choices?.[0]?.message?.content ?? "{}";
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      filter = JSON.parse(jsonStr);
      usedLLM = true;
    } catch (err) {
      console.error("LLM parse failed, using fallback:", err);
      filter = fallbackParse(query);
    }

    // Step 2: get the data
    const movers = getTopMovers(year);
    if (!movers) {
      return NextResponse.json({ error: `no data for year ${year}` }, { status: 404 });
    }

    // Combine gainers + losers + active into one pool, dedupe by ticker
    const pool = new Map<string, MoverEntry>();
    [...movers.gainers, ...movers.losers, ...movers.active].forEach((m) => {
      const existing = pool.get(m.ticker);
      if (!existing || m.total_volume > existing.total_volume) {
        pool.set(m.ticker, m);
      }
    });

    // Also pull from full ticker lookup for sector/industry filters
    const allTickers = getTickerLookup();
    const tickerMetaMap = new Map(allTickers.map((t) => [t.ticker, t]));

    // Step 3: apply the filter
    let candidates: Array<MoverEntry & { sector: string; industry: string; name: string }> = [];
    for (const m of pool.values()) {
      const meta = tickerMetaMap.get(m.ticker);
      const sector = meta?.sector ?? "Unknown";
      const industry = meta?.industry ?? "Unknown";
      const name = meta?.name ?? m.ticker;

      if (filter.sector) {
        const sectors = Array.isArray(filter.sector) ? filter.sector : [filter.sector];
        if (!sectors.includes(sector)) continue;
      }
      if (filter.min_return_pct != null && m.return_pct < filter.min_return_pct) continue;
      if (filter.max_return_pct != null && m.return_pct > filter.max_return_pct) continue;
      if (filter.min_volume != null && m.total_volume < filter.min_volume) continue;
      if (filter.min_close != null && m.last_close < filter.min_close) continue;
      if (filter.max_close != null && m.last_close > filter.max_close) continue;
      if (filter.ipo_year_after != null && (meta?.ipoyear == null || meta.ipoyear < filter.ipo_year_after)) continue;
      if (filter.ipo_year_before != null && (meta?.ipoyear == null || meta.ipoyear > filter.ipo_year_before)) continue;

      candidates.push({ ...m, sector, industry, name });
    }

    // Step 4: sort
    const sortBy = filter.sort_by ?? "return_pct";
    const sortDesc = filter.sort_desc ?? (sortBy === "return_pct");
    candidates.sort((a, b) => {
      const av = a[sortBy as keyof typeof a] as number;
      const bv = b[sortBy as keyof typeof b] as number;
      return sortDesc ? bv - av : av - bv;
    });

    // Step 5: limit
    const limit = filter.limit ?? 20;
    const results = candidates.slice(0, limit);

    return NextResponse.json({
      query,
      year,
      filter,
      used_llm: usedLLM,
      results: results.map((r) => ({
        ticker: r.ticker,
        name: r.name,
        sector: r.sector,
        industry: r.industry,
        return_pct: r.return_pct,
        total_volume: r.total_volume,
        first_close: r.first_close,
        last_close: r.last_close,
        high: r.high,
        low: r.low,
        n_days: r.n_days,
      })),
      result_count: results.length,
      total_candidates: candidates.length,
    });
  } catch (err: any) {
    console.error("NL query error:", err);
    return NextResponse.json(
      { error: err.message ?? "internal error" },
      { status: 500 }
    );
  }
}

function fallbackParse(query: string): FilterSpec {
  const q = query.toLowerCase();
  const filter: FilterSpec = { explanation: "" };

  const sectorMap: Record<string, string> = {
    technology: "Technology",
    tech: "Technology",
    energy: "Energy",
    finance: "Finance",
    financial: "Finance",
    "health care": "Health Care",
    healthcare: "Health Care",
    "consumer services": "Consumer Services",
    "basic industries": "Basic Industries",
    "capital goods": "Capital Goods",
    "consumer durables": "Consumer Durables",
    "consumer non-durables": "Consumer Non-Durables",
    utilities: "Public Utilities",
    transportation: "Transportation",
  };
  for (const [keyword, sector] of Object.entries(sectorMap)) {
    if (q.includes(keyword)) {
      filter.sector = sector;
      break;
    }
  }

  if (q.includes("doubled") || q.includes("2x")) filter.min_return_pct = 100;
  if (q.includes("tripled") || q.includes("3x")) filter.min_return_pct = 200;
  if (q.includes("positive") || q.includes("survived") || q.includes("gained")) filter.min_return_pct = 0;
  if (q.includes("lost") || q.includes("loser") || q.includes("decline")) filter.max_return_pct = 0;

  const volMatch = q.match(/(\d+)\s*(million|m|billion|b)\s*(shares?\s*)?(volume|traded)/);
  if (volMatch) {
    const n = parseInt(volMatch[1]);
    const mult = volMatch[2].startsWith("b") ? 1e9 : 1e6;
    filter.min_volume = n * mult;
  }

  if (q.includes("biggest") || q.includes("top") || q.includes("best")) {
    if (q.includes("loser") || q.includes("decline")) {
      filter.sort_by = "return_pct";
      filter.sort_desc = false;
    } else {
      filter.sort_by = "return_pct";
      filter.sort_desc = true;
    }
  }
  if (q.includes("most active") || q.includes("most traded")) {
    filter.sort_by = "total_volume";
    filter.sort_desc = true;
  }

  filter.limit = 20;
  const parts: string[] = [];
  if (filter.sector) parts.push(`${filter.sector} sector`);
  if (filter.min_return_pct != null) parts.push(`>=${filter.min_return_pct}% return`);
  if (filter.max_return_pct != null) parts.push(`<=${filter.max_return_pct}% return`);
  if (filter.min_volume != null) parts.push(`>=${filter.min_volume.toLocaleString()} volume`);
  filter.explanation = parts.join(", ") || "no specific filter applied";
  return filter;
}
