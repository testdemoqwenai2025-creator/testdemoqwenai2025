"use client";

import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineageBadge } from "@/components/lineage-badge";
import { useYearStore } from "@/hooks/use-year-store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HeatmapCell {
  sector: string;
  year: number;
  avg_monthly_volume: number;
  yoy_pct: number | null;
  n_tickers: number;
}

interface Response {
  data: {
    sectors: string[];
    years: number[];
    cells: HeatmapCell[];
  };
  lineage: { job_id: string; title: string; stage: string } | null;
}

function formatVolume(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toString();
}

function colorForYoY(yoy: number | null) {
  if (yoy == null) return "oklch(0.25 0.02 255 / 0.3)";
  // Symmetric diverging scale: -50% and +50% are the extremes.
  const clamped = Math.max(-50, Math.min(50, yoy)) / 50;
  if (clamped >= 0) {
    // green for positive
    const l = 0.25 + clamped * 0.35;
    return `oklch(${l} 0.18 145)`;
  } else {
    // red for negative
    const l = 0.25 + Math.abs(clamped) * 0.35;
    return `oklch(${l} 0.22 25)`;
  }
}

export function SectorHeatmapPanel() {
  const year = useYearStore((s) => s.year);
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sector-heatmap`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  const cellMap = useMemo(() => {
    const m = new Map<string, HeatmapCell>();
    data?.data.cells.forEach((c) => m.set(`${c.sector}|${c.year}`, c));
    return m;
  }, [data]);

  const sectors = data?.data.sectors ?? [];
  const years = data?.data.years ?? [];

  return (
    <Card className="col-span-12">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            Sector × Year Volume Heatmap
            {data?.lineage && (
              <LineageBadge
                jobId={data.lineage.job_id}
                jobTitle={data.lineage.title}
                stage={data.lineage.stage}
              />
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Average monthly trade volume by sector. Selected year {year} highlighted.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>-50%</span>
          <div className="w-32 h-2 rounded-full" style={{
            background: "linear-gradient(to right, oklch(0.6 0.22 25), oklch(0.25 0.02 255), oklch(0.6 0.18 145))"
          }} />
          <span>+50%</span>
          <span className="ml-2">YoY change</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 overflow-x-auto">
        {loading ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            Loading…
          </div>
        ) : (
          <div className="min-w-[800px]">
            {/* Year headers */}
            <div
              className="grid gap-px mb-px"
              style={{ gridTemplateColumns: `140px repeat(${years.length}, 1fr)` }}
            >
              <div />
              {years.map((y) => (
                <div
                  key={y}
                  className={`text-[10px] font-mono text-center py-1 ${
                    y === year ? "text-primary font-bold" : "text-muted-foreground"
                  }`}
                >
                  {String(y).slice(2)}
                </div>
              ))}
            </div>
            {/* Sectors */}
            {sectors.map((sector) => (
              <div
                key={sector}
                className="grid gap-px mb-px"
                style={{ gridTemplateColumns: `140px repeat(${years.length}, 1fr)` }}
              >
                <div className="text-xs text-muted-foreground pr-2 py-1 truncate" title={sector}>
                  {sector}
                </div>
                {years.map((y) => {
                  const cell = cellMap.get(`${sector}|${y}`);
                  const isSel = y === year;
                  return (
                    <TooltipProvider key={y} delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={`h-7 rounded-sm flex items-center justify-center text-[9px] font-mono cursor-default transition-all ${
                              isSel ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""
                            }`}
                            style={{
                              backgroundColor: colorForYoY(cell?.yoy_pct ?? null),
                            }}
                          >
                            {cell && cell.avg_monthly_volume > 0 && (
                              <span className="text-white/80">
                                {formatVolume(cell.avg_monthly_volume)}
                              </span>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          <div className="font-mono font-bold">{sector} • {y}</div>
                          {cell ? (
                            <>
                              <div>Vol: {formatVolume(cell.avg_monthly_volume)}/mo</div>
                              <div>YoY: {cell.yoy_pct != null ? `${cell.yoy_pct >= 0 ? "+" : ""}${cell.yoy_pct.toFixed(1)}%` : "—"}</div>
                              <div>Tickers: {cell.n_tickers}</div>
                            </>
                          ) : (
                            <div>No data</div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
