import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * DELETE /api/alerts/:id — delete an alert
 * PATCH /api/alerts/:id — mark as triggered / reset
 *   Body: { action: "trigger" | "reset" }
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.alert.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const action = body.action;

  if (action === "trigger") {
    const alert = await db.alert.update({
      where: { id },
      data: { triggered: true, triggeredAt: new Date() },
    });
    return NextResponse.json({ alert });
  }

  if (action === "reset") {
    const alert = await db.alert.update({
      where: { id },
      data: { triggered: false, triggeredAt: null },
    });
    return NextResponse.json({ alert });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
