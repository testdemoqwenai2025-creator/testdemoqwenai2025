/**
 * use-selected-ticker.ts — controls which ticker is shown in the
 * Stock Detail panel. Selecting a ticker opens a right-side drawer.
 */

import { create } from "zustand";

interface TickerState {
  ticker: string | null;
  isOpen: boolean;
  select: (ticker: string) => void;
  close: () => void;
}

export const useSelectedTicker = create<TickerState>((set) => ({
  ticker: null,
  isOpen: false,
  select: (ticker) => set({ ticker, isOpen: true }),
  close: () => set({ isOpen: false }),
}));
