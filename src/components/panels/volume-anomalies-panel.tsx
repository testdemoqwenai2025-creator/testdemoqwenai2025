"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineageBadge } from "@/components/lineage-badge";
import { useYearStore } from "@/hooks/use-year-store";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";
import { Flame } from "lucide-react";

interface Anomaly {
  ticker: string;
  date: number;
  volume: number;
  avg_30d: number;
  ratio: number;
  close: number;
}

interface Response {
  data: Anomaly[];
  lineage: { job_id: string; title: string; stage: string } | null;
}

function formatDate(yyyymmdd: number) {
  const s = String(yyyymmdd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
}

function formatVolume(v: number) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toString();
}

export function VolumeAnomaliesPanel() {
  const year = useYearStore((s) => s.year);
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const selectTicker = useSelectedTicker((s) => s.select);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/volume-anomalies?year=${year}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [year]);

  return (
    <Card className="col-span-12 lg:col-span-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-400" />
          Volume Anomalies
          {data?.lineage && (
            <LineageBadge
              jobId={data.lineage.job_id}
              jobTitle={data.lineage.title}
              stage={data.lineage.stage}
            />
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {year} • Top volume spikes ≥ 5× the 30-day rolling average
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[260px] pr-2">
          <div className="space-y-1">
            {loading && (
              <div className="text-xs text-muted-foreground p-4 text-center">
                Loading…
              </div>
            )}
            {!loading && data?.data.length === 0 && (
              <div className="text-xs text-muted-foreground p-4 text-center">
                No anomalies above threshold.
              </div>
            )}
            {!loading && data?.data.map((a, i) => (
              <button
                key={`${a.ticker}-${a.date}`}
                onClick={() => selectTicker(a.ticker)}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-accent transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}</span>
                  <span className="font-mono font-bold text-sm w-12">{a.ticker}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatDate(a.date)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-mono text-muted-foreground">
                    {formatVolume(a.volume)}
                  </span>
                  <span className="text-muted-foreground">vs</span>
                  <span className="font-mono text-muted-foreground">
                    {formatVolume(a.avg_30d)}
                  </span>
                  <span className="font-mono font-bold text-orange-400">
                    {a.ratio.toFixed(1)}×
                  </span>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
