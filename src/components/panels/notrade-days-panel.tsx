"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineageBadge } from "@/components/lineage-badge";
import { useYearStore } from "@/hooks/use-year-store";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";
import { CalendarOff } from "lucide-react";

interface NoTradeYear {
  year: number;
  first_day: number;
  last_day: number;
  n_trading_days: number;
  top_silent: {
    ticker: string;
    n_missing: number;
    first_missing: number;
    last_missing: number;
  }[];
}

interface Response {
  data: NoTradeYear | null;
  lineage: { job_id: string; title: string; stage: string } | null;
}

function formatDate(yyyymmdd: number) {
  const s = String(yyyymmdd);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
}

export function NoTradeDaysPanel() {
  const year = useYearStore((s) => s.year);
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const selectTicker = useSelectedTicker((s) => s.select);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/notrade-days?year=${year}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [year]);

  const d = data?.data;

  return (
    <Card className="col-span-12 lg:col-span-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarOff className="h-4 w-4 text-amber-400" />
          No-Trade Days
          {data?.lineage && (
            <LineageBadge
              jobId={data.lineage.job_id}
              jobTitle={data.lineage.title}
              stage={data.lineage.stage}
            />
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {year} • {d?.n_trading_days ?? "—"} trading days • top tickers with most missing days
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
            {!loading && d?.top_silent.length === 0 && (
              <div className="text-xs text-muted-foreground p-4 text-center">
                No missing days detected.
              </div>
            )}
            {!loading && d?.top_silent.map((s, i) => (
              <button
                key={s.ticker}
                onClick={() => selectTicker(s.ticker)}
                className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-accent transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}</span>
                  <span className="font-mono font-bold text-sm w-14">{s.ticker}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground font-mono">
                    {formatDate(s.first_missing)} → {formatDate(s.last_missing)}
                  </span>
                  <span className="font-mono font-bold text-amber-400">
                    {s.n_missing}d
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
