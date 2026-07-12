"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineageBadge } from "@/components/lineage-badge";
import { useYearStore } from "@/hooks/use-year-store";
import {
  TrendingUp, TrendingDown, Search, Loader2, AlertTriangle,
  BarChart3, Activity, Target,
} from "lucide-react";

interface LiveDeviation {
  ticker: string;
  name: string;
  actualDate: number;
  actualOpen: number;
  actualHigh: number;
  actualLow: number;
  actualClose: number;
  actualVolume: number;
  forecastLow: number;
  forecastHigh: number;
  forecastOpen: number;
  forecastClose: number;
  forecastVolume: number;
  priceDeviation: number;
  volumeDeviation: number;
  volumeDeviationCategory: string;
  status: string;
  interpretation: string;
}

const STATUS_COLORS: Record<string, string> = {
  normal: "text-up border-up/30 bg-up/10",
  elevated: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  breakout_up: "text-up border-up/40 bg-up/20",
  breakout_down: "text-down border-down/40 bg-down/20",
  volume_anomaly: "text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/10",
};

const VOL_CAT_COLORS: Record<string, string> = {
  exact: "text-up",
  tight: "text-up",
  normal: "text-primary",
  wide: "text-amber-400",
  anomaly: "text-down",
};

function formatVolume(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toString();
}

function formatDate(yyyymmdd: number) {
  const s = String(yyyymmdd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
}

export function LiveDeviationPanel() {
  const [ticker, setTicker] = useState("GE");
  const [data, setData] = useState<LiveDeviation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyze(ticker);
  }, []);

  async function analyze(t: string) {
    if (!t.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/live-deviation?ticker=${encodeURIComponent(t)}`);
      const json = await res.json();
      if (json.error) setError(json.error);
      else setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="col-span-12 lg:col-span-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Live Deviation Monitor
          {data && (
            <LineageBadge jobId="LiveDeviation" jobTitle="Live Deviation from Forecast" stage="derived" />
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Compares actual price/volume to forecast — flags when something material is happening
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex gap-2">
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && analyze(ticker)}
            placeholder="Ticker"
            className="h-8 text-xs font-mono max-w-[150px]"
          />
          <Button onClick={() => analyze(ticker)} disabled={loading} size="sm" className="h-8 px-3">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
          </Button>
        </div>

        {error && (
          <div className="text-xs text-down p-2 rounded border border-down/30 bg-down/10">{error}</div>
        )}

        {data && !loading && (
          <>
            {/* Status banner */}
            <div className={`p-3 rounded-md border ${STATUS_COLORS[data.status] ?? ""}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-sm uppercase">{data.status.replace(/_/g, " ")}</span>
                <span className="text-[10px] text-muted-foreground">{formatDate(data.actualDate)}</span>
              </div>
              <p className="text-[11px] leading-relaxed">{data.interpretation}</p>
            </div>

            {/* Actual vs Forecast */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border p-2">
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Actual</div>
                <div className="space-y-0.5 text-xs font-mono">
                  <div className="flex justify-between"><span className="text-muted-foreground">Open:</span> ${data.actualOpen.toFixed(2)}</div>
                  <div className="flex justify-between"><span className="text-muted-foreground">High:</span> <span className="text-up">${data.actualHigh.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Low:</span> <span className="text-down">${data.actualLow.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Close:</span> ${data.actualClose.toFixed(2)}</div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Volume:</span> {formatVolume(data.actualVolume)}</div>
                </div>
              </div>
              <div className="rounded-md border border-border p-2">
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Forecast</div>
                <div className="space-y-0.5 text-xs font-mono">
                  <div className="flex justify-between"><span className="text-muted-foreground">Open:</span> ${data.forecastOpen.toFixed(2)}</div>
                  <div className="flex justify-between"><span className="text-muted-foreground">High:</span> ${data.forecastHigh.toFixed(2)}</div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Low:</span> ${data.forecastLow.toFixed(2)}</div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Close:</span> ${data.forecastClose.toFixed(2)}</div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Volume:</span> {formatVolume(data.forecastVolume)}</div>
                </div>
              </div>
            </div>

            {/* Deviations */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border p-2">
                <div className="text-[10px] uppercase text-muted-foreground">Price Deviation</div>
                <div className={`font-mono text-lg font-bold ${data.priceDeviation >= 0 ? "text-up" : "text-down"}`}>
                  {data.priceDeviation >= 0 ? "+" : ""}{data.priceDeviation.toFixed(2)}%
                </div>
              </div>
              <div className="rounded-md border border-border p-2">
                <div className="text-[10px] uppercase text-muted-foreground">Volume Deviation</div>
                <div className={`font-mono text-lg font-bold ${VOL_CAT_COLORS[data.volumeDeviationCategory] ?? ""}`}>
                  {data.volumeDeviation >= 0 ? "+" : ""}{data.volumeDeviation.toFixed(2)}%
                </div>
                <Badge variant="outline" className={`text-[9px] mt-1 ${VOL_CAT_COLORS[data.volumeDeviationCategory] ?? ""}`}>
                  {data.volumeDeviationCategory}
                </Badge>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
