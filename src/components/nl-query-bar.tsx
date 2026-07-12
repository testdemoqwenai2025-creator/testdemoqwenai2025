"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Search, Loader2, X, TrendingUp, TrendingDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useYearStore } from "@/hooks/use-year-store";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";

interface NLResult {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  return_pct: number;
  total_volume: number;
  first_close: number;
  last_close: number;
  high: number;
  low: number;
  n_days: number;
}

interface NLResponse {
  query: string;
  year: number;
  filter: {
    explanation: string;
    [k: string]: unknown;
  };
  used_llm: boolean;
  results: NLResult[];
  result_count: number;
  total_candidates: number;
}

const SUGGESTIONS = [
  "tech stocks that doubled in 2008",
  "energy stocks with volume over 100M",
  "biggest losers in finance",
  "stocks that survived 2008 with positive returns",
  "most active stocks in 2008",
  "healthcare gainers",
];

function formatVolume(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toString();
}

export function NLQueryBar() {
  const year = useYearStore((s) => s.year);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<NLResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectTicker = useSelectedTicker((s) => s.select);

  // ⌘J focuses the NL query bar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        inputRef.current?.focus();
        setShowSuggestions(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runQuery = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setShowSuggestions(false);
    try {
      const res = await fetch("/api/nl-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, year }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: NLResponse = await res.json();
      setResponse(data);
      setShowResults(true);
    } catch (err: any) {
      setError(err.message ?? "query failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Input row */}
      <div className="relative flex items-center gap-2">
        <Sparkles className="absolute left-3 h-4 w-4 text-primary z-10 pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runQuery(query);
            if (e.key === "Escape") {
              setShowSuggestions(false);
              inputRef.current?.blur();
            }
          }}
          placeholder="Ask the data: 'tech stocks that doubled in 2008'…"
          className="pl-9 pr-24 h-10 bg-card/50 border-border"
        />
        <kbd className="absolute right-24 text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
          ⌘J
        </kbd>
        <Button
          onClick={() => runQuery(query)}
          disabled={loading || !query.trim()}
          size="sm"
          className="absolute right-2 h-7"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && !response && (
        <Card className="absolute z-50 mt-1 w-full max-w-2xl shadow-xl">
          <CardContent className="p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">
              Try one of these
            </div>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setQuery(s);
                  runQuery(s);
                }}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-accent text-sm flex items-center gap-2"
              >
                <Sparkles className="h-3 w-3 text-primary" />
                <span>{s}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Results panel */}
      {showResults && response && (
        <Card className="mt-2 shadow-xl">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Query:</span>
                  <span className="font-mono">"{response.query}"</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-[10px]">
                    Year {response.year}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {response.result_count} of {response.total_candidates} matches
                  </Badge>
                  {response.used_llm ? (
                    <Badge variant="outline" className="text-[10px] text-primary">
                      LLM-parsed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-amber-400">
                      keyword fallback
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2 italic">
                  {response.filter.explanation}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowResults(false);
                  setResponse(null);
                }}
                className="p-1 rounded hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <div className="text-sm text-down mb-3">{error}</div>
            )}

            <ScrollArea className="h-[300px] pr-2">
              <div className="space-y-1">
                {response.results.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No tickers matched this query.
                  </div>
                )}
                {response.results.map((r, i) => (
                  <button
                    key={r.ticker}
                    onClick={() => selectTicker(r.ticker)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-accent transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[10px] text-muted-foreground w-4 text-right">
                        {i + 1}
                      </span>
                      <span className="font-mono font-bold text-sm w-12">
                        {r.ticker}
                      </span>
                      <span className="text-xs truncate max-w-[200px]">
                        {r.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground truncate max-w-[80px]">
                        {r.sector}
                      </span>
                      <span className="font-mono text-muted-foreground">
                        {formatVolume(r.total_volume)}
                      </span>
                      <span
                        className={`font-mono font-semibold flex items-center gap-0.5 ${
                          r.return_pct >= 0 ? "text-up" : "text-down"
                        }`}
                      >
                        {r.return_pct >= 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {r.return_pct >= 0 ? "+" : ""}
                        {r.return_pct.toFixed(1)}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
