"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineageBadge } from "@/components/lineage-badge";
import { useYearStore } from "@/hooks/use-year-store";
import { Plus, Trash2, Calculator, Loader2, TrendingDown, Shield, AlertTriangle } from "lucide-react";

interface Holding {
  ticker: string;
  weight: number;
}

interface PortfolioMetrics {
  tickers: string[];
  weights: number[];
  returns: { daily: number; annualized: number; cumulative: number };
  volatility: { daily: number; annualized: number };
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownDuration: number;
  var: { var95_1day: number; var99_1day: number; var95_10day: number; var99_10day: number };
  expectedShortfall: { es95: number; es99: number };
  beta: number;
  correlationMatrix: { tickers: string[]; matrix: number[][] };
  interpretation: {
    riskLevel: string;
    riskAdjustedReturn: string;
    diversification: string;
    summary: string;
  };
}

const RISK_COLORS: Record<string, string> = {
  low: "text-up border-up/30 bg-up/10",
  moderate: "text-primary border-primary/30 bg-primary/10",
  high: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  extreme: "text-down border-down/30 bg-down/10",
};

const RAR_COLORS: Record<string, string> = {
  poor: "text-down",
  adequate: "text-amber-400",
  good: "text-primary",
  excellent: "text-up",
};

export function PortfolioRiskPanel() {
  const year = useYearStore((s) => s.year);
  const [holdings, setHoldings] = useState<Holding[]>([
    { ticker: "GE", weight: 30 },
    { ticker: "F", weight: 30 },
    { ticker: "BAC", weight: 40 },
  ]);
  const [result, setResult] = useState<PortfolioMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addHolding() {
    setHoldings([...holdings, { ticker: "", weight: 10 }]);
  }

  function removeHolding(i: number) {
    setHoldings(holdings.filter((_, idx) => idx !== i));
  }

  function updateHolding(i: number, field: keyof Holding, value: string | number) {
    setHoldings(holdings.map((h, idx) => idx === i ? { ...h, [field]: value } : h));
  }

  async function analyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/portfolio-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings, year }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const totalWeight = holdings.reduce((s, h) => s + (h.weight || 0), 0);

  function corrColor(v: number): string {
    if (v >= 0.7) return "text-down";
    if (v >= 0.4) return "text-amber-400";
    if (v >= 0.2) return "text-primary";
    return "text-up";
  }

  return (
    <Card className="col-span-12">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Portfolio Risk Analyzer
          {result && (
            <LineageBadge jobId="PortfolioRiskAnalyzer" jobTitle="VaR, Sharpe, Drawdown" stage="derived" />
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Institutional-grade risk metrics: VaR, Expected Shortfall, Sharpe, Sortino, Max Drawdown, Beta, Correlation
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Holdings input */}
        <div className="space-y-1.5">
          {holdings.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={h.ticker}
                onChange={(e) => updateHolding(i, "ticker", e.target.value.toUpperCase())}
                placeholder="Ticker"
                className="h-7 text-xs font-mono max-w-[100px]"
              />
              <Input
                value={h.weight}
                onChange={(e) => updateHolding(i, "weight", parseFloat(e.target.value) || 0)}
                type="number"
                placeholder="Weight %"
                className="h-7 text-xs font-mono max-w-[80px]"
              />
              <span className="text-[10px] text-muted-foreground">%</span>
              <button onClick={() => removeHolding(i)} className="p-1 rounded hover:bg-destructive/20">
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button onClick={addHolding} size="sm" variant="outline" className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" /> Add Holding
            </Button>
            <span className="text-[10px] text-muted-foreground">
              Total: {totalWeight}% {totalWeight !== 100 && "(will be normalized)"}
            </span>
          </div>
        </div>

        <Button onClick={analyze} disabled={loading} size="sm" className="w-full">
          {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Calculator className="h-3 w-3 mr-1" />}
          Analyze Portfolio Risk
        </Button>

        {error && (
          <div className="text-xs text-down p-2 rounded border border-down/30 bg-down/10">{error}</div>
        )}

        {result && !loading && (
          <ScrollArea className="h-[500px] pr-2">
            <div className="space-y-3">
              {/* Summary banner */}
              <div className={`p-3 rounded-md border ${RISK_COLORS[result.interpretation.riskLevel] ?? ""}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">
                    Risk: {result.interpretation.riskLevel}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] ${RAR_COLORS[result.interpretation.riskAdjustedReturn] ?? ""}`}>
                    Return: {result.interpretation.riskAdjustedReturn}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    Diversification: {result.interpretation.diversification}
                  </Badge>
                </div>
                <p className="text-[11px] leading-relaxed">{result.interpretation.summary}</p>
              </div>

              {/* Returns & Volatility */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Metric label="Annual Return" value={`${result.returns.annualized}%`} positive={result.returns.annualized >= 0} />
                <Metric label="Cumulative" value={`${result.returns.cumulative}%`} positive={result.returns.cumulative >= 0} />
                <Metric label="Annual Vol" value={`${result.volatility.annualized}%`} />
                <Metric label="Beta" value={result.beta.toString()} />
              </div>

              {/* Risk-adjusted returns */}
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Sharpe Ratio" value={result.sharpeRatio.toFixed(2)} positive={result.sharpeRatio >= 1} />
                <Metric label="Sortino Ratio" value={result.sortinoRatio.toFixed(2)} positive={result.sortinoRatio >= 1} />
              </div>

              {/* Drawdown */}
              <div className="p-2 rounded border border-down/20 bg-down/5">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="h-3 w-3 text-down" />
                  <span className="text-[10px] uppercase text-muted-foreground">Maximum Drawdown</span>
                </div>
                <div className="font-mono text-lg font-bold text-down">
                  {result.maxDrawdown}%
                </div>
                <div className="text-[10px] text-muted-foreground">over {result.maxDrawdownDuration} trading days</div>
              </div>

              {/* Value at Risk */}
              <div className="p-2 rounded border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-3 w-3 text-amber-400" />
                  <span className="text-[10px] uppercase text-muted-foreground">Value at Risk (VaR)</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-[10px] text-muted-foreground">1-Day 95%</div>
                    <div className="font-mono font-bold text-amber-400">-{result.var.var95_1day}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">1-Day 99%</div>
                    <div className="font-mono font-bold text-down">-{result.var.var99_1day}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">10-Day 95%</div>
                    <div className="font-mono font-bold text-amber-400">-{result.var.var95_10day}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">10-Day 99%</div>
                    <div className="font-mono font-bold text-down">-{result.var.var99_10day}%</div>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground">
                  Expected Shortfall (avg loss beyond VaR): 95% = -{result.expectedShortfall.es95}%, 99% = -{result.expectedShortfall.es99}%
                </div>
              </div>

              {/* Correlation Matrix */}
              {result.correlationMatrix.tickers.length > 1 && (
                <div className="p-2 rounded border border-border">
                  <div className="text-[10px] uppercase text-muted-foreground mb-2">Correlation Matrix</div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="px-1 py-0.5"></th>
                        {result.correlationMatrix.tickers.map((t) => (
                          <th key={t} className="px-1 py-0.5 text-center font-mono text-[10px]">{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.correlationMatrix.matrix.map((row, i) => (
                        <tr key={i}>
                          <td className="px-1 py-0.5 font-mono text-[10px] font-bold">
                            {result.correlationMatrix.tickers[i]}
                          </td>
                          {row.map((v, j) => (
                            <td key={j} className={`px-1 py-0.5 text-center font-mono text-[10px] ${corrColor(v)}`}>
                              {v.toFixed(2)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Methodology note */}
              <div className="text-[10px] text-muted-foreground italic p-2 rounded bg-muted/10">
                <strong>Methodology:</strong> VaR uses historical method (percentile of actual returns).
                Sharpe = (return − 2% risk-free) / annualized vol. Sortino uses downside deviation only.
                Beta computed vs equal-weighted composite index. Correlation is Pearson.
              </div>
            </div>
          </ScrollArea>
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
