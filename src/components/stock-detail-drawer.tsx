"use client";

import { useEffect, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  CandlestickChart,
} from "recharts";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineageBadge } from "@/components/lineage-badge";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";
import { useYearStore } from "@/hooks/use-year-store";
import { X, Building2, TrendingUp, Activity, DollarSign } from "lucide-react";

interface TickerMeta {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  ipoyear: number | null;
  marketcap: number | null;
  first_date: number;
  last_date: number;
  first_close: number;
  last_close: number;
  total_volume: number;
  trading_days: number;
  total_return_pct: number | null;
}

interface DailyPoint {
  date: number;
  year: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Response {
  data: { meta: TickerMeta | null; series: DailyPoint[] };
  lineage: { job_id: string; title: string; stage: string } | null;
}

function formatDate(yyyymmdd: number) {
  const s = String(yyyymmdd);
  return `${s.slice(4, 6)}/${s.slice(6)}/${s.slice(2, 4)}`;
}

function formatVolume(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toString();
}

function formatMarketcap(v: number | null) {
  if (v == null) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

const RANGES = [
  { label: "1M", days: 22 },
  { label: "3M", days: 66 },
  { label: "6M", days: 132 },
  { label: "YTD", ytd: true },
  { label: "1Y", days: 252 },
  { label: "MAX", all: true },
];

export function StockDetailDrawer() {
  const { ticker, isOpen, close } = useSelectedTicker();
  const year = useYearStore((s) => s.year);
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<string>("YTD");

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    fetch(`/api/stock/${encodeURIComponent(ticker)}?year=${year}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [ticker, year]);

  const filteredSeries = useMemo(() => {
    if (!data?.data.series) return [];
    const series = data.data.series;
    const r = RANGES.find((r) => r.label === range);
    if (!r) return series;
    if (r.all) return series;
    if (r.ytd) return series; // year already filtered by API
    return series.slice(-r.days!);
  }, [data, range]);

  const stats = useMemo(() => {
    const s = filteredSeries;
    if (s.length === 0) return null;
    const first = s[0];
    const last = s[s.length - 1];
    const periodReturn = ((last.close / first.close) - 1) * 100;
    const high = Math.max(...s.map((p) => p.high));
    const low = Math.min(...s.map((p) => p.low));
    const avgVol = s.reduce((sum, p) => sum + p.volume, 0) / s.length;
    return { first, last, periodReturn, high, low, avgVol, n: s.length };
  }, [filteredSeries]);

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SheetTitle className="font-mono text-xl">{ticker}</SheetTitle>
              {data?.data.meta && (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {data.data.meta.sector}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {data.data.meta.industry}
                  </Badge>
                </div>
              )}
            </div>
            {data?.lineage && (
              <LineageBadge
                jobId={data.lineage.job_id}
                jobTitle={data.lineage.title}
                stage={data.lineage.stage}
              />
            )}
          </div>
          <SheetDescription className="text-sm">
            {data?.data.meta?.name ?? "—"}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-4">
            {/* Range tabs */}
            <div className="flex gap-1">
              {RANGES.map((r) => (
                <button
                  key={r.label}
                  onClick={() => setRange(r.label)}
                  className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                    range === r.label
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/30 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Key stats row */}
            {stats && (
              <div className="grid grid-cols-4 gap-3 text-xs">
                <StatBox
                  icon={TrendingUp}
                  label="Period Return"
                  value={`${stats.periodReturn >= 0 ? "+" : ""}${stats.periodReturn.toFixed(2)}%`}
                  positive={stats.periodReturn >= 0}
                />
                <StatBox icon={DollarSign} label="High" value={`$${stats.high.toFixed(2)}`} />
                <StatBox icon={DollarSign} label="Low" value={`$${stats.low.toFixed(2)}`} />
                <StatBox icon={Activity} label="Avg Vol" value={formatVolume(stats.avgVol)} />
              </div>
            )}

            {/* OHLC chart */}
            {loading ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                Loading…
              </div>
            ) : filteredSeries.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                No data available for this range.
              </div>
            ) : (
              <div className="rounded-md border border-border p-3">
                <ResponsiveContainer width="100%" height={280} key={`${ticker}-${range}-${filteredSeries.length}`}>
                  <ComposedChart data={filteredSeries} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke="oklch(1 0 0 / 5%)" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={formatDate}
                      tick={{ fontSize: 10, fill: "oklch(0.65 0.015 240)" }}
                      stroke="oklch(1 0 0 / 10%)"
                      minTickGap={30}
                      scale="linear"
                    />
                    <YAxis
                      yAxisId="price"
                      tick={{ fontSize: 10, fill: "oklch(0.65 0.015 240)" }}
                      stroke="oklch(1 0 0 / 10%)"
                      domain={["auto", "auto"]}
                      width={50}
                    />
                    <YAxis
                      yAxisId="vol"
                      orientation="right"
                      tick={{ fontSize: 9, fill: "oklch(0.55 0.01 240)" }}
                      stroke="oklch(1 0 0 / 5%)"
                      width={40}
                      tickFormatter={(v) => formatVolume(v)}
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
                    />
                    <Bar yAxisId="vol" dataKey="volume" fill="oklch(0.45 0.02 255)" opacity={0.4} />
                    <Line
                      yAxisId="price"
                      type="monotone"
                      dataKey="close"
                      stroke="oklch(0.7 0.18 165)"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Company info */}
            {data?.data.meta && (
              <div className="rounded-md border border-border p-4 space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Building2 className="h-3 w-3" />
                  Company Overview
                </h3>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
                  <Row label="Sector" value={data.data.meta.sector} />
                  <Row label="Industry" value={data.data.meta.industry} />
                  <Row label="IPO Year" value={data.data.meta.ipoyear?.toString() ?? "—"} />
                  <Row label="Market Cap" value={formatMarketcap(data.data.meta.marketcap)} />
                  <Row label="First Date" value={formatDate(data.data.meta.first_date)} />
                  <Row label="Last Date" value={formatDate(data.data.meta.last_date)} />
                  <Row label="First Close" value={`$${data.data.meta.first_close.toFixed(2)}`} />
                  <Row label="Last Close" value={`$${data.data.meta.last_close.toFixed(2)}`} />
                  <Row label="Total Volume" value={formatVolume(data.data.meta.total_volume)} />
                  <Row label="Trading Days" value={data.data.meta.trading_days.toLocaleString()} />
                  <Row
                    label="Total Return"
                    value={`${data.data.meta.total_return_pct != null ? (data.data.meta.total_return_pct >= 0 ? "+" : "") + data.data.meta.total_return_pct.toFixed(2) + "%" : "—"}`}
                    positive={data.data.meta.total_return_pct != null ? data.data.meta.total_return_pct >= 0 : undefined}
                  />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
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
    <div className="rounded-md border border-border p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
        <Icon className="h-2.5 w-2.5" />
        {label}
      </div>
      <div className={`font-mono text-sm font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function Row({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  const color = positive === undefined ? "" : positive ? "text-up" : "text-down";
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </div>
  );
}
