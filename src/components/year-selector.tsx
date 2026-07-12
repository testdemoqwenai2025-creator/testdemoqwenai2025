"use client";

import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useYearStore } from "@/hooks/use-year-store";
import { cn } from "@/lib/utils";

const HISTORICAL_EVENTS: Record<number, string> = {
  1997: "Asian financial crisis begins",
  1998: "LTCM collapse",
  1999: "Dot-com bubble peak",
  2000: "Dot-com crash begins",
  2001: "9/11 attacks",
  2002: "Sarbanes-Oxley Act",
  2003: "Iraq war, SARS outbreak",
  2004: "Facebook founded",
  2005: "Hurricane Katrina",
  2006: "Housing bubble peak",
  2007: "Subprime crisis begins",
  2008: "Global financial crisis",
  2009: "Market bottom, recovery begins",
  2010: "Flash crash, Dodd-Frank",
  2011: "Eurozone debt crisis, S&P downgrade",
  2012: "Facebook IPO",
  2013: "Taper tantrum, Bitcoin rally",
  2014: "Oil price crash",
  2015: "China crash, Swiss franc shock",
  2016: "Brexit, Trump elected",
  2017: "Crypto boom, tax reform",
};

export function YearSelector() {
  const { year, setYear, nextYear, prevYear, availableYears } = useYearStore();
  const event = HISTORICAL_EVENTS[year] ?? "";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={prevYear}
        disabled={year <= 1997}
        className="p-1.5 rounded-md border border-border hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Previous year"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="flex flex-col items-center min-w-[120px]">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-primary" />
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="bg-transparent text-2xl font-bold text-mono-tabular outline-none cursor-pointer hover:text-primary transition-colors appearance-none text-center"
            aria-label="Select year"
          >
            {availableYears.map((y) => (
              <option key={y} value={y} className="bg-card text-foreground">
                {y}
              </option>
            ))}
          </select>
        </div>
        {event && (
          <span className="text-[10px] text-muted-foreground italic max-w-[200px] truncate">
            {event}
          </span>
        )}
      </div>

      <button
        onClick={nextYear}
        disabled={year >= 2017}
        className="p-1.5 rounded-md border border-border hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next year"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
