"use client";

import { GitBranch, Cpu, Database, FunctionSquare } from "lucide-react";
import { usePipelineStore } from "@/hooks/use-pipeline-store";
import { cn } from "@/lib/utils";

const STAGE_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  mapper_reducer: {
    label: "MapReduce",
    icon: Cpu,
    color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  },
  counter: {
    label: "Counter",
    icon: FunctionSquare,
    color: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  },
  map_side_join: {
    label: "Map-side Join",
    icon: Database,
    color: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
  },
  derived: {
    label: "Derived",
    icon: GitBranch,
    color: "text-fuchsia-400 border-fuchsia-500/30 bg-fuchsia-500/10",
  },
};

interface LineageBadgeProps {
  jobId: string;
  jobTitle?: string;
  stage?: string;
  className?: string;
}

/**
 * LineageBadge — small clickable chip rendered next to every chart.
 * Click → opens the Pipeline Explorer slide-over with the original
 * MapReduce/Spark source code.
 */
export function LineageBadge({
  jobId,
  jobTitle,
  stage,
  className,
}: LineageBadgeProps) {
  const open = usePipelineStore((s) => s.open);
  const meta = STAGE_META[stage ?? "derived"] ?? STAGE_META.derived;
  const Icon = meta.icon;

  return (
    <button
      onClick={() => open(jobId)}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-mono uppercase tracking-wider transition-all hover:scale-105",
        meta.color,
        className
      )}
      title={jobTitle ? `Powered by ${jobTitle}` : `Job: ${jobId}`}
    >
      <Icon className="h-3 w-3" />
      <span>{jobId}</span>
    </button>
  );
}
