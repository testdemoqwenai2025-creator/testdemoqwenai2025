import { NextResponse } from "next/server";
import { getSectorHeatmap, withLineage } from "@/lib/data-access";

/**
 * GET /api/sector-heatmap
 * Returns the sector × year matrix of average monthly trade volume.
 *
 * Lineage: AvgStockVolumePerMonth (Hadoop MapReduce) — the original
 * mapper/reducer/combiner triplet reproduced in pandas.
 */
export async function GET() {
  const data = getSectorHeatmap();
  return NextResponse.json(withLineage("AvgStockVolumePerMonth", data));
}
