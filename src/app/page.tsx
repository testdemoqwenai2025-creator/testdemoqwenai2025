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
import { SqlEditorPanel } from "@/components/panels/sql-editor-panel";
import { MultiAssetPanel } from "@/components/panels/multi-asset-panel";
import { BriefingPanel } from "@/components/panels/briefing-panel";
import { PredictiveAlertsPanel } from "@/components/panels/predictive-alerts-panel";
import { ForecastPanel } from "@/components/panels/forecast-panel";
import { VolumeForecastPanel } from "@/components/panels/volume-forecast-panel";
import { ShortedStocksPanel } from "@/components/panels/shorted-stocks-panel";
import { LiveDeviationPanel } from "@/components/panels/live-deviation-panel";
import { NLQueryBar } from "@/components/nl-query-bar";
import { ChatAnalyst } from "@/components/chat-analyst";
import { CommandPalette } from "@/components/command-palette";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background grid-bg">
      <Header />
      <LiveTickerBar />
      <main className="flex-1 p-3 sm:p-4 space-y-3 sm:space-y-4">
        {/* NL Query Bar — full width */}
        <div className="relative">
          <NLQueryBar />
        </div>

        {/* Stage 8: AI Daily Briefing + Predictive Alerts */}
        <div className="grid grid-cols-12 gap-3 sm:gap-4">
          <BriefingPanel />
          <PredictiveAlertsPanel />
        </div>

        {/* Daily Range Forecast — 12 month outlook for day traders */}
        <div className="grid grid-cols-12 gap-3 sm:gap-4">
          <ForecastPanel />
        </div>

        {/* Volume Forecast + Live Deviation */}
        <div className="grid grid-cols-12 gap-3 sm:gap-4">
          <VolumeForecastPanel />
          <LiveDeviationPanel />
        </div>

        {/* Most Shorted Stocks */}
        <div className="grid grid-cols-12 gap-3 sm:gap-4">
          <ShortedStocksPanel />
        </div>

        {/* Stage 7: Multi-Asset Market Overview */}
        <div className="grid grid-cols-12 gap-3 sm:gap-4">
          <MultiAssetPanel />
        </div>

        {/* Row: composite index (8) + top movers (4) */}
        <div className="grid grid-cols-12 gap-3 sm:gap-4">
          <CompositeIndexChart />
          <TopMoversPanel />
        </div>

        {/* Row: volume anomalies + notrade days */}
        <div className="grid grid-cols-12 gap-3 sm:gap-4">
          <VolumeAnomaliesPanel />
          <NoTradeDaysPanel />
        </div>

        {/* Row: market treemap */}
        <div className="grid grid-cols-12 gap-3 sm:gap-4">
          <TreemapPanel />
        </div>

        {/* Row: watchlists + alerts + chat analyst */}
        <div className="grid grid-cols-12 gap-3 sm:gap-4">
          <WatchlistPanel />
          <AlertsPanel />
          <ChatAnalyst />
        </div>

        {/* Row: SQL Query Editor (Stage 5) */}
        <div className="grid grid-cols-12 gap-3 sm:gap-4">
          <SqlEditorPanel />
        </div>

        {/* Row: sector heatmap full width */}
        <div className="grid grid-cols-12 gap-3 sm:gap-4">
          <SectorHeatmapPanel />
        </div>

        {/* Footer note */}
        <div className="text-center text-[10px] text-muted-foreground py-4 border-t border-border px-4">
          <p className="mb-1">
            NYSE Terminal • Built on the itversity data & code repositories •
            Every chart shows its Hadoop MapReduce lineage
          </p>
          <p>
            Stage 3: Live feed, Watchlists, Alerts •
            Stage 4: AI Chat Analyst •
            Stage 5: DuckDB SQL Editor •
            Stage 6: Real Market Data Adapter •
            Stage 7: Multi-Asset (Stocks/ETFs/Crypto/Forex) •
            Stage 8: AI Briefing + Predictive Alerts •
            Stage 9: PWA •
            Forecast: 12-Month Daily Range + Volume + Shorted Stocks + Live Deviation
          </p>
          <p className="mt-1 text-muted-foreground/70">
            Press ⌘K for command palette, ⌘J for NL query, ⌘↵ to run SQL.
            Install as PWA: use browser menu → "Install app".
          </p>
        </div>
      </main>

      {/* Overlays */}
      <PipelineExplorer />
      <StockDetailDrawer />
      <CommandPalette />
    </div>
  );
}
