import { NextRequest, NextResponse } from "next/server";
import { getCompositeIndex, withLineage } from "@/lib/data-access";

/**
 * GET /api/composite-index?year=2008
 * Returns the equal-weighted daily composite index. If ?year= is given,
 * returns only that year.
 *
 * Lineage: derived job "CompositeIndex" — not in the original course.
 */
export async function GET(req: NextRequest) {
  const yearParam = req.nextUrl.searchParams.get("year");
  const year = yearParam ? parseInt(yearParam, 10) : undefined;
  const data = getCompositeIndex(year);
  return NextResponse.json(withLineage("CompositeIndex", data));
}
