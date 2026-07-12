"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineageBadge } from "@/components/lineage-badge";
import { useYearStore } from "@/hooks/use-year-store";
import { Loader2, Gauge, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Indicator {
  name: string;
  score: number;
  value: string;
  interpretation: string;
  weight: number;
}

interface SentimentResult {
  score: number;
  label: string;
  color: string;
  year: number;
  indicators: Indicator[];
  summary: string;
  recommendation: string;
}

function scoreColor(score: number): string {
  if (score < 25) return "text-down";
  if (score < 45) return "text-amber-400";
  if (score < 55) return "text-muted-foreground";
  if (score < 75) return "text-primary";
  return "text-up";
}

function scoreBar(score: number): string {
  if (score < 25) return "bg-down";
  if (score < 45) return "bg-amber-500";
  if (score < 55) return "bg-muted-foreground";
  if (score < 75) return "bg-primary";
  return "bg-up";
}

export function SentimentPanel() {
  const year = useYearStore((s) => s.year);
  const [data, setData] = useState<SentimentResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sentiment?year=${year}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [year]);

  return (
    <Card className="col-span-12 lg:col-span-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" />
          Market Sentiment — Fear & Greed
          {data && <LineageBadge jobId="SentimentAnalyzer" jobTitle="Fear & Greed Index" stage="derived" />}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Composite sentiment from 6 price-pattern indicators — {year}
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {loading && (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Computing sentiment…
          </div>
        )}

        {data && !loading && (
          <>
            {/* Big score gauge */}
            <div className="text-center py-3">
              <div className={`text-5xl font-bold font-mono ${scoreColor(data.score)}`}>
                {data.score}
              </div>
              <div className={`text-lg font-semibold mt-1 ${scoreColor(data.score)}`}>
                {data.label}
              </div>
              {/* Score bar */}
              <div className="relative h-3 mt-3 rounded-full overflow-hidden bg-muted/30">
                <div className="absolute inset-0 flex">
                  <div className="flex-1 bg-down/30" />
                  <div className="flex-1 bg-amber-500/30" />
                  <div className="flex-1 bg-muted-foreground/30" />
                  <div className="flex-1 bg-primary/30" />
                  <div className="flex-1 bg-up/30" />
                </div>
                <div
                  className={`absolute h-3 ${scoreBar(data.score)} transition-all`}
                  style={{ width: `${data.score}%` }}
                />
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                <span>Extreme Fear</span>
                <span>Fear</span>
                <span>Neutral</span>
                <span>Greed</span>
                <span>Extreme Greed</span>
              </div>
            </div>

            {/* Recommendation */}
            <div className="p-2 rounded border border-border bg-card/30">
              <p className="text-[11px] leading-relaxed">{data.recommendation}</p>
            </div>

            {/* Indicators */}
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">Contributing Indicators</div>
              {data.indicators.map((ind) => (
                <div key={ind.name} className="p-2 rounded border border-border/50">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{ind.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono text-xs font-bold ${scoreColor(ind.score)}`}>{ind.score}</span>
                      <Badge variant="outline" className="text-[9px]">{Math.round(ind.weight * 100)}%</Badge>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">{ind.value}</div>
                  <div className="text-[10px] mt-0.5">{ind.interpretation}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
