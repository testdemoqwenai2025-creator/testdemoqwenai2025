# NYSE Terminal — Hadoop-Era Market Analytics

A modern, Yahoo Finance–style market explorer built on top of the
[itversity/data](https://github.com/dgadiraju/data) and
[itversity/code](https://github.com/dgadiraju/code) repositories.

What makes it different: instead of hiding the data engineering like Yahoo
Finance does, **every chart exposes its Hadoop MapReduce lineage** — click
any lineage badge to see the original Java/Scala mapper/reducer source code
that inspired the metric, alongside the modern pandas equivalent that
actually computes it.

---

## 🔗 Live Preview

**👉 [https://preview-0df067ab-7eb2-4044-8d35-2c2c5ce3c169.space-z.ai/](https://preview-0df067ab-7eb2-4044-8d35-2c2c5ce3c169.space-z.ai/)**

The app is a PWA — install it on your phone or desktop via your browser's "Install app" menu for offline access.

---

## ✨ Stage 1 Features

### 1. Pipeline Explorer (Feature 1)
Every chart carries a small `LineageBadge` showing the MapReduce job that
produced its data. Click → a slide-over panel opens with:
- The original `code_repo` Java/Scala source code (mapper, reducer, combiner)
- A description of what the job does, in MapReduce terms
- A lineage diagram: `consumes → job → produces`
- The JSON artifact the job writes

Reproduces **5 original course jobs**:
| Job | Source | What it does |
|---|---|---|
| `AvgStockVolumePerMonth` | `hadoop/nyse/src/main/java/nyse/avgstockvolpermonth/` | Mapper → combiner → reducer for avg monthly volume per ticker |
| `TopThreeStocksByVolume` | `hadoop/nyse/src/main/java/nyse/topthreestocksbyvolume/` | Top-N per day using `TextPair` key + custom partitioner |
| `TotalVolumePerYear` | `hadoop/nyse/src/main/java/nyse/totalvolume/` | Simple `(ticker\|year, volume)` reduceByKey |
| `NoTradeDays` | `hadoop/nyse/src/main/java/nyse/counters/NoTradeDays.java` | MapReduce counter for zero-volume days |
| `StockCompanyJoinDistCache` | `hadoop/nyse/src/main/java/nyse/stockcompanyjoin/distcache/` | Distributed-cache map-side join with company list |

Plus 2 derived jobs (not in the original course): `CompositeIndex` and
`VolumeAnomalies`.

### 2. Time-Machine Year Selector (Feature 2)
A prominent 1997–2017 dropdown in the header. Every panel re-skins to the
selected year's market moment. Each year carries a historical-context
subtitle (e.g. 2008 → "Global financial crisis", 2000 → "Dot-com crash
begins").

### 3. Market-Breadth Analytics (Feature 3)
- **Composite index chart** — equal-weighted daily avg close + advancing /
  declining breadth
- **Top movers panel** — gainers / losers / most-active, top 10 each
- **Sector × year volume heatmap** — 13 sectors × 21 years, diverging
  red→green color scale, selected year ring-highlighted
- **Volume anomalies feed** — top 50 days where volume ≥ 5× the 30-day
  rolling average
- **No-trade days panel** — top 50 tickers with most missing trading days
- **Stock detail drawer** — any of 3,221 tickers searchable; OHLC line +
  volume bars + 6 range presets (1M/3M/6M/YTD/1Y/MAX) + full company
  overview

---

## ✨ Stage 2 Features

### 4. NL Query Bar (Feature 4)
A natural-language search bar at the top: *"show me tech stocks whose 2008
volume doubled vs 2007"* or *"which energy tickers survived 2008 with
positive returns"*. Translates to a pandas query and renders the result as
a chart or table.

### 5. Modern UX Enhancements (Feature 5)
- **Market treemap** — sector → industry → ticker, sized by total volume,
  colored by period return
- **Sparkline tables** — every row in a list has an inline 30-day mini-chart
- **Enhanced command palette (⌘K)** — jump to tickers, years, pipeline jobs,
  or saved queries

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND  (Next.js 16, React 19, Tailwind v4, shadcn/ui)   │
│  Dark trading-desk UI, ⌘K palette, sparklines, treemap      │
└─────────────────────────────────────────────────────────────┘
                          │  HTTP / JSON
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  MIDDLEWARE  (Next.js Route Handlers /api/...)              │
│  Reads pre-computed JSON, attaches lineage metadata         │
└─────────────────────────────────────────────────────────────┘
                          │  reads
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  DATA LAYER  (pre-computed JSON on disk)                    │
│  /home/z/my-project/data/processed/                         │
└─────────────────────────────────────────────────────────────┘
                          ▲  produced by
                          │
┌─────────────────────────────────────────────────────────────┐
│  PRE-PROCESSING  (Python / pandas, one-time)                │
│  /home/z/my-project/scripts/build_artifacts.py              │
│  Mirrors the 5 MapReduce jobs in pandas                     │
└─────────────────────────────────────────────────────────────┘
```

### Why this split
| Layer | Tech | Why |
|---|---|---|
| **Frontend** | Next.js 16 + shadcn/ui | Modern, server-components-first, dark fintech UI |
| **Middleware** | Next.js Route Handlers | Thin, stateless, fast. No DB needed for v1 |
| **Data layer** | Pre-computed JSON | 133 MB raw → ~5.7 MB aggregates + 985 MB per-ticker. Instant page loads |
| **Pre-processing** | Python + pandas | Reproduces Hadoop MapReduce logic in pandas — same key/value reasoning, same outputs |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ and [bun](https://bun.sh)
- Python 3.10+ with pandas

### 1. Clone the source data + course repos
```bash
git clone https://github.com/dgadiraju/data.git repo
git clone https://github.com/dgadiraju/code.git code_repo
```

### 2. Run the pre-processing pipeline
```bash
pip install pandas numpy
python scripts/build_artifacts.py
```
This reads `repo/nyse_all/nyse_data/NYSE_*.txt.gz` (9.4M rows, 1997–2017),
joins with the company list, and writes JSON artifacts to
`data/processed/`. Takes ~3 minutes on a 4GB RAM machine.

### 3. Start the dev server
```bash
bun install
bun run dev
```
Open http://localhost:3000

---

## 📁 Project Structure

```
.
├── repo/                          # cloned dgadiraju/data (raw datasets)
├── code_repo/                     # cloned dgadiraju/code (course scripts)
├── scripts/
│   └── build_artifacts.py         # Python pre-processing pipeline
├── data/
│   └── processed/                 # JSON artifacts (gitignored — large)
│       ├── composite_index.json
│       ├── top_movers.json
│       ├── sector_volume_heatmap.json
│       ├── volume_anomalies.json
│       ├── notrade_days.json
│       ├── ticker_lookup.json
│       ├── pipeline_meta.json
│       └── tickers/               # 3,221 per-ticker JSON files
└── src/
    ├── app/
    │   ├── page.tsx               # main dashboard
    │   ├── layout.tsx             # dark theme root layout
    │   ├── globals.css            # trading-desk theme
    │   └── api/                   # 8 route handlers
    │       ├── composite-index/
    │       ├── top-movers/
    │       ├── sector-heatmap/
    │       ├── volume-anomalies/
    │       ├── notrade-days/
    │       ├── stock/[ticker]/
    │       ├── pipeline/
    │       ├── tickers/
    │       └── years/
    ├── components/
    │   ├── header.tsx
    │   ├── year-selector.tsx
    │   ├── ticker-search.tsx
    │   ├── lineage-badge.tsx
    │   ├── pipeline-explorer.tsx
    │   ├── stock-detail-drawer.tsx
    │   ├── command-palette.tsx
    │   └── panels/
    │       ├── composite-index-chart.tsx
    │       ├── top-movers-panel.tsx
    │       ├── sector-heatmap-panel.tsx
    │       ├── volume-anomalies-panel.tsx
    │       └── notrade-days-panel.tsx
    ├── hooks/
    │   ├── use-year-store.ts      # Zustand — selected year
    │   ├── use-pipeline-store.ts  # Zustand — pipeline panel state
    │   └── use-selected-ticker.ts # Zustand — selected ticker
    └── lib/
        └── data-access.ts         # server-side data layer + lineage decorator
```

---

## 🔬 How the MapReduce jobs map to pandas

| Original MapReduce job | pandas equivalent in `build_artifacts.py` |
|---|---|
| Mapper emits `(ticker\|month, volume)`; combiner sums; reducer divides | `prices.groupby(["ticker","month"])["volume"].mean()` |
| `TextPair(date, ticker)` + custom partitioner + top-N in reducer | `prices.groupby("yyyymmdd").apply(lambda g: g.nlargest(N, "volume"))` |
| `(ticker\|year, volume)` reduceByKey | `prices.groupby(["ticker","year"])["volume"].sum()` |
| Counter incremented when `volume == 0` | set difference: `all_trading_days - ticker.traded_days` |
| Distributed cache broadcast + map-side join | `pd.merge(prices, companies, on="ticker", how="left")` |

The logic is identical — only the execution engine changes.

---

## 🛣 Roadmap — How this evolves beyond Yahoo Finance

### Stage 3: Real-time + personalization
- WebSocket live price feed (mock or real)
- Saved watchlists and custom dashboards per user
- Alerting on volume anomalies / price thresholds

### Stage 4: AI-native features
- **Conversational analyst** — chat with the data ("compare GE and F
  performance during 2008 crisis")
- **Auto-generated insights** — daily "what happened today" summaries
  using an LLM
- **Anomaly explanations** — when a volume anomaly fires, auto-pull
  related news context

### Stage 5: Modern data stack
- Replace JSON artifacts with **DuckDB** or **ClickHouse** for ad-hoc
  SQL queries without pre-computation
- **dbt** models mirroring the MapReduce jobs as documented
  transformations
- **Apache Iceberg** table format for time-travel queries on the raw data

### Stage 6: Beyond stocks
- Multi-asset: ETFs, options, crypto
- Cross-asset analytics (e.g. stock vs. sector ETF correlation)
- Portfolio backtesting with the same lineage-exposed philosophy

### Why this beats Yahoo Finance
1. **Transparency** — every metric shows its computation lineage; no
   black-box numbers
2. **Historical depth** — 21 years of data with time-machine UX, not just
   "the current moment"
3. **Teaching artifact** — the dashboard doubles as a learning tool for
   MapReduce concepts
4. **AI-native** — NL query bar is first-class, not buried in a settings menu
5. **Open data** — runs on public datasets, no vendor lock-in

---

## 📜 License

Educational use, built on the itversity course materials by Durga Gadiraju.
