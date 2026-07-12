"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Database, Play, Loader2, Clock, Table as TableIcon, ChevronDown, ChevronRight } from "lucide-react";
import { LineageBadge } from "@/components/lineage-badge";

interface SchemaTable {
  name: string;
  description: string;
  columns: Array<{ name: string; type: string; description?: string }> | string;
}

interface Schema {
  tables: SchemaTable[];
  sample_queries: Array<{ label: string; sql: string }>;
}

interface QueryResult {
  sql: string;
  columns: string[];
  rows: any[][];
  row_count: number;
  execution_ms: number;
  lineage: { job_id: string; title: string; stage: string; description: string };
  error?: string;
}

export function SqlEditorPanel() {
  const [schema, setSchema] = useState<Schema | null>(null);
  const [sql, setSql] = useState(
    "SELECT ticker, total_volume, first_close, last_close,\n  ROUND((last_close/first_close - 1)*100, 1) AS return_pct\nFROM total_volume_per_year\nWHERE year = 2008\nORDER BY total_volume DESC\nLIMIT 10"
  );
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);

  useEffect(() => {
    fetch("/api/sql-query")
      .then((r) => r.json())
      .then((d) => setSchema(d.schema));
  }, []);

  async function runQuery() {
    if (!sql.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/sql-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err: any) {
      setResult({ sql, columns: [], rows: [], row_count: 0, execution_ms: 0, lineage: {} as any, error: err.message });
    } finally {
      setLoading(false);
    }
  }

  function loadSample(sql: string) {
    setSql(sql);
  }

  return (
    <Card className="col-span-12">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            SQL Query Editor
            <LineageBadge jobId="DuckDB" jobTitle="Ad-hoc SQL Query" stage="derived" />
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Write SQL against 9.4M rows of NYSE data in DuckDB — the modern data stack approach.
          </p>
        </div>
        {result && !result.error && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              <Clock className="h-2.5 w-2.5 mr-1" />
              {result.execution_ms}ms
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              <TableIcon className="h-2.5 w-2.5 mr-1" />
              {result.row_count} rows
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Sample queries + schema toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {schema?.sample_queries.map((q) => (
            <button
              key={q.label}
              onClick={() => loadSample(q.sql)}
              className="text-[10px] px-2 py-1 rounded border border-border hover:bg-accent transition-colors"
            >
              {q.label}
            </button>
          ))}
          <button
            onClick={() => setSchemaOpen(!schemaOpen)}
            className="text-[10px] px-2 py-1 rounded border border-border hover:bg-accent transition-colors flex items-center gap-1 ml-auto"
          >
            {schemaOpen ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
            Schema
          </button>
        </div>

        {/* Schema browser */}
        {schemaOpen && schema && (
          <div className="rounded-md border border-border p-3 bg-card/30 max-h-[200px] overflow-y-auto">
            <div className="text-[10px] uppercase text-muted-foreground mb-2">Available Tables</div>
            <div className="space-y-2">
              {schema.tables.map((t) => (
                <div key={t.name}>
                  <div className="font-mono text-xs font-bold text-primary">{t.name}</div>
                  <div className="text-[10px] text-muted-foreground">{t.description}</div>
                  {Array.isArray(t.columns) && (
                    <div className="ml-4 mt-0.5 space-y-0.5">
                      {t.columns.map((c) => (
                        <div key={c.name} className="text-[10px] font-mono">
                          <span className="text-foreground">{c.name}</span>
                          <span className="text-muted-foreground ml-2">{c.type}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SQL editor */}
        <div className="relative">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                runQuery();
              }
            }}
            className="w-full h-[140px] p-3 rounded-md border border-border bg-card/50 font-mono text-xs resize-y focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="SELECT ticker, total_volume FROM total_volume_per_year WHERE year = 2008..."
            spellCheck={false}
          />
          <Button
            onClick={runQuery}
            disabled={loading || !sql.trim()}
            size="sm"
            className="absolute right-2 bottom-2"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Play className="h-3 w-3 mr-1" />
            )}
            Run
            <kbd className="ml-2 text-[9px] opacity-70">⌘↵</kbd>
          </Button>
        </div>

        {/* Results */}
        {result?.error && (
          <div className="text-xs text-down p-3 rounded-md border border-down/30 bg-down/10">
            Error: {result.error}
          </div>
        )}
        {result && !result.error && result.columns.length > 0 && (
          <div className="rounded-md border border-border overflow-hidden">
            <div className="max-h-[400px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card border-b border-border">
                  <tr>
                    <th className="px-2 py-1.5 text-left text-[10px] text-muted-foreground w-8">#</th>
                    {result.columns.map((col) => (
                      <th key={col} className="px-3 py-1.5 text-left font-mono font-semibold whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="px-2 py-1.5 text-[10px] text-muted-foreground">{i + 1}</td>
                      {row.map((cell, j) => (
                        <td key={j} className="px-3 py-1.5 font-mono whitespace-nowrap">
                          {formatCell(cell, result.columns[j])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {result && !result.error && result.columns.length === 0 && (
          <div className="text-xs text-muted-foreground p-4 text-center">
            Query executed in {result.execution_ms}ms — no rows returned.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatCell(value: any, columnName?: string): string {
  if (value == null) return "null";
  if (typeof value === "number") {
    // Color-code based on column name
    if (columnName?.includes("return_pct") || columnName?.includes("return")) {
      const v = value;
      const cls = v >= 0 ? "text-up" : "text-down";
      return v.toFixed(1) + "%";
    }
    if (columnName?.includes("volume")) {
      if (value >= 1e9) return (value / 1e9).toFixed(2) + "B";
      if (value >= 1e6) return (value / 1e6).toFixed(2) + "M";
      if (value >= 1e3) return (value / 1e3).toFixed(1) + "K";
      return value.toLocaleString();
    }
    if (columnName?.includes("close") || columnName?.includes("open") || columnName?.includes("high") || columnName?.includes("low")) {
      return "$" + value.toFixed(2);
    }
    return value.toLocaleString();
  }
  return String(value);
}
