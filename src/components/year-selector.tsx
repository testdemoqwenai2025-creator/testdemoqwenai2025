"use client";

import { Calendar, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useYearStore } from "@/hooks/use-year-store";
import { Badge } from "@/components/ui/badge";

interface YearEvent {
  event: string;
  category: "crisis" | "bull" | "neutral" | "milestone";
}

const HISTORICAL_EVENTS: Record<number, YearEvent> = {
  1997: { event: "Asian financial crisis begins", category: "crisis" },
  1998: { event: "LTCM collapse", category: "crisis" },
  1999: { event: "Dot-com bubble peak", category: "bull" },
  2000: { event: "Dot-com crash begins", category: "crisis" },
  2001: { event: "9/11 attacks", category: "crisis" },
  2002: { event: "Sarbanes-Oxley Act", category: "milestone" },
  2003: { event: "Iraq war, SARS outbreak", category: "neutral" },
  2004: { event: "Facebook founded", category: "milestone" },
  2005: { event: "Hurricane Katrina", category: "neutral" },
  2006: { event: "Housing bubble peak", category: "bull" },
  2007: { event: "Subprime crisis begins", category: "crisis" },
  2008: { event: "Global financial crisis", category: "crisis" },
  2009: { event: "Market bottom, recovery begins", category: "bull" },
  2010: { event: "Flash crash, Dodd-Frank", category: "neutral" },
  2011: { event: "Eurozone debt crisis", category: "crisis" },
  2012: { event: "Facebook IPO", category: "milestone" },
  2013: { event: "Taper tantrum, Bitcoin rally", category: "bull" },
  2014: { event: "Oil price crash", category: "crisis" },
  2015: { event: "China crash, Swiss franc shock", category: "crisis" },
  2016: { event: "Brexit, Trump elected", category: "milestone" },
  2017: { event: "Crypto boom, tax reform", category: "bull" },
};

const CATEGORY_ICONS = {
  crisis: TrendingDown,
  bull: TrendingUp,
  neutral: Minus,
  milestone: Calendar,
};

const CATEGORY_COLORS = {
  crisis: "text-down",
  bull: "text-up",
  neutral: "text-muted-foreground",
  milestone: "text-primary",
};

const CATEGORY_LABELS = {
  crisis: "Crisis Years",
  bull: "Bull Markets",
  neutral: "Neutral Years",
  milestone: "Milestones",
};

export function YearSelector() {
  const { year, setYear, availableYears } = useYearStore();
  const eventInfo = HISTORICAL_EVENTS[year];
  const CategoryIcon = eventInfo ? CATEGORY_ICONS[eventInfo.category] : Calendar;

  // Group years by category for the dropdown
  const grouped: Record<string, number[]> = {
    crisis: [],
    bull: [],
    neutral: [],
    milestone: [],
  };
  for (const y of availableYears) {
    const cat = HISTORICAL_EVENTS[y]?.category ?? "neutral";
    grouped[cat].push(y);
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
        <SelectTrigger className="w-[180px] h-9 border-border bg-card/50 hover:bg-accent transition-colors">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-primary" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent className="w-[280px] max-h-[400px]">
          {(Object.keys(grouped) as Array<keyof typeof grouped>).map((cat) => {
            const years = grouped[cat];
            if (years.length === 0) return null;
            const Icon = CATEGORY_ICONS[cat];
            return (
              <SelectGroup key={cat}>
                <SelectLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
                  <Icon className={`h-3 w-3 ${CATEGORY_COLORS[cat]}`} />
                  {CATEGORY_LABELS[cat]}
                </SelectLabel>
                {years.map((y) => {
                  const info = HISTORICAL_EVENTS[y];
                  return (
                    <SelectItem
                      key={y}
                      value={String(y)}
                      className="flex items-center gap-2 py-1.5"
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-mono font-bold text-sm">{y}</span>
                        {info && (
                          <span className="text-[10px] text-muted-foreground truncate ml-2">
                            {info.event}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>

      {/* Historical context subtitle */}
      {eventInfo && (
        <div className="flex items-center gap-1 max-w-[180px]">
          <CategoryIcon className={`h-2.5 w-2.5 shrink-0 ${CATEGORY_COLORS[eventInfo.category]}`} />
          <span className="text-[10px] text-muted-foreground italic truncate">
            {eventInfo.event}
          </span>
        </div>
      )}
    </div>
  );
}
