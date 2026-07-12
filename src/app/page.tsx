import { Header } from "@/components/header";
import { LiveTickerBar } from "@/components/live-ticker-bar";
import { PipelineExplorer } from "@/components/pipeline-explorer";
import { StockDetailDrawer } from "@/components/stock-detail-drawer";
import { CompositeIndexChart } from "@/components/panels/composite-index-chart";
import { TopMoversPanel } from "@/components/panels/top-movers-panel";
import { SectorHeatmapPanel } from "@/components/panels/sector-heatmap-panel";
import { VolumeAnomaliesPanel } from "@/components/panels/volume-anomalies-panel";
import { NoTradeDaysPanel } from "@/components/panels/notrade-days-panel";
import { TreemapPanel } from "@/components/panels/treemap-panel";
import { WatchlistPanel } from "@/components/panels/watchlist-panel";
import { AlertsPanel } from "@/components/panels/alerts-panel";
import { NLQueryBar } from "@/components/nl-query-bar";
import { ChatAnalyst } from "@/components/chat-analyst";
import { CommandPalette } from "@/components/command-palette";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background grid-bg">
      <Header />
      <LiveTickerBar />
      <main className="flex-1 p-4 space-y-4">
        {/* NL Query Bar — full width */}
        <div className="relative">
          <NLQueryBar />
        </div>

        {/* Row 1: composite index (8) + top movers (4) */}
        <div className="grid grid-cols-12 gap-4">
          <CompositeIndexChart />
          <TopMoversPanel />
        </div>

        {/* Row 2: volume anomalies + notrade days */}
        <div className="grid grid-cols-12 gap-4">
          <VolumeAnomaliesPanel />
          <NoTradeDaysPanel />
        </div>

        {/* Row 3: market treemap */}
        <div className="grid grid-cols-12 gap-4">
          <TreemapPanel />
        </div>

        {/* Row 4: watchlists + alerts + chat analyst (Stage 3 + 4) */}
        <div className="grid grid-cols-12 gap-4">
          <WatchlistPanel />
          <AlertsPanel />
          <ChatAnalyst />
        </div>

        {/* Row 5: sector heatmap full width */}
        <div className="grid grid-cols-12 gap-4">
          <SectorHeatmapPanel />
        </div>

        {/* Footer note */}
        <div className="text-center text-[10px] text-muted-foreground py-4 border-t border-border">
          NYSE Terminal • Built on the itversity data & code repositories •
          Every chart shows its Hadoop MapReduce lineage — click any badge to inspect the source. •
          Stage 3: Live feed (port 3003), Watchlists, Alerts •
          Stage 4: AI Chat Analyst •
          Press ⌘K for command palette, ⌘J for NL query.
        </div>
      </main>

      {/* Overlays */}
      <PipelineExplorer />
      <StockDetailDrawer />
      <CommandPalette />
    </div>
  );
}
