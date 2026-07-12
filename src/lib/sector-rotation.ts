/**
 * sector-rotation.ts — Sector rotation signal detector.
 *
 * Identifies when money is rotating between sectors — a key signal for
 * institutional positioning. The theory: in early bull markets, cyclical
 * sectors (Technology, Finance, Consumer Discretionary) lead. In late bull
 * markets, defensive sectors (Utilities, Health Care, Consumer Staples) take
 * over as investors de-risk.
 *
 * Computes:
 * - Relative volume change per sector (is money flowing IN or OUT?)
 * - Momentum score per sector (price trend + volume trend)
 * - Rotation signals: "INFLOW", "OUTFLOW", "NEUTRAL"
 * - Rotation phase: Risk-On / Risk-Off / Transitioning
 * - Top 3 sectors gaining inflow
 * - Top 3 sectors losing outflow
 */

import { getSectorHeatmap, getTopMovers, getTickerMeta } from "@/lib/data-access";

export interface SectorRotationEntry {
  sector: string;
  currentVolume: number;
  previousVolume: number;
  volumeChangePct: number;
  avgReturn: number;
  momentumScore: number;     // -100 to +100
  signal: "INFLOW" | "OUTFLOW" | "NEUTRAL";
  tickerCount: number;
  topTickers: string[];
}

export interface SectorRotationResult {
  year: number;
  sectors: SectorRotationEntry[];
  phase: "RISK_ON" | "RISK_OFF" | "TRANSITIONING";
  phaseDescription: string;
  topInflow: SectorRotationEntry[];
  topOutflow: SectorRotationEntry[];
  interpretation: string;
  rotationChart: {
    sector: string;
    currentPct: number;
    previousPct: number;
    change: number;
  }[];
}

const DEFENSIVE_SECTORS = ["Public Utilities", "Health Care", "Consumer Non-Durables"];
const CYCLICAL_SECTORS = ["Technology", "Finance", "Capital Goods", "Consumer Durables", "Consumer Services"];

export function computeSectorRotation(year: number): SectorRotationResult | null {
  const heatmap = getSectorHeatmap();
  const movers = getTopMovers(year);
  if (!heatmap || !movers) return null;

  const years = heatmap.years.sort((a, b) => a - b);
  const yearIdx = years.indexOf(year);
  if (yearIdx < 0) return null;
  const prevYear = yearIdx > 0 ? years[yearIdx - 1] : null;

  const currentYearCells = heatmap.cells.filter((c) => c.year === year);
  const prevYearCells = prevYear ? heatmap.cells.filter((c) => c.year === prevYear) : [];

  const totalCurrentVolume = currentYearCells.reduce((s, c) => s + c.avg_monthly_volume, 0);
  const totalPrevVolume = prevYearCells.reduce((s, c) => s + c.avg_monthly_volume, 0);

  const entries: SectorRotationEntry[] = [];

  for (const cell of currentYearCells) {
    const prevCell = prevYearCells.find((c) => c.sector === cell.sector);
    const prevVol = prevCell?.avg_monthly_volume ?? cell.avg_monthly_volume;

    const volumeChangePct = prevVol > 0 ? ((cell.avg_monthly_volume / prevVol) - 1) * 100 : 0;

    // Compute average return for this sector's tickers
    const sectorTickers = movers.active
      .filter((m) => {
        const meta = getTickerMeta(m.ticker);
        return meta?.sector === cell.sector;
      })
      .map((m) => m.ticker);

    const sectorMovers = [
      ...movers.gainers.filter((m) => {
        const meta = getTickerMeta(m.ticker);
        return meta?.sector === cell.sector;
      }),
      ...movers.losers.filter((m) => {
        const meta = getTickerMeta(m.ticker);
        return meta?.sector === cell.sector;
      }),
    ];

    const avgReturn = sectorMovers.length > 0
      ? sectorMovers.reduce((s, m) => s + m.return_pct, 0) / sectorMovers.length
      : 0;

    // Momentum score: combine volume change + return
    // Volume inflow (+) + positive returns (+) = high momentum
    const momentumScore = Math.max(-100, Math.min(100, Math.round(volumeChangePct * 0.5 + avgReturn * 0.5)));

    // Signal
    let signal: SectorRotationEntry["signal"];
    if (volumeChangePct > 10 && avgReturn > 0) signal = "INFLOW";
    else if (volumeChangePct < -10 || avgReturn < -10) signal = "OUTFLOW";
    else signal = "NEUTRAL";

    entries.push({
      sector: cell.sector,
      currentVolume: cell.avg_monthly_volume,
      previousVolume: prevVol,
      volumeChangePct: Math.round(volumeChangePct * 100) / 100,
      avgReturn: Math.round(avgReturn * 100) / 100,
      momentumScore,
      signal,
      tickerCount: cell.n_tickers,
      topTickers: sectorTickers.slice(0, 3),
    });
  }

  // Sort by momentum
  entries.sort((a, b) => b.momentumScore - a.momentumScore);

  // Determine rotation phase
  const defensiveVolume = entries
    .filter((e) => DEFENSIVE_SECTORS.includes(e.sector))
    .reduce((s, e) => s + e.currentVolume, 0);
  const cyclicalVolume = entries
    .filter((e) => CYCLICAL_SECTORS.includes(e.sector))
    .reduce((s, e) => s + e.currentVolume, 0);
  const ratio = cyclicalVolume > 0 ? defensiveVolume / cyclicalVolume : 1;

  let phase: SectorRotationResult["phase"];
  let phaseDescription: string;
  if (ratio < 0.4) {
    phase = "RISK_ON";
    phaseDescription = "Money is concentrated in cyclical sectors (Technology, Finance, Consumer Discretionary). Market is in risk-on mode — investors expect growth.";
  } else if (ratio > 0.7) {
    phase = "RISK_OFF";
    phaseDescription = "Money is flowing to defensive sectors (Utilities, Health Care, Consumer Staples). Market is in risk-off mode — investors are de-risking.";
  } else {
    phase = "TRANSITIONING";
    phaseDescription = "Sector flows are balanced between defensive and cyclical. Market may be transitioning — watch for directional confirmation.";
  }

  const topInflow = entries.filter((e) => e.signal === "INFLOW").slice(0, 3);
  const topOutflow = entries.filter((e) => e.signal === "OUTFLOW").slice(-3).reverse();

  // Rotation chart data
  const rotationChart = entries.map((e) => ({
    sector: e.sector,
    currentPct: totalCurrentVolume > 0 ? Math.round((e.currentVolume / totalCurrentVolume) * 10000) / 100 : 0,
    previousPct: totalPrevVolume > 0 ? Math.round((e.previousVolume / totalPrevVolume) * 10000) / 100 : 0,
    change: Math.round((e.volumeChangePct) * 100) / 100,
  }));

  const interpretation = `Phase: ${phase.replace(/_/g, " ")}. Top inflow sectors: ${topInflow.map((e) => e.sector).join(", ") || "none"}. Top outflow sectors: ${topOutflow.map((e) => e.sector).join(", ") || "none"}. ${phaseDescription}`;

  return {
    year,
    sectors: entries,
    phase,
    phaseDescription,
    topInflow,
    topOutflow,
    interpretation,
    rotationChart,
  };
}
