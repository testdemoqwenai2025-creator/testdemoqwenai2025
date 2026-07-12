"use client";

import { useEffect, useState, useMemo } from "react";
import { Search, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";

interface TickerSearchResult {
  ticker: string;
  name: string;
  sector: string;
  total_volume: number;
  total_return_pct: number | null;
}

export function TickerSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TickerSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const selectTicker = useSelectedTicker((s) => s.select);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/tickers?q=${encodeURIComponent(query)}&limit=10`
        );
        const json = await res.json();
        setResults(json.tickers ?? []);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card/50 hover:bg-accent transition-colors text-sm min-w-[200px]">
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Search ticker…</span>
          <kbd className="ml-auto text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
            ⌘K
          </kbd>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search ticker or company name…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "Searching…" : "No tickers found."}
            </CommandEmpty>
            {results.length > 0 && (
              <CommandGroup>
                {results.map((t) => (
                  <CommandItem
                    key={t.ticker}
                    value={t.ticker}
                    onSelect={() => {
                      selectTicker(t.ticker);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono font-bold text-primary w-14">
                        {t.ticker}
                      </span>
                      <span className="truncate text-sm">{t.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground truncate max-w-[100px]">
                        {t.sector}
                      </span>
                      {t.total_return_pct != null && (
                        <span
                          className={
                            t.total_return_pct >= 0 ? "text-up" : "text-down"
                          }
                        >
                          {t.total_return_pct >= 0 ? "+" : ""}
                          {t.total_return_pct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
