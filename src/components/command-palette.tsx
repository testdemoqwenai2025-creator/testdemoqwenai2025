"use client";

import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useYearStore } from "@/hooks/use-year-store";
import { usePipelineStore } from "@/hooks/use-pipeline-store";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";
import { Calendar, Cpu, TrendingUp, Search } from "lucide-react";

const PIPELINE_JOBS = [
  { id: "AvgStockVolumePerMonth", title: "Average Volume Per Month" },
  { id: "TopThreeStocksByVolume", title: "Top 3 Stocks by Volume" },
  { id: "TotalVolumePerYear", title: "Total Volume Per Year" },
  { id: "NoTradeDays", title: "No-Trade Days Counter" },
  { id: "StockCompanyJoinDistCache", title: "Stock ↔ Company Join" },
  { id: "CompositeIndex", title: "Composite Index" },
  { id: "VolumeAnomalies", title: "Volume Anomalies" },
];

const QUICK_YEARS = [2008, 2000, 2009, 1997, 2017];

interface TickerSearchResult {
  ticker: string;
  name: string;
  sector: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tickerResults, setTickerResults] = useState<TickerSearchResult[]>([]);
  const { setYear, availableYears } = useYearStore();
  const openPipeline = usePipelineStore((s) => s.open);
  const selectTicker = useSelectedTicker((s) => s.select);

  // ⌘K opens the palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced ticker search when query looks like a ticker
  useEffect(() => {
    if (!open || !query.trim()) {
      setTickerResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/tickers?q=${encodeURIComponent(query)}&limit=5`);
      const json = await res.json();
      setTickerResults(json.tickers ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search tickers, jump to year, or open pipeline jobs…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        {/* Ticker results (dynamic) */}
        {tickerResults.length > 0 && (
          <CommandGroup heading="Tickers">
            {tickerResults.map((t) => (
              <CommandItem
                key={t.ticker}
                value={`${t.ticker} ${t.name}`}
                onSelect={() => {
                  selectTicker(t.ticker);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <TrendingUp className="mr-2 h-4 w-4 text-primary" />
                <span className="font-mono font-bold w-14">{t.ticker}</span>
                <span className="truncate">{t.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {t.sector}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Quick years */}
        <CommandGroup heading="Time Machine — quick jump">
          {QUICK_YEARS.map((y) => (
            <CommandItem
              key={y}
              value={`year ${y}`}
              onSelect={() => {
                setYear(y);
                setOpen(false);
                setQuery("");
              }}
            >
              <Calendar className="mr-2 h-4 w-4" />
              <span>Year {y}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {y === 2008 ? "financial crisis" :
                 y === 2000 ? "dot-com peak" :
                 y === 2009 ? "market bottom" :
                 y === 1997 ? "earliest data" :
                 "latest data"}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        {/* All years */}
        <CommandGroup heading="All years (1997–2017)">
          {availableYears.filter((y) => !QUICK_YEARS.includes(y)).map((y) => (
            <CommandItem
              key={y}
              value={`year ${y}`}
              onSelect={() => {
                setYear(y);
                setOpen(false);
                setQuery("");
              }}
            >
              <Calendar className="mr-2 h-4 w-4" />
              <span>Year {y}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Pipeline jobs */}
        <CommandGroup heading="Pipeline jobs — view source code">
          {PIPELINE_JOBS.map((j) => (
            <CommandItem
              key={j.id}
              value={`pipeline ${j.id} ${j.title}`}
              onSelect={() => {
                openPipeline(j.id);
                setOpen(false);
                setQuery("");
              }}
            >
              <Cpu className="mr-2 h-4 w-4" />
              <span>{j.title}</span>
              <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                {j.id}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
