"use client";

import { useEffect, useState } from "react";
import { X, FileCode, GitBranch, Cpu, Database, FunctionSquare, ArrowRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePipelineStore } from "@/hooks/use-pipeline-store";

interface JobSource {
  file: string;
  content: string;
}
interface JobMeta {
  id: string;
  title: string;
  source_files: string[];
  description: string;
  consumes: string[];
  produces: string[];
  stage: "mapper_reducer" | "counter" | "map_side_join" | "derived";
}
interface PipelineResponse {
  job: JobMeta;
  sources: JobSource[];
}

const STAGE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  mapper_reducer: Cpu,
  counter: FunctionSquare,
  map_side_join: Database,
  derived: GitBranch,
};

export function PipelineExplorer() {
  const { isOpen, jobId, close } = usePipelineStore();
  const [data, setData] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !jobId) return;
    setLoading(true);
    fetch(`/api/pipeline?jobId=${encodeURIComponent(jobId)}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [isOpen, jobId]);

  const Icon = data?.job.stage ? STAGE_ICON[data.job.stage] : Cpu;

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-primary" />}
            <SheetTitle className="font-mono text-base">
              {data?.job.id ?? jobId}
            </SheetTitle>
          </div>
          <SheetDescription className="text-sm">
            {data?.job.title ?? "Pipeline lineage"}
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="p-6 text-muted-foreground text-sm">
            Loading job metadata…
          </div>
        )}

        {data && (
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {/* Description */}
              <section className="space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
                  What it does
                </h3>
                <p className="text-sm leading-relaxed">{data.job.description}</p>
              </section>

              {/* I/O */}
              <section className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
                    Consumes
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {data.job.consumes.map((c) => (
                      <Badge key={c} variant="outline" className="text-[10px] font-mono">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
                    Produces
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {data.job.produces.map((p) => (
                      <Badge key={p} variant="outline" className="text-[10px] font-mono">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
              </section>

              {/* Lineage diagram */}
              <section className="space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
                  Lineage
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  {data.job.consumes.map((c, i) => (
                    <span key={c} className="flex items-center gap-2">
                      {i > 0 && <span className="text-muted-foreground">+</span>}
                      <span className="px-2 py-1 rounded border border-border bg-card">
                        {c}
                      </span>
                    </span>
                  ))}
                  <ArrowRight className="h-3 w-3 text-primary" />
                  <span className="px-2 py-1 rounded border border-primary/30 bg-primary/10 text-primary">
                    {data.job.id}
                  </span>
                  <ArrowRight className="h-3 w-3 text-primary" />
                  {data.job.produces.map((p) => (
                    <span
                      key={p}
                      className="px-2 py-1 rounded border border-border bg-card"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </section>

              {/* Source code */}
              {data.sources.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <FileCode className="h-3 w-3" />
                    Original MapReduce / Spark source
                  </h3>
                  {data.sources.map((src) => (
                    <div
                      key={src.file}
                      className="rounded-md border border-border overflow-hidden"
                    >
                      <div className="px-3 py-1.5 text-[11px] font-mono text-muted-foreground bg-muted/30 border-b border-border truncate">
                        {src.file.replace(/^code_repo\//, "")}
                      </div>
                      <pre className="p-3 text-[11px] leading-relaxed overflow-x-auto bg-card/50 max-h-[400px] overflow-y-auto">
                        <code className="font-mono">{src.content}</code>
                      </pre>
                    </div>
                  ))}
                </section>
              )}

              {data.sources.length === 0 && (
                <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground text-center">
                  This is a derived job (not in the original course repository).
                  Computed in <span className="font-mono">scripts/build_artifacts.py</span>.
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}
