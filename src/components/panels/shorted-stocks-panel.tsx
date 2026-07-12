"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineageBadge } from "@/components/lineage-badge";
import { useYearStore } from "@/hooks/use-year-store";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";
import { AlertTriangle, TrendingDown, Skull } from "lucide-react";

interface ShortEntry {
  ticker: string;
  name: string;
  sector: string;
  shortPressureScore: number;
  turnoverRatio: number;
  priceDecline60d: number;
  downVolumeRatio: number;
  coveringSpikes: number;
  persistentPressureDays: number;
  estimatedShortInterest: number;
  nakedShortPressure: number;
  phantomVolume: number;
  rank: number;
}

function formatVolume(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toString();
}

function scoreColor(score: number): string {
  if (score >= 50) return "text-down";
  if (score >= 35) return "text-amber-400";
  return "text-muted-foreground";
}

export function ShortedStocksPanel() {
  const year = useYearStore((s) => s.year);
  const [entries, setEntries] = useState<ShortEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const selectTicker = useSelectedTicker((s) => s.select);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/shorted-stocks?year=${year}&limit=15`)
      .then((r) => r.json())
      .then((d) => setEntries(d.ranked ?? []))
      .finally(() => setLoading(false));
  }, [year]);

  return (
    <Card className="col-span-12 lg:col-span-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Skull className="h-4 w-4 text-down" />
          15 Most Shorted Stocks — {year}
          <LineageBadge jobId="ShortInterestProxy" jobTitle="Short Interest Proxy" stage="derived" />
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Price-volume proxy — includes naked short pressure & phantom volume estimation
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <ScrollArea className="h-[400px] pr-2">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b border-border z-10">
              <tr>
                <th className="px-1.5 py-1.5 text-left text-[10px] text-muted-foreground">#</th>
                <th className="px-1.5 py-1.5 text-left text-[10px] text-muted-foreground">Ticker</th>
                <th className="px-1.5 py-1.5 text-right text-[10px] text-muted-foreground">Pressure</th>
                <th className="px-1.5 py-1.5 text-right text-[10px] text-muted-foreground">Est. SI</th>
                <th className="px-1.5 py-1.5 text-right text-[10px] text-muted-foreground">60d Δ</th>
                <th className="px-1.5 py-1.5 text-right text-[10px] text-muted-foreground">Naked</th>
                <th className="px-1.5 py-1.5 text-right text-[10px] text-muted-foreground">Phantom Vol</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="text-center text-muted-foreground py-4">Loading…</td></tr>
              )}
              {!loading && entries.length === 0 && (
                <tr><td colSpan={7} className="text-center text-muted-foreground py-4">No data for {year}</td></tr>
              )}
              {!loading && entries.map((e) => (
                <tr
                  key={e.ticker}
                  onClick={() => selectTicker(e.ticker)}
                  className="border-b border-border/30 hover:bg-accent/30 cursor-pointer"
                >
                  <td className="px-1.5 py-1.5 text-[10px] text-muted-foreground">{e.rank}</td>
                  <td className="px-1.5 py-1.5">
                    <div className="font-mono font-bold text-xs">{e.ticker}</div>
                    <div className="text-[9px] text-muted-foreground truncate max-w-[120px]">{e.name}</div>
                  </td>
                  <td className={`px-1.5 py-1.5 text-right font-mono font-bold ${scoreColor(e.shortPressureScore)}`}>
                    {e.shortPressureScore}
                  </td>
                  <td className="px-1.5 py-1.5 text-right font-mono text-xs">
                    {e.estimatedShortInterest.toFixed(1)}%
                  </td>
                  <td className={`px-1.5 py-1.5 text-right font-mono text-[10px] ${e.priceDecline60d < 0 ? "text-down" : "text-up"}`}>
                    {e.priceDecline60d >= 0 ? "+" : ""}{e.priceDecline60d.toFixed(1)}%
                  </td>
                  <td className="px-1.5 py-1.5 text-right">
                    <span className={`font-mono text-[10px] ${e.nakedShortPressure >= 10 ? "text-down font-bold" : e.nakedShortPressure >= 5 ? "text-amber-400" : "text-muted-foreground"}`}>
                      {e.nakedShortPressure}
                    </span>
                  </td>
                  <td className="px-1.5 py-1.5 text-right font-mono text-[10px] text-muted-foreground">
                    {e.phantomVolume > 0 ? formatVolume(e.phantomVolume) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>

        {/* Disclaimer */}
        <div className="flex items-start gap-2 text-[10px] text-muted-foreground p-2 rounded bg-amber-500/5 border border-amber-500/20">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong>Disclaimer:</strong> Statistical proxy based on price-volume patterns, NOT actual FINRA short interest data.
            Naked shorting is illegal; this indicator flags unusual volume patterns that may warrant investigation.
          </span>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2 text-[9px] text-muted-foreground">
          <span><strong>Pressure:</strong> 0-100 short pressure score</span>
          <span><strong>Est. SI:</strong> estimated short interest % of float</span>
          <span><strong>Naked:</strong> phantom volume indicator (0-100)</span>
        </div>
      </CardContent>
    </Card>
  );
}
