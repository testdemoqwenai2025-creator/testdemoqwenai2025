# Worklog — NYSE Terminal Project

---
Task ID: 1
Agent: main
Task: Build Stage 1 of NYSE Terminal — Hadoop-era market analytics dashboard

Work Log:
- Cloned github.com/dgadiraju/data.git (raw datasets) → /home/z/my-project/repo/
- Cloned github.com/dgadiraju/code.git (course scripts) → /home/z/my-project/code_repo/
- Inspected data: 9.4M NYSE daily price rows (1997–2017), 3,298 companies, plus HR/retail/LCA datasets
- Inspected code: hadoop/nyse/ MapReduce jobs (AvgStockVolumePerMonth, TopThreeStocksByVolume, TotalVolumePerYear, NoTradeDays, StockCompanyJoinDistCache)
- Discussed architecture with user → settled on Next.js + Python pre-processing pipeline
- User confirmed Stage 1 scope: features 1 (Pipeline Explorer) + 2 (Time-machine year selector) + 3 (Market-breadth analytics)
- Wrote /home/z/my-project/scripts/build_artifacts.py mirroring 5 MapReduce jobs in pandas
- First run OOM-killed (4GB RAM limit, string dtypes used too much memory)
- Rewrote loader to use categorical ticker + float32 + int32 → memory dropped from ~3GB to ~280MB
- Re-ran pipeline → all artifacts produced (composite_index.json, top_movers.json, sector_volume_heatmap.json, volume_anomalies.json, notrade_days.json, ticker_lookup.json, sectors.json, pipeline_meta.json)
- Per-ticker series initially top-200 only; user clicked REV (not in top 200) and got empty chart
- Rewrote build_per_ticker_series to write ALL 3,221 tickers via streaming year-by-year file handles
- Three OOM attempts later → streaming approach with low-memory column iteration succeeded; 3,221 ticker JSON files (985 MB total)
- Initialized Next.js 16 project via fullstack-dev skill
- Designed dark trading-desk theme in globals.css (deep navy + neon green/red, tabular numerals, custom scrollbars, grid background)
- Built data-access.ts server-side layer with caching + lineage decorator
- Built 8 API routes: /api/composite-index, /api/top-movers, /api/sector-heatmap, /api/volume-anomalies, /api/notrade-days, /api/stock/[ticker], /api/pipeline, /api/years, /api/tickers — each returns data + lineage metadata
- Fixed Infinity-in-JSON issue (ticker_lookup & top_movers had Infinity for total_return_pct when first_close=0)
- Built components:
  - Header (sticky, dark, with year selector + ticker search + ⌘K hint)
  - YearSelector (1997–2017 dropdown with historical event subtitles, prev/next arrows)
  - TickerSearch (debounced autocomplete with ticker/company/sector match)
  - LineageBadge (clickable chip showing MapReduce stage icon + job ID)
  - PipelineExplorer (Sheet slide-over showing job description + consumes/produces + lineage diagram + original Java source code)
  - CompositeIndexChart (Area chart with year-return, high, low, breadth stats)
  - TopMoversPanel (Tabs: gainers/losers/active, top 10 each)
  - SectorHeatmapPanel (13 sectors × 21 years diverging color heatmap, selected year ring-highlighted)
  - VolumeAnomaliesPanel (top 50 days with 5× 30-day-avg volume)
  - NoTradeDaysPanel (top 50 tickers with most missing trading days)
  - StockDetailDrawer (Sheet slide-over with OHLC line + volume bars + range tabs + Company Overview)
  - CommandPalette (⌘K → jump to year or pipeline job)
- Zustand stores: useYearStore (with persist), usePipelineStore, useSelectedTicker
- Fixed XAxis rendering issue (Recharts needs type="number" + domain for numeric date axes)
- Tested all 11 API endpoints via curl → all return 200
- Tested via agent-browser: main page renders, lineage badges open Pipeline Explorer with Java source, ticker click opens stock detail, command palette works
- Memory pressure: Turbopack + agent-browser chrome processes hit 4GB OOM limit; killed chrome and relied on curl + targeted eval() to verify rendering

Stage Summary:
- Stage 1 features complete: Pipeline Explorer, Time-machine year selector, Market-breadth analytics
- 5 MapReduce jobs reproduced in pandas with identical logic (mapper → combiner → reducer pattern preserved)
- Every chart carries a LineageBadge linking back to the original Java/Scala source code in code_repo
- 21 years of NYSE data (9.4M rows) compressed to ~5.7 MB of pre-computed JSON artifacts + 985 MB of per-ticker series files
- All 3,221 tickers searchable; any ticker click opens detail drawer with 21-year OHLCV history
- Year selector with historical context (e.g. 2008 → "Global financial crisis")
- Dark trading-desk theme with tabular numerals, custom scrollbars, grid background
- Dev server running on port 3000, all endpoints verified
