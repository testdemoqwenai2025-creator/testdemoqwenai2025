import { NextResponse } from "next/server";
import { getAvailableYears } from "@/lib/data-access";

/**
 * GET /api/years
 * Returns the list of years present in the dataset (1997-2017).
 */
export async function GET() {
  return NextResponse.json({ years: getAvailableYears() });
}
