import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/watchlists/:id — get one watchlist with tickers
 * PATCH /api/watchlists/:id — rename, or add/remove tickers
 *   Body: { action: "add_ticker" | "remove_ticker" | "rename", ticker?: string, name?: string }
 * DELETE /api/watchlists/:id — delete watchlist
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const list = await db.watchlist.findUnique({
    where: { id },
    include: { tickers: true },
  });
  if (!list) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ watchlist: list });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const action: string = body.action;

  if (action === "rename") {
    const list = await db.watchlist.update({
      where: { id },
      data: { name: body.name },
      include: { tickers: true },
    });
    return NextResponse.json({ watchlist: list });
  }

  if (action === "add_ticker") {
    const ticker: string = body.ticker?.toUpperCase();
    if (!ticker) {
      return NextResponse.json({ error: "ticker required" }, { status: 400 });
    }
    // upsert — don't fail if already exists
    await db.watchlistTicker.upsert({
      where: { watchlistId_ticker: { watchlistId: id, ticker } },
      create: { watchlistId: id, ticker },
      update: {},
    });
    const list = await db.watchlist.findUnique({
      where: { id },
      include: { tickers: true },
    });
    return NextResponse.json({ watchlist: list });
  }

  if (action === "remove_ticker") {
    const ticker: string = body.ticker?.toUpperCase();
    await db.watchlistTicker.deleteMany({
      where: { watchlistId: id, ticker },
    });
    const list = await db.watchlist.findUnique({
      where: { id },
      include: { tickers: true },
    });
    return NextResponse.json({ watchlist: list });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.watchlist.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
