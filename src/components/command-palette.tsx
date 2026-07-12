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
import { Calendar, Cpu } from "lucide-react";

const PIPELINE_JOBS = [
  { id: "AvgStockVolumePerMonth", title: "Average Volume Per Month" },
  { id: "TopThreeStocksByVolume", title: "Top 3 Stocks by Volume" },
  { id: "TotalVolumePerYear", title: "Total Volume Per Year" },
  { id: "NoTradeDays", title: "No-Trade Days Counter" },
  { id: "StockCompanyJoinDistCache", title: "Stock ↔ Company Join" },
  { id: "CompositeIndex", title: "Composite Index" },
  { id: "VolumeAnomalies", title: "Volume Anomalies" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const { setYear, availableYears } = useYearStore();
  const openPipeline = usePipelineStore((s) => s.open);

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

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to year or pipeline job…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Time Machine — jump to year">
          {availableYears.map((y) => (
            <CommandItem
              key={y}
              value={`year ${y}`}
              onSelect={() => {
                setYear(y);
                setOpen(false);
              }}
            >
              <Calendar className="mr-2 h-4 w-4" />
              <span>Year {y}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Pipeline jobs — view source code">
          {PIPELINE_JOBS.map((j) => (
            <CommandItem
              key={j.id}
              value={`pipeline ${j.id} ${j.title}`}
              onSelect={() => {
                openPipeline(j.id);
                setOpen(false);
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
