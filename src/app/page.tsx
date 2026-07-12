import { Header } from "@/components/header";
import { PipelineExplorer } from "@/components/pipeline-explorer";
import { StockDetailDrawer } from "@/components/stock-detail-drawer";
import { CompositeIndexChart } from "@/components/panels/composite-index-chart";
import { TopMoversPanel } from "@/components/panels/top-movers-panel";
import { SectorHeatmapPanel } from "@/components/panels/sector-heatmap-panel";
import { VolumeAnomaliesPanel } from "@/components/panels/volume-anomalies-panel";
import { NoTradeDaysPanel } from "@/components/panels/notrade-days-panel";
import { CommandPalette } from "@/components/command-palette";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background grid-bg">
      <Header />
      <main className="flex-1 p-4 space-y-4">
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

        {/* Row 3: sector heatmap full width */}
        <div className="grid grid-cols-12 gap-4">
          <SectorHeatmapPanel />
        </div>

        {/* Footer note */}
        <div className="text-center text-[10px] text-muted-foreground py-4 border-t border-border">
          NYSE Terminal • Built on the itversity data & code repositories •
          Every chart shows its Hadoop MapReduce lineage — click any badge to inspect the source.
        </div>
      </main>

      {/* Overlays */}
      <PipelineExplorer />
      <StockDetailDrawer />
      <CommandPalette />
    </div>
  );
}
