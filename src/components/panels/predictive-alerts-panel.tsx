"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { LineageBadge } from "@/components/lineage-badge";
import { useYearStore } from "@/hooks/use-year-store";
import { Brain, Search, AlertTriangle, AlertCircle, Info, Loader2 } from "lucide-react";

interface PredictiveAlert {
  type: string;
  severity: "info" | "warning" | "critical";
  confidence: number;
  message: string;
  recommendation: string;
  detectedAt: string;
}

const SEVERITY_ICONS = {
  critical: AlertTriangle,
  warning: AlertCircle,
  info: Info,
};

const SEVERITY_COLORS = {
  critical: "text-down border-down/30 bg-down/10",
  warning: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  info: "text-primary border-primary/30 bg-primary/10",
};

export function PredictiveAlertsPanel() {
  const year = useYearStore((s) => s.year);
  const [ticker, setTicker] = useState("GE");
  const [alerts, setAlerts] = useState<PredictiveAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisPeriod, setAnalysisPeriod] = useState("");

  useEffect(() => {
    analyze(ticker);
  }, [ticker, year]);

  async function analyze(t: string) {
    if (!t.trim()) return;
    setLoading(true);
    setError(null);
    setAlerts([]);
    try {
      const res = await fetch(`/api/predictive-alerts?ticker=${encodeURIComponent(t)}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setAlerts(data.alerts ?? []);
        setAnalysisPeriod(data.analysisPeriod ?? "");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="col-span-12 lg:col-span-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-4 w-4 text-fuchsia-400" />
          Predictive Alerts
          <LineageBadge jobId="PredictiveAlerts" jobTitle="ML-Style Pattern Detection" stage="derived" />
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Pattern detection: crash signals, volume surges, volatility shifts, support/resistance breaks
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Ticker input */}
        <div className="flex gap-2">
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && analyze(ticker)}
            placeholder="Ticker (e.g. GE)"
            className="h-8 text-xs font-mono"
          />
          <Button onClick={() => analyze(ticker)} disabled={loading} size="sm" className="h-8 px-2">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
          </Button>
        </div>

        {/* Analysis period */}
        {analysisPeriod && (
          <p className="text-[10px] text-muted-foreground font-mono">
            Analysis: {analysisPeriod}
          </p>
        )}

        {/* Alerts */}
        <ScrollArea className="h-[300px] pr-2">
          <div className="space-y-2">
            {loading && (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Analyzing patterns…
              </div>
            )}
            {error && (
              <div className="text-xs text-down p-3 rounded border border-down/30 bg-down/10">
                {error}
              </div>
            )}
            {!loading && !error && alerts.length === 0 && (
              <div className="text-xs text-muted-foreground p-4 text-center">
                No alerts detected. Market behavior appears normal.
              </div>
            )}
            {!loading && alerts.map((alert, i) => {
              const Icon = SEVERITY_ICONS[alert.severity];
              return (
                <div
                  key={i}
                  className={`rounded-md border p-2 ${SEVERITY_COLORS[alert.severity]}`}
                >
                  <div className="flex items-start gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-[9px] font-mono">
                          {alert.type.replace(/_/g, " ")}
                        </Badge>
                        <Badge variant="outline" className="text-[9px] font-mono">
                          {alert.confidence}% confidence
                        </Badge>
                      </div>
                      <p className="text-[11px] leading-relaxed mb-1.5">{alert.message}</p>
                      <p className="text-[10px] text-muted-foreground italic">
                        → {alert.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
