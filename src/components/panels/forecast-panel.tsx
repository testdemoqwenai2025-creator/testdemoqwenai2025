"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineageBadge } from "@/components/lineage-badge";
import {
  TrendingUp, TrendingDown, Minus, Search, Loader2, AlertTriangle,
  Calendar, Target, Gauge, BarChart3,
} from "lucide-react";

interface DayForecast {
  date: number;
  dayOfWeek: string;
  expectedOpen: number;
  forecastLow: number;
  forecastHigh: number;
  expectedClose: number;
  rangePercent: number;
  confidence: number;
  trend: "up" | "down" | "flat";
  weekNumber: number;
}

interface ForecastResult {
  ticker: string;
  name: string;
  startDate: number;
  endDate: number;
  forecastDays: DayForecast[];
  summary: {
    avgDailyRange: number;
    avgConfidence: number;
    trendDirection: "up" | "down" | "flat";
    trendStrength: number;
    volatilityRegime: "low" | "normal" | "high" | "extreme";
    baselinePrice: number;
    twelveMonthTarget: number;
    twelveMonthRange: { low: number; high: number };
    excludedOutliers: number;
    methodology: string;
  };
  warnings: string[];
}

function formatDate(yyyymmdd: number) {
  const s = String(yyyymmdd);
  return `${s.slice(4, 6)}/${s.slice(6)}/${s.slice(2, 4)}`;
}

const TREND_ICONS = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

const TREND_COLORS = {
  up: "text-up",
  down: "text-down",
  flat: "text-muted-foreground",
};

const VOL_COLORS = {
  low: "text-up border-up/30 bg-up/10",
  normal: "text-primary border-primary/30 bg-primary/10",
  high: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  extreme: "text-down border-down/30 bg-down/10",
};

