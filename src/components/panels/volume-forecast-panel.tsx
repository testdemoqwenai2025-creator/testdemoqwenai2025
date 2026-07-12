"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineageBadge } from "@/components/lineage-badge";
import { BarChart3, Search, Loader2, Calendar } from "lucide-react";

interface VolForecastDay {
  date: number;
  dayOfWeek: string;
  predictedVolume: number;
  dayOfWeekFactor: number;
  isOptionsExpiry: boolean;
  trendAdjustment: number;
  confidence: number;
}

interface VolForecastResult {
  ticker: string;
  name: string;
  baselineVolume: number;
  volumeTrend: string;
  volumeTrendPct: number;
  dayOfWeekFactors: Record<string, number>;
  forecastDays: VolForecastDay[];
  summary: {
    avgPredictedVolume: number;
    avgConfidence: number;
    methodology: string;
    toleranceNote: string;
  };
}

function formatVolume(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toString();
}

function formatDate(yyyymmdd: number) {
  const s = String(yyyymmdd);
  return `${s.slice(4, 6)}/${s.slice(6)}`;
}

export function VolumeForecastPanel() {
  const [ticker, setTicker] = useState("GE");
  const [data, setData] = useState<VolForecastResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    generate(ticker);
  }, []);

  async function generate(t: string) {
    if (!t.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/volume-forecast?ticker=${encodeURIComponent(t)}&days=30`);
      const json = await res.json();
      if (json.error) setError(json.error);
      else setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Find max volume for bar scaling
  const maxVol = data ? Math.max(...data.forecastDays.map((d) => d.predictedVolume)) : 1;

  return (
    <Card className="col-span-12 lg:col-span-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Volume Forecast — 30 Day Outlook
          {data && (
            <LineageBadge jobId="VolumeForecaster" jobTitle="Volume Forecast (0.01% tolerance)" stage="derived" />
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Predicted daily volume with day-of-week + options-expiry detection. Tolerance: 0.01%
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex gap-2">
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && generate(ticker)}
            placeholder="Ticker"
            className="h-8 text-xs font-mono max-w-[150px]"
          />
          <Button onClick={() => generate(ticker)} disabled={loading} size="sm" className="h-8 px-3">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
          </Button>
        </div>

        {error && (
          <div className="text-xs text-down p-2 rounded border border-down/30 bg-down/10">{error}</div>
        )}

        {data && !loading && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded border border-border">
                <div className="text-[10px] uppercase text-muted-foreground">Baseline</div>
                <div className="font-mono text-xs font-bold">{formatVolume(data.baselineVolume)}</div>
              </div>
              <div className="p-2 rounded border border-border">
                <div className="text-[10px] uppercase text-muted-foreground">Trend</div>
                <div className={`font-mono text-xs font-bold ${data.volumeTrend === "increasing" ? "text-up" : data.volumeTrend === "decreasing" ? "text-down" : ""}`}>
                  {data.volumeTrend} ({data.volumeTrendPct > 0 ? "+" : ""}{data.volumeTrendPct}%)
                </div>
              </div>
              <div className="p-2 rounded border border-border">
                <div className="text-[10px] uppercase text-muted-foreground">Avg Conf</div>
                <div className="font-mono text-xs font-bold">{data.summary.avgConfidence}%</div>
              </div>
            </div>

            {/* Day-of-week factors */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground">Day factors:</span>
              {Object.entries(data.dayOfWeekFactors).map(([day, factor]) => (
                <Badge key={day} variant="outline" className={`text-[9px] font-mono ${factor >= 1 ? "text-up" : "text-down"}`}>
                  {day} {factor.toFixed(2)}x
                </Badge>
              ))}
            </div>

            {/* Forecast table with visual bars */}
            <ScrollArea className="h-[280px] pr-2">
              <div className="space-y-1">
                {data.forecastDays.map((day, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-[10px] text-muted-foreground w-8">{day.dayOfWeek}</span>
                    <span className="font-mono text-[10px] w-10">{formatDate(day.date)}</span>
                    <div className="flex-1 relative h-5 bg-muted/20 rounded">
                      <div
                        className="absolute h-5 rounded bg-primary/40 flex items-center justify-end px-1.5"
                        style={{ width: `${(day.predictedVolume / maxVol) * 100}%` }}
                      >
                        <span className="text-[9px] font-mono text-primary-foreground whitespace-nowrap">
                          {formatVolume(day.predictedVolume)}
                        </span>
                      </div>
                      {day.isOptionsExpiry && (
                        <span className="absolute right-1 top-0 text-[8px] text-amber-400 font-bold">★EXPIRY</span>
                      )}
                    </div>
                    <span className={`text-[9px] font-mono w-8 text-right ${day.confidence >= 70 ? "text-up" : day.confidence >= 50 ? "text-amber-400" : "text-down"}`}>
                      {day.confidence}%
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Tolerance note */}
            <div className="text-[10px] text-muted-foreground italic p-1.5 rounded bg-muted/10">
              {data.summary.toleranceNote}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
