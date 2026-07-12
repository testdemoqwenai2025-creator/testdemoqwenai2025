/**
 * use-pipeline-store.ts — controls the Pipeline Explorer slide-over.
 *
 * Clicking any "lineage badge" on a chart calls `open(jobId)`, which
 * slides in a side panel showing the original MapReduce/Spark source code
 * from code_repo alongside the description of what the job does.
 */

import { create } from "zustand";

interface PipelineState {
  isOpen: boolean;
  jobId: string | null;
  open: (jobId: string) => void;
  close: () => void;
  toggle: () => void;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  isOpen: false,
  jobId: null,
  open: (jobId) => set({ isOpen: true, jobId }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
