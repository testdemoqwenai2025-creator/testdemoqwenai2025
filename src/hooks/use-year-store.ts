/**
 * use-year-store.ts — client-side store for the selected "time-machine" year.
 *
 * The year selector is the spine of the time-machine feature: every panel
 * re-skins to the selected year's market moment. Zustand keeps it in sync
 * across all components without prop-drilling.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

const AVAILABLE_YEARS = Array.from({ length: 21 }, (_, i) => 1997 + i);

interface YearState {
  year: number;
  availableYears: number[];
  setYear: (y: number) => void;
  nextYear: () => void;
  prevYear: () => void;
}

export const useYearStore = create<YearState>()(
  persist(
    (set, get) => ({
      year: 2008, // default to the financial-crisis year — the most interesting cut
      availableYears: AVAILABLE_YEARS,
      setYear: (y) =>
        set({ year: Math.max(1997, Math.min(2017, y)) }),
      nextYear: () =>
        set((s) => ({ year: Math.min(2017, s.year + 1) })),
      prevYear: () =>
        set((s) => ({ year: Math.max(1997, s.year - 1) })),
    }),
    { name: "nyse-year" }
  )
);
