import { NextRequest, NextResponse } from "next/server";
import { getQuotes, getDataSource } from "@/lib/market-data-adapter";

/**
 * GET /api/market-data/quotes?symbols=GE,F,BAC,BTC
 *
 * Returns current quotes for the requested symbols.
 * Uses the configured data source (simulator / historical / api).
 */
export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json(
      { error: "symbols parameter is required (comma-separated)" },
      { status: 400 }
    );
  }

  const quotes = getQuotes(symbols);
  return NextResponse.json({
    quotes,
    source: getDataSource(),
    timestamp: Date.now(),
  });
}
