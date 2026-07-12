"use client";

import { Activity } from "lucide-react";
import { YearSelector } from "./year-selector";
import { TickerSearch } from "./ticker-search";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4 px-4 py-2.5">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <div className="flex flex-col leading-none">
              <span className="font-bold text-sm tracking-tight">
                NYSE Terminal
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Hadoop-Era Market Analytics
              </span>
            </div>
          </div>
        </div>

        {/* Center: search */}
        <div className="flex-1 flex justify-center max-w-md">
          <TickerSearch />
        </div>

        {/* Right: year selector */}
        <YearSelector />
      </div>
    </header>
  );
}
