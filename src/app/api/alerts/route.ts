import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/alerts — list all alerts
 * POST /api/alerts — create an alert
 *   Body: { ticker: string, type: "price_above"|"price_below"|"volume_spike", threshold: number }
 */
export async function GET() {
  const alerts = await db.alert.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ alerts });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const ticker: string = body.ticker?.toUpperCase();
  const type: string = body.type;
  const threshold: number = parseFloat(body.threshold);

  if (!ticker || !type || isNaN(threshold)) {
    return NextResponse.json(
      { error: "ticker, type, and threshold are required" },
      { status: 400 }
    );
  }

  if (!["price_above", "price_below", "volume_spike"].includes(type)) {
    return NextResponse.json({ error: "invalid alert type" }, { status: 400 });
  }

  const alert = await db.alert.create({
    data: {
      ticker,
      type,
      threshold,
      message: body.message ?? null,
    },
  });
  return NextResponse.json({ alert }, { status: 201 });
}
