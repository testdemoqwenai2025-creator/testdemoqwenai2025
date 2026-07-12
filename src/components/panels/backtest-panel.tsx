"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineageBadge } from "@/components/lineage-badge";
import { useYearStore } from "@/hooks/use-year-store";
import { Play, Loader2, TrendingUp, TrendingDown } from "lucide-react";

interface Trade {
  entryDate: number;
  entryPrice: number;
  exitDate: number;
  exitPrice: number;
  returnPct: number;
  holdingDays: number;
  reason: string;
}

interface BacktestResult {
  ticker: string;
  strategy: string;
  parameters: Record<string, number>;
  metrics: {
    totalReturn: number;
    buyHoldReturn: number;
    alpha: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    numTrades: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    avgHoldingDays: number;
    annualizedReturn: number;
    annualizedVolatility: number;
  };
  trades: Trade[];
  interpretation: { performance: string; summary: string };
}

const STRATEGIES = [
  { value: "sma_crossover", label: "SMA Crossover", params: "fastPeriod=10&slowPeriod=30" },
  { value: "momentum", label: "Momentum", params: "lookback=20&threshold=5" },
  { value: "mean_reversion", label: "Mean Reversion (Bollinger)", params: "period=20&mult=2" },
  { value: "breakout", label: "Breakout", params: "period=20" },
  { value: "rsi", label: "RSI Oversold/Overbought", params: "period=14&oversold=30&overbought=70" },
];

const PERF_COLORS: Record<string, string> = {
  poor: "text-down",
  below_average: "text-amber-400",
  average: "text-muted-foreground",
  good: "text-primary",
  excellent: "text-up",
};

export function BacktestPanel() {
  const year = useYearStore((s) => s.year);
  const [ticker, setTicker] = useState("GE");
  const [strategy, setStrategy] = useState("sma_crossover");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const strat = STRATEGIES.find((s) => s.value === strategy);
      const params = strat?.params ?? "";
      const url = `/api/backtest?ticker=${ticker}&strategy=${strategy}&year=${year}&${params}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="col-span-12">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          Backtesting Engine
          {result && <LineageBadge jobId="Backtester" jobTitle="Strategy Backtester" stage="derived" />}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Test trading strategies against historical data — SMA, Momentum, Mean Reversion, Breakout, RSI
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Input row */}
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Ticker"
            className="h-8 text-xs font-mono max-w-[100px]"
          />
          <Select value={strategy} onValueChange={setStrategy}>
            <SelectTrigger className="h-8 text-xs max-w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STRATEGIES.map((s) => (
                <SelectItem key={s.value} value={s.value} className="text-xs">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={run} disabled={loading} size="sm" className="h-8">
            {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
            Run Backtest
          </Button>
        </div>

        {error && <div className="text-xs text-down p-2 rounded border border-down/30 bg-down/10">{error}</div>}

        {result && !loading && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="p-3 rounded-md border border-border bg-card/30">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className={`text-[10px] ${PERF_COLORS[result.interpretation.performance] ?? ""}`}>
                  {result.interpretation.performance.replace(/_/g, " ")}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {result.strategy} · {result.ticker} · {year}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed">{result.interpretation.summary}</p>
            </div>

            {/* Key metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Metric label="Strategy Return" value={`${result.metrics.totalReturn}%`} positive={result.metrics.totalReturn >= 0} />
              <Metric label="Buy & Hold" value={`${result.metrics.buyHoldReturn}%`} positive={result.metrics.buyHoldReturn >= 0} />
              <Metric label="Alpha" value={`${result.metrics.alpha >= 0 ? "+" : ""}${result.metrics.alpha}%`} positive={result.metrics.alpha >= 0} />
              <Metric label="Sharpe" value={result.metrics.sharpeRatio.toString()} positive={result.metrics.sharpeRatio >= 1} />
              <Metric label="Max Drawdown" value={`${result.metrics.maxDrawdown}%`} />
              <Metric label="Win Rate" value={`${result.metrics.winRate}%`} positive={result.metrics.winRate >= 50} />
              <Metric label="Trades" value={result.metrics.numTrades.toString()} />
              <Metric label="Profit Factor" value={result.metrics.profitFactor.toString()} positive={result.metrics.profitFactor >= 1} />
            </div>

            {/* Trade list */}
            <ScrollArea className="h-[250px] pr-2">
              <div className="space-y-1">
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Trades ({result.trades.length})</div>
                {result.trades.map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 p-1.5 rounded border border-border/50 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
                      <span className="font-mono">{t.entryDate} → {t.exitDate}</span>
                      <span className="text-[10px] text-muted-foreground">({t.holdingDays}d)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px]">${t.entryPrice.toFixed(2)} → ${t.exitPrice.toFixed(2)}</span>
                      <span className={`font-mono font-bold flex items-center gap-0.5 ${t.returnPct >= 0 ? "text-up" : "text-down"}`}>
                        {t.returnPct >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                        {t.returnPct >= 0 ? "+" : ""}{t.returnPct}%
                      </span>
                    </div>
                  </div>
                ))}
                {result.trades.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-4">No trades executed</div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const color = positive === undefined ? "" : positive ? "text-up" : "text-down";
  return (
    <div className="p-2 rounded border border-border">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}
