"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { LineageBadge } from "@/components/lineage-badge";
import { useYearStore } from "@/hooks/use-year-store";
import { Newspaper, RefreshCw, Loader2 } from "lucide-react";

export function BriefingPanel() {
  const year = useYearStore((s) => s.year);
  const [briefing, setBriefing] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string>("");
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    generateBriefing();
  }, [year]);

  async function generateBriefing() {
    setLoading(true);
    setBriefing("");
    try {
      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
      });
      const data = await res.json();
      setBriefing(data.briefing ?? "No briefing available.");
      setGeneratedAt(data.generatedAt ?? "");
      setFallback(data.fallback ?? false);
    } catch (err) {
      setBriefing("Failed to generate briefing. Please try again.");
      setFallback(true);
    } finally {
      setLoading(false);
    }
  }

  // Simple markdown renderer (bold + headers + bullets)
  function renderMarkdown(md: string) {
    return md.split("\n").map((line, i) => {
      if (line.startsWith("### ")) {
        return (
          <h4 key={i} className="font-semibold text-sm text-primary mt-3 mb-1">
            {line.replace("### ", "")}
          </h4>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <h3 key={i} className="font-bold text-base mt-4 mb-2">
            {line.replace("## ", "")}
          </h3>
        );
      }
      if (line.startsWith("- ")) {
        return (
          <div key={i} className="text-xs ml-3 mb-0.5 flex gap-1.5">
            <span className="text-muted-foreground">•</span>
            <span>{renderInline(line.replace("- ", ""))}</span>
          </div>
        );
      }
      if (line.trim() === "") return <div key={i} className="h-2" />;
      return (
        <p key={i} className="text-xs mb-1">
          {renderInline(line)}
        </p>
      );
    });
  }

  function renderInline(text: string) {
    // Render **bold** segments
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  return (
    <Card className="col-span-12 lg:col-span-8">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-primary" />
            AI Daily Briefing — {year}
            <LineageBadge jobId="DailyBriefing" jobTitle="AI-Generated Daily Briefing" stage="derived" />
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Auto-generated market analysis using ZAI SDK + historical data
          </p>
        </div>
        <div className="flex items-center gap-2">
          {fallback && (
            <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">
              fallback
            </Badge>
          )}
          {generatedAt && !loading && (
            <span className="text-[10px] text-muted-foreground">
              {new Date(generatedAt).toLocaleTimeString()}
            </span>
          )}
          <Button onClick={generateBriefing} disabled={loading} size="sm" variant="outline" className="h-7">
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[400px] pr-2">
          {loading ? (
            <div className="flex items-center justify-center h-[400px] text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Generating briefing…
            </div>
          ) : (
            <div className="space-y-1">{renderMarkdown(briefing)}</div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