export function ForecastPanel() {
  const [ticker, setTicker] = useState("GE");
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"daily" | "weekly">("daily");

  useEffect(() => {
    generate(ticker);
  }, []);

  async function generate(t: string) {
    if (!t.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/forecast?ticker=${encodeURIComponent(t)}&months=12`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Group days by week for weekly view
  const weeklyData = result?.forecastDays.reduce((acc, day) => {
    if (!acc[day.weekNumber]) acc[day.weekNumber] = [];
    acc[day.weekNumber].push(day);
    return acc;
  }, {} as Record<number, DayForecast[]>) ?? {};

  return (
    <Card className="col-span-12">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Daily Range Forecast — 12 Month Outlook
            {result && (
              <LineageBadge
                jobId="StatisticalForecaster"
                jobTitle="Statistical Range Forecaster"
                stage="derived"
              />
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Most likely intraday range per trading day — a "no significant news" baseline for day traders
          </p>
        </div>
        {result && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setView("daily")}
              className={`px-2 py-0.5 rounded text-[10px] font-mono ${view === "daily" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground"}`}
            >
              Daily
            </button>
            <button
              onClick={() => setView("weekly")}
              className={`px-2 py-0.5 rounded text-[10px] font-mono ${view === "weekly" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground"}`}
            >
              Weekly
            </button>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Ticker input */}
        <div className="flex gap-2">
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && generate(ticker)}
            placeholder="Ticker (e.g. GE, F, BAC)"
            className="h-8 text-xs font-mono max-w-[200px]"
          />
          <Button onClick={() => generate(ticker)} disabled={loading} size="sm" className="h-8 px-3">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
            <span className="ml-1 text-xs">Forecast</span>
          </Button>
        </div>

        {error && (
          <div className="text-xs text-down p-2 rounded border border-down/30 bg-down/10">
            {error}
          </div>
        )}

        {/* Summary stats */}
        {result && !loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            <StatBox
              icon={Calendar}
              label="Baseline"
              value={`$${result.summary.baselinePrice.toFixed(2)}`}
            />
            <StatBox
              icon={Target}
              label="12mo Target"
              value={`$${result.summary.twelveMonthTarget.toFixed(2)}`}
              positive={result.summary.twelveMonthTarget >= result.summary.baselinePrice}
            />
            <StatBox
              icon={BarChart3}
              label="12mo Range"
              value={`$${result.summary.twelveMonthRange.low.toFixed(2)}-$${result.summary.twelveMonthRange.high.toFixed(2)}`}
            />
            <StatBox
              icon={Gauge}
              label="Avg Range"
              value={`${result.summary.avgDailyRange}%/day`}
            />
            <StatBox
              icon={Gauge}
              label="Confidence"
              value={`${result.summary.avgConfidence}%`}
            />
            <div className="flex flex-col gap-1 p-2 rounded-md border border-border">
              <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
                <TrendingUp className="h-2.5 w-2.5" />
                Trend
              </div>
              <div className="flex items-center gap-1">
                {(() => {
                  const Icon = TREND_ICONS[result.summary.trendDirection];
                  return <Icon className={`h-3 w-3 ${TREND_COLORS[result.summary.trendDirection]}`} />;
                })()}
                <span className={`font-mono text-xs font-semibold ${TREND_COLORS[result.summary.trendDirection]}`}>
                  {result.summary.trendStrength > 0 ? "+" : ""}
                  {result.summary.trendStrength.toFixed(1)}%/yr
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Volatility regime + outliers */}
        {result && !loading && (
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] ${VOL_COLORS[result.summary.volatilityRegime]}`}>
              {result.summary.volatilityRegime} volatility
            </Badge>
            {result.summary.excludedOutliers > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {result.summary.excludedOutliers} news days excluded
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">
              {result.forecastDays.length} trading days forecast
            </Badge>
          </div>
        )}

        {/* Warnings */}
        {result && !loading && result.warnings.length > 0 && (
          <div className="space-y-1">
            {result.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] text-muted-foreground p-1.5 rounded bg-muted/20">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-400" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Forecast table */}
        {result && !loading && view === "daily" && (
          <div className="rounded-md border border-border overflow-hidden">
            <div className="max-h-[400px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card border-b border-border z-10">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-[10px] text-muted-foreground">Date</th>
                    <th className="px-2 py-1.5 text-left text-[10px] text-muted-foreground">Day</th>
                    <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">Open</th>
                    <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">Low</th>
                    <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">High</th>
                    <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">Close</th>
                    <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">Range</th>
                    <th className="px-2 py-1.5 text-center text-[10px] text-muted-foreground">Visual Range</th>
                    <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">Conf</th>
                  </tr>
                </thead>
                <tbody>
                  {result.forecastDays.map((day, i) => {
                    const Icon = TREND_ICONS[day.trend];
                    // Visual range bar: low -------- high relative to week's range
                    const weekDays = weeklyData[day.weekNumber] ?? [day];
                    const weekMin = Math.min(...weekDays.map((d) => d.forecastLow));
                    const weekMax = Math.max(...weekDays.map((d) => d.forecastHigh));
                    const weekRange = weekMax - weekMin || 1;
                    const lowPos = ((day.forecastLow - weekMin) / weekRange) * 100;
                    const highPos = ((day.forecastHigh - weekMin) / weekRange) * 100;
                    const openPos = ((day.expectedOpen - weekMin) / weekRange) * 100;

                    return (
                      <tr
                        key={i}
                        className={`border-b border-border/30 hover:bg-accent/20 ${day.dayOfWeek === "Mon" ? "border-t border-border" : ""}`}
                      >
                        <td className="px-2 py-1 font-mono text-[11px]">{formatDate(day.date)}</td>
                        <td className="px-2 py-1 text-[11px] text-muted-foreground">{day.dayOfWeek}</td>
                        <td className="px-2 py-1 text-right font-mono text-[11px]">${day.expectedOpen.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-mono text-[11px] text-down">${day.forecastLow.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-mono text-[11px] text-up">${day.forecastHigh.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-mono text-[11px]">
                          <span className="flex items-center justify-end gap-0.5">
                            <Icon className={`h-2.5 w-2.5 ${TREND_COLORS[day.trend]}`} />
                            ${day.expectedClose.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-[10px] text-muted-foreground">{day.rangePercent}%</td>
                        <td className="px-2 py-1">
                          <div className="relative h-3 bg-muted/20 rounded">
                            <div
                              className="absolute h-3 rounded bg-primary/30"
                              style={{ left: `${lowPos}%`, width: `${highPos - lowPos}%` }}
                            />
                            <div
                              className="absolute w-0.5 h-3 bg-foreground/60"
                              style={{ left: `${openPos}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-[10px]">
                          <span className={day.confidence >= 75 ? "text-up" : day.confidence >= 60 ? "text-amber-400" : "text-down"}>
                            {day.confidence}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Weekly summary view */}
        {result && !loading && view === "weekly" && (
          <div className="rounded-md border border-border overflow-hidden">
            <div className="max-h-[400px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card border-b border-border z-10">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-[10px] text-muted-foreground">Week</th>
                    <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">Start</th>
                    <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">End</th>
                    <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">Wk Low</th>
                    <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">Wk High</th>
                    <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">Range</th>
                    <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground">Avg Conf</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(weeklyData).map(([weekNum, days]) => {
                    const weekLow = Math.min(...days.map((d) => d.forecastLow));
                    const weekHigh = Math.max(...days.map((d) => d.forecastHigh));
                    const avgConf = Math.round(days.reduce((s, d) => s + d.confidence, 0) / days.length);
                    const startOpen = days[0].expectedOpen;
                    const endClose = days[days.length - 1].expectedClose;
                    return (
                      <tr key={weekNum} className="border-b border-border/30 hover:bg-accent/20">
                        <td className="px-2 py-1 font-mono text-[11px]">W{weekNum}</td>
                        <td className="px-2 py-1 text-right font-mono text-[11px]">${startOpen.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-mono text-[11px]">${endClose.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-mono text-[11px] text-down">${weekLow.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-mono text-[11px] text-up">${weekHigh.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right font-mono text-[10px] text-muted-foreground">
                          {((weekHigh - weekLow) / startOpen * 100).toFixed(1)}%
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-[10px]">
                          <span className={avgConf >= 75 ? "text-up" : avgConf >= 60 ? "text-amber-400" : "text-down"}>
                            {avgConf}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Methodology footer */}
        {result && !loading && (
          <div className="text-[10px] text-muted-foreground italic p-2 rounded bg-muted/10">
            <strong>Methodology:</strong> {result.summary.methodology}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatBox({
  icon: Icon,
  label,
  value,
  positive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  positive?: boolean;
}) {
  const color = positive === undefined ? "" : positive ? "text-up" : "text-down";
  return (
    <div className="flex flex-col gap-0.5 p-2 rounded-md border border-border">
      <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
        <Icon className="h-2.5 w-2.5" />
        {label}
      </div>
      <span className={`font-mono text-xs font-semibold ${color}`}>{value}</span>
    </div>
  );
}
