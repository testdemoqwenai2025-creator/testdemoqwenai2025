"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineageBadge } from "@/components/lineage-badge";
import { useYearStore } from "@/hooks/use-year-store";

interface IndexPoint {
  date: number;
  year: number;
  avg_close: number;
  change_pct: number | null;
  avg_volume: number;
  total_volume: number;
  n_tickers: number;
  advancing: number;
  declining: number;
}

interface Response {
  data: IndexPoint[];
  lineage: { job_id: string; title: string; stage: string } | null;
}

function formatDate(yyyymmdd: number) {
  const s = String(yyyymmdd);
  return `${s.slice(4, 6)}/${s.slice(6)}`;
}

export function CompositeIndexChart() {
  const year = useYearStore((s) => s.year);
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/composite-index?year=${year}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [year]);

  const stats = useMemo(() => {
    if (!data?.data || data.data.length === 0) return null;
    const points = data.data;
    const first = points[0];
    const last = points[points.length - 1];
    const yearReturn = ((last.avg_close / first.avg_close) - 1) * 100;
    const high = Math.max(...points.map((p) => p.avg_close));
    const low = Math.min(...points.map((p) => p.avg_close));
    const advSum = points.reduce((s, p) => s + p.advancing, 0);
    const decSum = points.reduce((s, p) => s + p.declining, 0);
    const breadth = advSum - decSum;
    return {
      yearReturn,
      high,
      low,
      breadth,
      nDays: points.length,
    };
  }, [data]);

  return (
    <Card className="col-span-12 lg:col-span-8">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            Composite Market Index
            {data?.lineage && (
              <LineageBadge
                jobId={data.lineage.job_id}
                jobTitle={data.lineage.title}
                stage={data.lineage.stage}
              />
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Equal-weighted average daily close across {stats?.nDays ?? "—"} trading days
          </p>
        </div>
        {stats && (
          <div className="flex items-center gap-4 text-right">
            <Stat label={`${year} Return`} value={`${stats.yearReturn >= 0 ? "+" : ""}${stats.yearReturn.toFixed(2)}%`} positive={stats.yearReturn >= 0} />
            <Stat label="High" value={stats.high.toFixed(2)} />
            <Stat label="Low" value={stats.low.toFixed(2)} />
            <Stat
              label="Breadth"
              value={`${stats.breadth >= 0 ? "+" : ""}${stats.breadth.toLocaleString()}`}
              positive={stats.breadth >= 0}
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="h-[320px] flex items-center justify-center text-muted-foreground text-sm">
            Loading…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320} key={year}>
            <AreaChart data={data?.data ?? []} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="compositeGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.7 0.18 165)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="oklch(0.7 0.18 165)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="oklch(1 0 0 / 5%)" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fill: "oklch(0.65 0.015 240)" }}
                stroke="oklch(1 0 0 / 10%)"
                interval="preserveStartEnd"
                minTickGap={40}
                scale="linear"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "oklch(0.65 0.015 240)" }}
                stroke="oklch(1 0 0 / 10%)"
                domain={["auto", "auto"]}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "oklch(0.21 0.025 255)",
                  border: "1px solid oklch(1 0 0 / 10%)",
                  borderRadius: "6px",
                  fontSize: "11px",
                }}
                labelFormatter={(v) => {
                  const s = String(v);
                  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
                }}
                formatter={(value: number, name: string) => [
                  typeof value === "number" ? value.toFixed(2) : value,
                  name === "avg_close" ? "Avg Close" : name,
                ]}
              />
              <Area
                type="monotone"
                dataKey="avg_close"
                stroke="oklch(0.7 0.18 165)"
                strokeWidth={1.5}
                fill="url(#compositeGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  const color =
    positive === undefined
      ? ""
      : positive
      ? "text-up"
      : "text-down";
  return (
    <div className="flex flex-col items-end">
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      <span className={`font-mono text-sm font-semibold ${color}`}>{value}</span>
    </div>
  );
}
