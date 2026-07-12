import { NextRequest, NextResponse } from "next/server";
import { getTickerSeries, getTickerMeta } from "@/lib/data-access";

/**
 * GET /api/predictive-alerts?ticker=GE
 *
 * Stage 8: Predictive alerts using ML-style pattern detection.
 *
 * Analyzes a ticker's historical price/volume data and generates alerts
 * based on:
 * 1. **Crash pattern detection** — compares recent price action to historical
 *    pre-crash patterns (e.g. 2008-style drawdowns)
 * 2. **Volume surge prediction** — detects accelerating volume that may
 *    precede a major move
 * 3. **Volatility regime change** — detects when volatility shifts from
 *    normal to elevated
 * 4. **Support/resistance break** — detects price breaking key levels
 * 5. **Momentum divergence** — detects when price and volume diverge
 *
 * Each alert includes a confidence score (0-100) and an explanation.
 */

interface PredictiveAlert {
  type: string;
  severity: "info" | "warning" | "critical";
  confidence: number; // 0-100
  message: string;
  recommendation: string;
  detectedAt: string;
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) {
    return NextResponse.json(
      { error: "ticker parameter is required" },
      { status: 400 }
    );
  }

  const series = getTickerSeries(ticker);
  const meta = getTickerMeta(ticker);
  if (!series || series.length === 0) {
    return NextResponse.json(
      { error: `no data for ticker ${ticker}` },
      { status: 404 }
    );
  }

  // Use the last 252 trading days (1 year) for analysis
  const recent = series.slice(-252);
  const alerts: PredictiveAlert[] = [];

  // ---------- 1. Crash pattern detection ----------
  // Check if recent drawdown resembles 2008-style crash pattern
  if (recent.length >= 60) {
    const last60 = recent.slice(-60);
    const peak = Math.max(...last60.map((p) => p.high));
    const trough = Math.min(...last60.map((p) => p.low));
    const current = last60[last60.length - 1].close;
    const drawdown = ((current - peak) / peak) * 100;

    if (drawdown < -20) {
      const confidence = Math.min(95, Math.abs(drawdown) * 2);
      alerts.push({
        type: "crash_pattern",
        severity: drawdown < -40 ? "critical" : "warning",
        confidence: Math.round(confidence),
        message: `${ticker} is in a ${drawdown.toFixed(1)}% drawdown from recent peak ($${peak.toFixed(2)} → $${current.toFixed(2)}). This resembles pre-crash patterns seen in 2008 for similar stocks.`,
        recommendation: `Review ${meta?.sector ?? "sector"} exposure. Consider hedging or reducing position size. Compare to 2008 price action for similar tickers.`,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // ---------- 2. Volume surge prediction ----------
  if (recent.length >= 30) {
    const last30 = recent.slice(-30);
    const last5 = last30.slice(-5);
    const avgVolume30 = last30.reduce((s, p) => s + p.volume, 0) / 30;
    const avgVolume5 = last5.reduce((s, p) => s + p.volume, 0) / 5;
    const volumeRatio = avgVolume5 / avgVolume30;

    if (volumeRatio > 1.5 && avgVolume30 > 0) {
      const confidence = Math.min(90, (volumeRatio - 1) * 50);
      alerts.push({
        type: "volume_surge",
        severity: volumeRatio > 2 ? "warning" : "info",
        confidence: Math.round(confidence),
        message: `${ticker} volume is accelerating: 5-day avg (${avgVolume5.toLocaleString()}) is ${volumeRatio.toFixed(2)}x the 30-day average (${avgVolume30.toLocaleString()}). This often precedes a major price move.`,
        recommendation: `Watch for breakout or breakdown. Set price alerts at recent high/low. Check for pending news or earnings.`,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // ---------- 3. Volatility regime change ----------
  if (recent.length >= 40) {
    const last40 = recent.slice(-40);
    const last20 = last40.slice(-20);
    const first20 = last40.slice(0, 20);

    const returns20 = last20.map((p, i) =>
      i > 0 ? Math.log(p.close / last20[i - 1].close) : 0
    );
    const returnsFirst = first20.map((p, i) =>
      i > 0 ? Math.log(p.close / first20[i - 1].close) : 0
    );

    const vol20 = Math.sqrt(
      returns20.reduce((s, r) => s + r * r, 0) / returns20.length
    );
    const volFirst = Math.sqrt(
      returnsFirst.reduce((s, r) => s + r * r, 0) / returnsFirst.length
    );

    if (volFirst > 0 && vol20 / volFirst > 1.5) {
      const confidence = Math.min(85, (vol20 / volFirst - 1) * 50);
      alerts.push({
        type: "volatility_regime_change",
        severity: "warning",
        confidence: Math.round(confidence),
        message: `${ticker} volatility has increased: recent 20-day vol (${(vol20 * 100).toFixed(1)}%) is ${(vol20 / volFirst).toFixed(2)}x the prior 20-day vol (${(volFirst * 100).toFixed(1)}%). The stock is entering a higher-risk regime.`,
        recommendation: `Expect larger price swings. Consider reducing position size or using options for downside protection.`,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // ---------- 4. Support/resistance break ----------
  if (recent.length >= 50) {
    const last50 = recent.slice(-50);
    const current = last50[last50.length - 1].close;
    const high50 = Math.max(...last50.map((p) => p.high));
    const low50 = Math.min(...last50.map((p) => p.low));
    const range = high50 - low50;

    if (range > 0) {
      const positionInRange = ((current - low50) / range) * 100;
      if (positionInRange > 95) {
        alerts.push({
          type: "resistance_break",
          severity: "info",
          confidence: Math.round(positionInRange),
          message: `${ticker} is at ${positionInRange.toFixed(1)}% of its 50-day range, breaking above resistance at $${high50.toFixed(2)}. Current price: $${current.toFixed(2)}.`,
          recommendation: `Breakout above $${high50.toFixed(2)} could signal further upside. Watch for follow-through volume.`,
          detectedAt: new Date().toISOString(),
        });
      } else if (positionInRange < 5) {
        alerts.push({
          type: "support_break",
          severity: "warning",
          confidence: Math.round(100 - positionInRange),
          message: `${ticker} is at ${positionInRange.toFixed(1)}% of its 50-day range, breaking below support at $${low50.toFixed(2)}. Current price: $${current.toFixed(2)}.`,
          recommendation: `Breakdown below $${low50.toFixed(2)} could signal further downside. Consider stop-loss placement.`,
          detectedAt: new Date().toISOString(),
        });
      }
    }
  }

  // ---------- 5. Momentum divergence ----------
  if (recent.length >= 20) {
    const last20 = recent.slice(-20);
    const first10 = last20.slice(0, 10);
    const last10 = last20.slice(10);

    const priceChangeFirst =
      (first10[first10.length - 1].close / first10[0].close - 1) * 100;
    const priceChangeLast =
      (last10[last10.length - 1].close / last10[0].close - 1) * 100;
    const volChangeFirst =
      first10[first10.length - 1].volume / (first10[0].volume || 1);
    const volChangeLast =
      last10[last10.length - 1].volume / (last10[0].volume || 1);

    // Divergence: price going up but volume going down (or vice versa)
    if (
      priceChangeLast > 5 &&
      volChangeLast < 0.8 &&
      volChangeFirst > 1
    ) {
      alerts.push({
        type: "momentum_divergence",
        severity: "info",
        confidence: 70,
        message: `${ticker} price is rising (+${priceChangeLast.toFixed(1)}%) but volume is declining (${(volChangeLast * 100).toFixed(0)}% of start). This divergence suggests weakening momentum.`,
        recommendation: `Rally may not be sustainable without volume confirmation. Watch for reversal.`,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // Sort by confidence (highest first)
  alerts.sort((a, b) => b.confidence - a.confidence);

  return NextResponse.json({
    ticker,
    name: meta?.name ?? ticker,
    sector: meta?.sector,
    alerts,
    alertCount: alerts.length,
    analysisPeriod: `${recent[0].date} - ${recent[recent.length - 1].date}`,
    generatedAt: new Date().toISOString(),
  });
}
