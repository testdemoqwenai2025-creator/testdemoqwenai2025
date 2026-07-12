import { NextRequest, NextResponse } from "next/server";
import {
  getQuotes,
  getAssetsByClass,
  getAllAssets,
  getDataSource,
  searchAssets,
  type AssetClass,
} from "@/lib/market-data-adapter";

/**
 * GET /api/assets?class=stock
 * GET /api/assets?q=search
 * GET /api/assets (all assets)
 *
 * Returns the asset registry — stocks, ETFs, crypto, forex.
 */
export async function GET(req: NextRequest) {
  const classFilter = req.nextUrl.searchParams.get("class") as AssetClass | null;
  const query = req.nextUrl.searchParams.get("q");

  if (query) {
    return NextResponse.json({
      assets: searchAssets(query),
      source: getDataSource(),
    });
  }

  if (classFilter) {
    return NextResponse.json({
      assets: getAssetsByClass(classFilter),
      source: getDataSource(),
    });
  }

  return NextResponse.json({
    assets: getAllAssets(),
    source: getDataSource(),
    counts: {
      stock: getAssetsByClass("stock").length,
      etf: getAssetsByClass("etf").length,
      crypto: getAssetsByClass("crypto").length,
      forex: getAssetsByClass("forex").length,
    },
  });
}
