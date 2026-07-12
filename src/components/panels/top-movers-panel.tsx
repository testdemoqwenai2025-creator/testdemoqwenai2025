"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineageBadge } from "@/components/lineage-badge";
import { useYearStore } from "@/hooks/use-year-store";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";
import { ArrowUp, ArrowDown, Activity } from "lucide-react";

interface MoverEntry {
  ticker: string;
  return_pct: number;
  total_volume: number;
  first_close: number;
  last_close: number;
  high: number;
  low: number;
  n_days: number;
}

interface TopMoversData {
  gainers: MoverEntry[];
  losers: MoverEntry[];
  active: MoverEntry[];
}

interface Response {
  data: TopMoversData;
  lineage: { job_id: string; title: string; stage: string } | null;
}

function formatVolume(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toString();
}

export function TopMoversPanel() {
  const year = useYearStore((s) => s.year);
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const selectTicker = useSelectedTicker((s) => s.select);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/top-movers?year=${year}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [year]);

  return (
    <Card className="col-span-12 lg:col-span-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          Top Movers
          {data?.lineage && (
            <LineageBadge
              jobId={data.lineage.job_id}
              jobTitle={data.lineage.title}
              stage={data.lineage.stage}
            />
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">Year {year} • top 10 by category</p>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs defaultValue="gainers">
          <TabsList className="grid w-full grid-cols-3 h-8">
            <TabsTrigger value="gainers" className="text-xs">
              <ArrowUp className="h-3 w-3 mr-1 text-up" /> Gainers
            </TabsTrigger>
            <TabsTrigger value="losers" className="text-xs">
              <ArrowDown className="h-3 w-3 mr-1 text-down" /> Losers
            </TabsTrigger>
            <TabsTrigger value="active" className="text-xs">
              <Activity className="h-3 w-3 mr-1 text-primary" /> Active
            </TabsTrigger>
          </TabsList>

          {(["gainers", "losers", "active"] as const).map((kind) => (
            <TabsContent key={kind} value={kind} className="mt-2">
              <ScrollArea className="h-[280px] pr-2">
                <div className="space-y-1">
                  {loading && (
                    <div className="text-xs text-muted-foreground p-4 text-center">
                      Loading…
                    </div>
                  )}
                  {!loading && data?.data[kind].map((m, i) => (
                    <button
                      key={m.ticker}
                      onClick={() => selectTicker(m.ticker)}
                      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-accent transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] text-muted-foreground w-4 text-right">
                          {i + 1}
                        </span>
                        <span className="font-mono font-bold text-sm w-12">
                          {m.ticker}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          ${m.last_close.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {kind === "active" ? (
                          <span className="font-mono text-muted-foreground">
                            {formatVolume(m.total_volume)}
                          </span>
                        ) : null}
                        <span
                          className={`font-mono font-semibold ${
                            m.return_pct >= 0 ? "text-up" : "text-down"
                          }`}
                        >
                          {m.return_pct >= 0 ? "+" : ""}
                          {m.return_pct.toFixed(1)}%
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
