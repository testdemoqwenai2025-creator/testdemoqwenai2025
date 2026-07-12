import { NextRequest, NextResponse } from "next/server";
import {
  getTopMovers,
  getCompositeIndex,
  getVolumeAnomalies,
  getSectorHeatmap,
  getTickerMeta,
  getAvailableYears,
} from "@/lib/data-access";
import { forecastTicker } from "@/lib/forecaster";
import { forecastVolume } from "@/lib/volume-forecaster";
import { getMostShortedStocks, getLiveDeviation } from "@/lib/volume-forecaster";
import { getQuotes, getAllAssets, getDataSource } from "@/lib/market-data-adapter";

/**
 * GET /api/snapshot
 * GET /api/snapshot?year=2008
 *
 * THE "SOUND ENDPOINT" — a single API call that returns the complete market
 * state with the latest data and most likely predictions.
 *
 * This endpoint is designed to be:
 * - Always available (no external gateway dependency)
 * - Fast (<500ms response time)
 * - Comprehensive (everything a trader needs in one call)
 * - Fresh (uses the most recent data available)
 */

export async function GET(req: NextRequest) {
  const yearParam = req.nextUrl.searchParams.get("year");
  const years = getAvailableYears();
  const year = yearParam ? parseInt(yearParam, 10) : years[years.length - 1];

  const snapshot: any = {
    timestamp: new Date().toISOString(),
    year,
    availableYears: years,
    dataSource: getDataSource(),
  };

  // 1. Market overview
  const composite = getCompositeIndex(year);
  if (composite && composite.length > 0) {
    const first = composite[0];
    const last = composite[composite.length - 1];
    const yearReturn = ((last.avg_close / first.avg_close) - 1) * 100;
    const high = Math.max(...composite.map((p) => p.avg_close));
    const low = Math.min(...composite.map((p) => p.avg_close));
    const advancing = composite.reduce((s, p) => s + p.advancing, 0);
    const declining = composite.reduce((s, p) => s + p.declining, 0);
    const last5 = composite.slice(-5);
    const last5Return = last5.length > 1 ? ((last5[last5.length - 1].avg_close / last5[0].avg_close) - 1) * 100 : 0;
    const last20 = composite.slice(-20);
    const last20Return = last20.length > 1 ? ((last20[last20.length - 1].avg_close / last20[0].avg_close) - 1) * 100 : 0;

    snapshot.marketOverview = {
      currentIndex: last.avg_close,
      yearStart: first.avg_close,
      yearReturn: Math.round(yearReturn * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      tradingDays: composite.length,
      breadth: { advancing, declining, ratio: Math.round((advancing / (advancing + declining)) * 10000) / 100 },
      recentTrends: { last5Days: Math.round(last5Return * 100) / 100, last20Days: Math.round(last20Return * 100) / 100 },
      lastUpdate: last.date,
    };
  }

  // 2. Top movers
  const movers = getTopMovers(year);
  if (movers) {
    snapshot.topMovers = {
      gainers: movers.gainers.slice(0, 5).map((m) => ({
        ticker: m.ticker, name: getTickerMeta(m.ticker)?.name ?? m.ticker,
        returnPct: m.return_pct, volume: m.total_volume,
      })),
      losers: movers.losers.slice(0, 5).map((m) => ({
        ticker: m.ticker, name: getTickerMeta(m.ticker)?.name ?? m.ticker,
        returnPct: m.return_pct, volume: m.total_volume,
      })),
      mostActive: movers.active.slice(0, 5).map((m) => ({
        ticker: m.ticker, name: getTickerMeta(m.ticker)?.name ?? m.ticker,
        volume: m.total_volume, returnPct: m.return_pct,
      })),
    };
  }

  // 3. Sector performance
  const heatmap = getSectorHeatmap();
  if (heatmap) {
    const yearCells = heatmap.cells.filter((c) => c.year === year);
    snapshot.sectors = yearCells
      .sort((a, b) => b.avg_monthly_volume - a.avg_monthly_volume)
      .slice(0, 8)
      .map((c) => ({
        sector: c.sector, avgMonthlyVolume: c.avg_monthly_volume,
        yoyChange: c.yoy_pct, tickerCount: c.n_tickers,
      }));
  }

  // 4. Volume anomalies
  const anomalies = getVolumeAnomalies(year);
  if (anomalies && anomalies.length > 0) {
    snapshot.volumeAnomalies = anomalies.slice(0, 5).map((a) => ({
      ticker: a.ticker, date: a.date, volume: a.volume,
      ratio: a.ratio, close: a.close,
    }));
  }

  // 5. Most shorted stocks (top 5)
  const shorted = getMostShortedStocks(year, 5);
  if (shorted) {
    snapshot.mostShorted = shorted.ranked.map((e) => ({
      ticker: e.ticker, name: e.name,
      shortPressureScore: e.shortPressureScore,
      estimatedShortInterest: e.estimatedShortInterest,
      nakedShortPressure: e.nakedShortPressure,
      phantomVolume: e.phantomVolume,
    }));
  }

  // 6. Live multi-asset quotes
  const allAssets = getAllAssets();
  const liveQuotes = getQuotes(allAssets.map((a) => a.symbol));
  snapshot.liveQuotes = liveQuotes.map((q) => ({
    symbol: q.symbol, assetClass: q.assetClass, price: q.price,
    changePercent: q.changePercent, volume: q.volume, source: q.source,
  }));

  // 7. Forecast summary for top 3 most active stocks
  if (movers) {
    const topTickers = movers.active.slice(0, 3).map((m) => m.ticker);
    snapshot.forecasts = topTickers.map((ticker) => {
      const meta = getTickerMeta(ticker);
      const fc = forecastTicker(ticker, meta?.name ?? ticker, 1);
      if (!fc) return null;
      const volFc = forecastVolume(ticker, meta?.name ?? ticker, 5);
      const deviation = getLiveDeviation(ticker);
      return {
        ticker, name: meta?.name ?? ticker, sector: meta?.sector,
        baselinePrice: fc.summary.baselinePrice,
        twelveMonthTarget: fc.summary.twelveMonthTarget,
        trendDirection: fc.summary.trendDirection,
        trendStrength: fc.summary.trendStrength,
        volatilityRegime: fc.summary.volatilityRegime,
        avgDailyRange: fc.summary.avgDailyRange,
        confidence: fc.summary.avgConfidence,
        next5Days: fc.forecastDays.slice(0, 5).map((d) => ({
          date: d.date, dayOfWeek: d.dayOfWeek,
          forecastLow: d.forecastLow, forecastHigh: d.forecastHigh,
          expectedClose: d.expectedClose, rangePercent: d.rangePercent,
        })),
        volumeForecast: volFc ? {
          baselineVolume: volFc.baselineVolume, trend: volFc.volumeTrend,
          next5Days: volFc.forecastDays.slice(0, 5).map((d) => ({
            date: d.date, dayOfWeek: d.dayOfWeek,
            predictedVolume: d.predictedVolume, isOptionsExpiry: d.isOptionsExpiry,
          })),
        } : null,
        liveStatus: deviation ? {
          status: deviation.status,
          priceDeviation: deviation.priceDeviation,
          volumeDeviation: deviation.volumeDeviation,
          volumeDeviationCategory: deviation.volumeDeviationCategory,
          interpretation: deviation.interpretation,
        } : null,
      };
    }).filter(Boolean);
  }

  // 8. What to watch
  const watchItems: string[] = [];
  if (snapshot.marketOverview) {
    const m = snapshot.marketOverview;
    if (m.yearReturn < -10) watchItems.push(`Market down ${m.yearReturn.toFixed(1)}% for ${year} — bearish regime`);
    else if (m.yearReturn > 10) watchItems.push(`Market up ${m.yearReturn.toFixed(1)}% for ${year} — bullish trend`);
    if (m.recentTrends.last5Days < -3) watchItems.push(`Market dropped ${m.recentTrends.last5Days.toFixed(1)}% in last 5 days`);
    else if (m.recentTrends.last5Days > 3) watchItems.push(`Market gained ${m.recentTrends.last5Days.toFixed(1)}% in last 5 days`);
  }
  if (snapshot.mostShorted && snapshot.mostShorted.length > 0) {
    const top = snapshot.mostShorted[0];
    watchItems.push(`${top.ticker} highest short pressure (score ${top.shortPressureScore}) — squeeze candidate`);
  }
  if (snapshot.forecasts) {
    for (const fc of snapshot.forecasts) {
      if (fc.liveStatus && fc.liveStatus.status !== "normal") {
        watchItems.push(`${fc.ticker}: ${fc.liveStatus.status.replace(/_/g, " ")} — ${fc.liveStatus.volumeDeviationCategory} volume deviation`);
      }
    }
  }
  if (watchItems.length === 0) watchItems.push("Market conditions appear normal — no significant deviations detected");
  snapshot.whatToWatch = watchItems;

  return NextResponse.json({
    ...snapshot,
    endpoint: "/api/snapshot",
    description: "Consolidated market snapshot with latest data and predictions. Always fresh.",
    refreshInterval: "real-time",
  });
}
