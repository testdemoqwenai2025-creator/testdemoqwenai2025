"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineageBadge } from "@/components/lineage-badge";
import { useYearStore } from "@/hooks/use-year-store";
import { Loader2, ArrowRightCircle, ArrowDownCircle, MinusCircle } from "lucide-react";

interface SectorEntry {
  sector: string;
  currentVolume: number;
  previousVolume: number;
  volumeChangePct: number;
  avgReturn: number;
  momentumScore: number;
  signal: "INFLOW" | "OUTFLOW" | "NEUTRAL";
  tickerCount: number;
  topTickers: string[];
}

interface RotationResult {
  year: number;
  sectors: SectorEntry[];
  phase: string;
  phaseDescription: string;
  topInflow: SectorEntry[];
  topOutflow: SectorEntry[];
  interpretation: string;
}

const PHASE_COLORS: Record<string, string> = {
  RISK_ON: "text-up border-up/30 bg-up/10",
  RISK_OFF: "text-down border-down/30 bg-down/10",
  TRANSITIONING: "text-amber-400 border-amber-500/30 bg-amber-500/10",
};

const SIGNAL_ICONS = {
  INFLOW: ArrowRightCircle,
  OUTFLOW: ArrowDownCircle,
  NEUTRAL: MinusCircle,
};

const SIGNAL_COLORS = {
  INFLOW: "text-up",
  OUTFLOW: "text-down",
  NEUTRAL: "text-muted-foreground",
};

function formatVolume(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toString();
}

export function SectorRotationPanel() {
  const year = useYearStore((s) => s.year);
  const [data, setData] = useState<RotationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sector-rotation?year=${year}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [year]);

  return (
    <Card className="col-span-12 lg:col-span-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowRightCircle className="h-4 w-4 text-primary" />
          Sector Rotation Signals — {year}
          {data && <LineageBadge jobId="SectorRotation" jobTitle="Sector Rotation Detector" stage="derived" />}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tracks money flow between sectors — identifies Risk-On / Risk-Off phases
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {loading && (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Computing rotation…
          </div>
        )}

        {data && !loading && (
          <>
            {/* Phase banner */}
            <div className={`p-3 rounded-md border ${PHASE_COLORS[data.phase] ?? ""}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-sm uppercase">{data.phase.replace(/_/g, " ")}</span>
              </div>
              <p className="text-[11px] leading-relaxed">{data.phaseDescription}</p>
            </div>

            {/* Top inflow / outflow */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded border border-up/20 bg-up/5">
                <div className="text-[10px] uppercase text-up mb-1">Top Inflow</div>
                {data.topInflow.length > 0 ? (
                  data.topInflow.map((s) => (
                    <div key={s.sector} className="text-xs">
                      <span className="font-mono font-bold">{s.sector}</span>
                      <span className="text-up ml-1">+{s.volumeChangePct}%</span>
                    </div>
                  ))
                ) : (
                  <div className="text-[10px] text-muted-foreground">None detected</div>
                )}
              </div>
              <div className="p-2 rounded border border-down/20 bg-down/5">
                <div className="text-[10px] uppercase text-down mb-1">Top Outflow</div>
                {data.topOutflow.length > 0 ? (
                  data.topOutflow.map((s) => (
                    <div key={s.sector} className="text-xs">
                      <span className="font-mono font-bold">{s.sector}</span>
                      <span className="text-down ml-1">{s.volumeChangePct}%</span>
                    </div>
                  ))
                ) : (
                  <div className="text-[10px] text-muted-foreground">None detected</div>
                )}
              </div>
            </div>

            {/* Full sector table */}
            <ScrollArea className="h-[280px] pr-2">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card border-b border-border z-10">
                  <tr>
                    <th className="px-1.5 py-1.5 text-left text-[10px] text-muted-foreground">Sector</th>
                    <th className="px-1.5 py-1.5 text-right text-[10px] text-muted-foreground">Vol Δ</th>
                    <th className="px-1.5 py-1.5 text-right text-[10px] text-muted-foreground">Return</th>
                    <th className="px-1.5 py-1.5 text-right text-[10px] text-muted-foreground">Momentum</th>
                    <th className="px-1.5 py-1.5 text-center text-[10px] text-muted-foreground">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sectors.map((s) => {
                    const Icon = SIGNAL_ICONS[s.signal];
                    return (
                      <tr key={s.sector} className="border-b border-border/30 hover:bg-accent/20">
                        <td className="px-1.5 py-1.5">
                          <div className="font-mono text-[11px] font-bold">{s.sector}</div>
                          <div className="text-[9px] text-muted-foreground">
                            {s.tickerCount} tickers · {formatVolume(s.currentVolume)}/mo
                          </div>
                        </td>
                        <td className={`px-1.5 py-1.5 text-right font-mono text-[10px] ${s.volumeChangePct >= 0 ? "text-up" : "text-down"}`}>
                          {s.volumeChangePct >= 0 ? "+" : ""}{s.volumeChangePct}%
                        </td>
                        <td className={`px-1.5 py-1.5 text-right font-mono text-[10px] ${s.avgReturn >= 0 ? "text-up" : "text-down"}`}>
                          {s.avgReturn >= 0 ? "+" : ""}{s.avgReturn}%
                        </td>
                        <td className="px-1.5 py-1.5 text-right font-mono text-[10px] font-bold">
                          {s.momentumScore > 0 ? "+" : ""}{s.momentumScore}
                        </td>
                        <td className="px-1.5 py-1.5 text-center">
                          <Icon className={`h-3.5 w-3.5 mx-auto ${SIGNAL_COLORS[s.signal]}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
