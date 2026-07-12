import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/watchlists
 * List all watchlists with their tickers.
 *
 * POST /api/watchlists
 * Create a new watchlist. Body: { name: string }
 */
export async function GET() {
  const lists = await db.watchlist.findMany({
    include: { tickers: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ watchlists: lists });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name: string = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const list = await db.watchlist.create({
    data: {
      name,
      tickers: {
        create: (body.tickers as string[] ?? []).map((t) => ({
          ticker: t.toUpperCase(),
        })),
      },
    },
    include: { tickers: true },
  });
  return NextResponse.json({ watchlist: list }, { status: 201 });
}
