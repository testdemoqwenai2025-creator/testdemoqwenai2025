#!/usr/bin/env python3
"""
build_artifacts.py — NYSE data pre-processing pipeline.

Mirrors the MapReduce/Spark jobs from github.com/dgadiraju/code.git and produces
JSON artifacts for the Next.js middleware to consume.

Jobs reproduced:
  1. AvgStockVolumePerMonth   -> sector_volume_heatmap.json, monthly_volume_by_ticker.json
  2. TopThreeStocksByVolume   -> top_volume_per_day.json (top-N per day, generalised)
  3. TotalVolumePerYear       -> yearly_totals.json + top_movers (gainers/losers/active)
  4. NoTradeDays              -> notrade_days.json
  5. StockCompanyJoin         -> ticker_lookup.json (ticker -> company meta)

Additional derived artifacts:
  - composite_index.json     (equal-weighted avg close per trading day)
  - volume_anomalies.json    (5x 30-day rolling avg volume)
  - pipeline_meta.json       (lineage metadata for the Pipeline Explorer)
"""

import gzip
import json
import os
import sys
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd

# ---------- Paths ----------
RAW_DIR     = Path("/home/z/my-project/repo/nyse_all/nyse_data")
COMPANY_CSV = Path("/home/z/my-project/repo/nyse_all/nyse_stocks/companylist_noheader.csv")
OUT_DIR     = Path("/home/z/my-project/data/processed")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ---------- Helpers ----------
def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

def write_json(name, obj):
    path = OUT_DIR / name
    # Use allow_nan=False to fail loudly on Infinity/NaN, then strip them.
    # We do a two-pass: first serialise with allow_nan=True (which uses
    # JS-compatible Infinity), then regex-replace to null so strict JSON
    # parsers (like the Next.js route handler) can read it.
    raw = json.dumps(obj, default=str, allow_nan=True)
    import re
    raw = re.sub(r'(:\s*)-?Infinity', r'\1null', raw)
    raw = re.sub(r'(:\s*)NaN', r'\1null', raw)
    with open(path, "w") as f:
        f.write(raw)
    sz = path.stat().st_size / 1024
    log(f"  wrote {name}  ({sz:.0f} KB)")

# ---------- 1. Load NYSE daily data ----------
def load_nyse():
    """Load all 21 yearly NYSE .gz files into a single typed DataFrame.
    Uses categorical dtype for ticker to keep memory low (4 GB RAM limit)."""
    log("Loading NYSE daily files (1997-2017)...")
    cols = ["ticker", "date", "open", "high", "low", "close", "volume"]
    frames = []
    for gz in sorted(RAW_DIR.glob("NYSE_*.txt.gz")):
        df = pd.read_csv(
            gz, header=None, names=cols,
            dtype={
                "ticker": "string",
                "date":   "int32",
                "open":   "float32",
                "high":   "float32",
                "low":    "float32",
                "close":  "float32",
                "volume": "int64",
            },
        )
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    log(f"  loaded {len(df):,} rows total")

    # Convert ticker to categorical (saves ~80% memory vs string)
    df["ticker"] = df["ticker"].astype("category")

    # Derive year/month/yyyymm from the integer date
    df["yyyymmdd"] = df["date"]
    df["year"]     = (df["date"] // 10000).astype("int16")
    df["month"]    = (df["date"] // 100).astype("int32")
    df = df.drop(columns=["date"])
    df = df.dropna(subset=["close"])
    log(f"  after cleanup: {len(df):,} rows  years {df.year.min()}-{df.year.max()}")
    log(f"  memory: {df.memory_usage(deep=True).sum() / 1024 / 1024:.0f} MB")
    return df

# ---------- 2. Load company list ----------
def load_companies():
    log("Loading company list...")
    df = pd.read_csv(
        COMPANY_CSV, header=None, sep="|",
        names=["ticker","name","lastsale","marketcap","adrtso","ipoyear",
               "sector","industry","summaryquote","_junk"],
        dtype=str, on_bad_lines="skip",
    )
    df = df[["ticker","name","lastsale","marketcap","ipoyear","sector","industry"]]
    df["ticker"]   = df["ticker"].str.strip().str.upper()
    df["name"]     = df["name"].fillna("").str.strip()
    df["sector"]   = df["sector"].fillna("Unknown").str.strip()
    df["industry"] = df["industry"].fillna("Unknown").str.strip()
    df["ipoyear"]  = pd.to_numeric(df["ipoyear"].replace("n/a", np.nan),
                                    errors="coerce")
    df["marketcap"]= pd.to_numeric(df["marketcap"].replace("n/a", np.nan),
                                    errors="coerce")
    df["lastsale"] = pd.to_numeric(df["lastsale"].replace("n/a", np.nan),
                                    errors="coerce")
    log(f"  loaded {len(df):,} companies across "
        f"{df['sector'].nunique()} sectors")
    return df

# ---------- 3. StockCompanyJoin (DistCache join) ----------
def build_ticker_lookup(prices, companies):
    log("Building ticker_lookup (StockCompanyJoin)...")
    # Per-ticker summary across full history
    # Avoid slow groupby.apply — use sort + first/last instead.
    sorted_prices = prices.sort_values(["ticker", "yyyymmdd"])
    g = sorted_prices.groupby("ticker", sort=False)
    summary = pd.DataFrame({
        "first_date":  g["yyyymmdd"].first(),
        "last_date":   g["yyyymmdd"].last(),
        "first_close": g["close"].first(),
        "last_close":  g["close"].last(),
        "total_volume": g["volume"].sum().astype("int64"),
        "trading_days": g.size(),
    }).reset_index()
    summary["total_return_pct"] = (
        (summary["last_close"] / summary["first_close"]) - 1
    ) * 100
    # Join with company meta
    merged = summary.merge(companies, on="ticker", how="left")
    merged["sector"]   = merged["sector"].fillna("Unknown")
    merged["industry"] = merged["industry"].fillna("Unknown")
    merged["name"]     = merged["name"].fillna(merged["ticker"])
    # Round numeric fields for JSON
    merged = merged.round({"first_close":2, "last_close":2, "total_return_pct":2,
                           "marketcap":0, "lastsale":2})
    # to records (typed)
    records = merged.to_dict("records")
    # cast np types for JSON
    clean = []
    for r in records:
        clean.append({
            "ticker":          str(r["ticker"]),
            "name":            str(r["name"]),
            "sector":          str(r["sector"]),
            "industry":        str(r["industry"]),
            "ipoyear":         None if pd.isna(r["ipoyear"]) else int(r["ipoyear"]),
            "marketcap":       None if pd.isna(r["marketcap"]) else float(r["marketcap"]),
            "first_date":      int(r["first_date"]),
            "last_date":       int(r["last_date"]),
            "first_close":     round(float(r["first_close"]),2),
            "last_close":      round(float(r["last_close"]),2),
            "total_volume":    int(r["total_volume"]),
            "trading_days":    int(r["trading_days"]),
            "total_return_pct":round(float(r["total_return_pct"]),2) if pd.notna(r["total_return_pct"]) else None,
        })
    write_json("ticker_lookup.json", clean)
    # Also write the sectors list (for filter dropdowns)
    sectors = sorted(merged["sector"].dropna().unique().tolist())
    write_json("sectors.json", sectors)
    return merged

# ---------- 4. Composite index (equal-weighted avg close per day) ----------
def build_composite_index(prices):
    log("Building composite_index (equal-weighted daily close)...")
    daily = prices.groupby(["year","yyyymmdd"]).agg(
        avg_close=("close", "mean"),
        avg_volume=("volume", "mean"),
        advancing=("close", lambda x: int((x.diff() > 0).sum())),
        declining=("close", lambda x: int((x.diff() < 0).sum())),
        total_volume=("volume", "sum"),
        n_tickers=("ticker", "nunique"),
    ).reset_index()
    # Sharpen: change % vs previous day
    daily = daily.sort_values("yyyymmdd")
    daily["change_pct"] = daily["avg_close"].pct_change() * 100
    daily = daily.round({"avg_close":2, "avg_volume":0,
                         "change_pct":2, "total_volume":0})
    # Write per-year and combined
    records = []
    for r in daily.to_dict("records"):
        records.append({
            "date":        int(r["yyyymmdd"]),
            "year":        int(r["year"]),
            "avg_close":   round(float(r["avg_close"]),2),
            "change_pct":  None if pd.isna(r["change_pct"]) else round(float(r["change_pct"]),2),
            "avg_volume":  int(r["avg_volume"]),
            "total_volume":int(r["total_volume"]),
            "n_tickers":   int(r["n_tickers"]),
            "advancing":   int(r["advancing"]),
            "declining":   int(r["declining"]),
        })
    write_json("composite_index.json", records)
    return daily

# ---------- 5. AvgStockVolumePerMonth -> sector heatmap + monthly ticker vol ----------
def build_sector_heatmap(prices, ticker_meta):
    log("Building sector_volume_heatmap (AvgStockVolumePerMonth)...")
    meta = ticker_meta[["ticker","sector"]].drop_duplicates()
    joined = prices.merge(meta, on="ticker", how="left")
    joined["sector"] = joined["sector"].fillna("Unknown")
    # Per sector per year: avg monthly volume
    grp = joined.groupby(["sector","year"]).agg(
        avg_monthly_volume=("volume", lambda x: int(x.mean())),
        total_volume=("volume", "sum"),
        n_tickers=("ticker", "nunique"),
    ).reset_index()
    # Pivot to sector x year matrix
    pivot = grp.pivot_table(index="sector", columns="year",
                            values="avg_monthly_volume", fill_value=0)
    # YoY change pct
    yoy = pivot.pct_change(axis=1) * 100
    # Build a long-format list for the frontend
    cells = []
    for sector in pivot.index:
        for year in pivot.columns:
            v = int(pivot.loc[sector, year])
            if v == 0:
                continue
            prev = pivot.loc[sector, year-1] if (year-1) in pivot.columns else np.nan
            delta = None if pd.isna(prev) or prev == 0 else round(((v/prev)-1)*100, 2)
            cells.append({
                "sector": sector,
                "year":   int(year),
                "avg_monthly_volume": v,
                "yoy_pct": delta,
                "n_tickers": int(grp[(grp.sector==sector)&(grp.year==year)]["n_tickers"].iloc[0]) if not grp[(grp.sector==sector)&(grp.year==year)].empty else 0,
            })
    write_json("sector_volume_heatmap.json", {
        "sectors": sorted(pivot.index.tolist()),
        "years":   sorted(pivot.columns.tolist()),
        "cells":   cells,
    })
    return joined

# ---------- 6. TopThreeStocksByVolume per day (generalised to top 10) ----------
def build_top_volume_per_day(prices, top_n=10):
    log(f"Building top_volume_per_day (top {top_n} per day)...")
    # For each year, find the day-level top N
    out = {}
    for year, sub in prices.groupby("year"):
        # per-day, per-ticker total volume (already daily, but group to be safe)
        day_ticker = sub.groupby(["yyyymmdd","ticker"], sort=False)["volume"].sum().reset_index()
        # for each day, sort desc and take top N
        day_ticker = day_ticker.sort_values(["yyyymmdd","volume"], ascending=[True, False])
        top = day_ticker.groupby("yyyymmdd", sort=False).head(top_n).reset_index(drop=True)
        top["rank"] = top.groupby("yyyymmdd", sort=False)["volume"].rank(ascending=False, method="first").astype(int)
        out[str(year)] = [
            {
                "date":   int(r["yyyymmdd"]),
                "ticker": str(r["ticker"]),
                "volume": int(r["volume"]),
                "rank":   int(r["rank"]),
            }
            for _, r in top.iterrows()
        ]
    write_json("top_volume_per_day.json", out)
    return out

# ---------- 7. Top movers (gainers/losers/active) per year ----------
def build_top_movers(prices):
    log("Building top_movers (TotalVolumePerYear + returns)...")
    out = {}
    for year, sub in prices.groupby("year"):
        sub = sub.sort_values(["ticker","yyyymmdd"])
        # First and last close per ticker in that year
        per_ticker = sub.groupby("ticker", sort=False).agg(
            first_close=("close", "first"),
            last_close=("close", "last"),
            total_volume=("volume", "sum"),
            high=("high", "max"),
            low=("low", "min"),
            n_days=("yyyymmdd", "nunique"),
        ).reset_index()
        per_ticker["return_pct"] = (
            (per_ticker["last_close"] / per_ticker["first_close"]) - 1
        ) * 100
        # Filter: must have at least 30 trading days to be a valid mover
        valid = per_ticker[per_ticker["n_days"] >= 30].copy()
        gainers  = valid.nlargest(10, "return_pct")
        losers   = valid.nsmallest(10, "return_pct")
        active   = valid.nlargest(10, "total_volume")
        def to_list(df, sort_key=None, asc=False):
            d = df.copy()
            if sort_key:
                d = d.sort_values(sort_key, ascending=asc)
            return [{
                "ticker":       str(r["ticker"]),
                "return_pct":   round(float(r["return_pct"]),2),
                "total_volume": int(r["total_volume"]),
                "first_close":  round(float(r["first_close"]),2),
                "last_close":   round(float(r["last_close"]),2),
                "high":         round(float(r["high"]),2),
                "low":          round(float(r["low"]),2),
                "n_days":       int(r["n_days"]),
            } for _, r in d.iterrows()]
        out[str(year)] = {
            "gainers":  to_list(gainers,  "return_pct",    False),
            "losers":   to_list(losers,   "return_pct",    True),
            "active":   to_list(active,   "total_volume",  False),
        }
    write_json("top_movers.json", out)
    return out

# ---------- 8. No-trade days ----------
def build_notrade_days(prices):
    log("Building notrade_days (NoTradeDays counter)...")
    out = {}
    for year, sub in prices.groupby("year"):
        days = sorted(sub["yyyymmdd"].unique())
        if not days:
            continue
        first_day, last_day = int(days[0]), int(days[-1])
        # For each ticker, the days it traded
        # Group once and convert to set; this is the heaviest part.
        traded_days = sub.groupby("ticker", sort=False)["yyyymmdd"].apply(set)
        all_days_set = set(days)
        silent = []
        for ticker, days_set in traded_days.items():
            missing = all_days_set - days_set
            if missing:
                silent.append({
                    "ticker":   str(ticker),
                    "n_missing": int(len(missing)),
                    "first_missing": int(min(missing)),
                    "last_missing":  int(max(missing)),
                })
        silent = sorted(silent, key=lambda x: -x["n_missing"])[:50]  # top 50
        out[str(year)] = {
            "year":       int(year),
            "first_day":  first_day,
            "last_day":   last_day,
            "n_trading_days": int(len(all_days_set)),
            "top_silent": silent,
        }
    write_json("notrade_days.json", out)
    return out

# ---------- 9. Volume anomalies (5x 30-day rolling avg) ----------
def build_volume_anomalies(prices, threshold=5.0, window=30, top_per_year=50):
    log(f"Building volume_anomalies (>{threshold}x {window}d avg)...")
    out = {}
    for year, sub in prices.groupby("year"):
        sub = sub.sort_values(["ticker","yyyymmdd"])
        anomalies = []
        # Per-ticker rolling mean using groupby + transform (vectorized, fast)
        sub2 = sub.copy()
        sub2["roll_mean"] = (
            sub2.groupby("ticker", sort=False)["volume"]
                .transform(lambda x: x.rolling(window=window, min_periods=10).mean())
        )
        sub2["ratio"] = sub2["volume"] / sub2["roll_mean"].replace(0, np.nan)
        an = sub2[(sub2["ratio"] >= threshold) & (sub2["roll_mean"] > 1000)]
        # Sort by ratio desc, take top N per year
        an = an.sort_values("ratio", ascending=False).head(top_per_year)
        for _, r in an.iterrows():
            anomalies.append({
                "ticker":   str(r["ticker"]),
                "date":     int(r["yyyymmdd"]),
                "volume":   int(r["volume"]),
                "avg_30d":  int(r["roll_mean"]),
                "ratio":    round(float(r["ratio"]), 2),
                "close":    round(float(r["close"]), 2),
            })
        out[str(year)] = anomalies
    write_json("volume_anomalies.json", out)
    return out

# ---------- 10. Pipeline metadata (lineage) ----------
PIPELINE_META = [
    {
        "id": "AvgStockVolumePerMonth",
        "title": "Average Stock Volume Per Month",
        "source_files": [
            "code_repo/hadoop/nyse/src/main/java/nyse/avgstockvolpermonth/AvgStockVolPerMonthMapper.java",
            "code_repo/hadoop/nyse/src/main/java/nyse/avgstockvolpermonth/AvgStockVolPerMonthReducer.java",
            "code_repo/hadoop/nyse/src/main/java/nyse/avgstockvolpermonth/AvgStockVolPerMonthCombiner.java",
        ],
        "description": "Computes average monthly trade volume per stock ticker. Mapper emits (ticker|month, volume); combiner pre-aggregates per partition; reducer divides total volume by record count. Used here to drive the sector × year heatmap.",
        "consumes": ["NYSE daily prices"],
        "produces": ["sector_volume_heatmap.json"],
        "stage": "mapper_reducer",
    },
    {
        "id": "TopThreeStocksByVolume",
        "title": "Top 3 Stocks by Volume Per Day",
        "source_files": [
            "code_repo/hadoop/nyse/src/main/java/nyse/topthreestocksbyvolume/TopThreeStocksByVolumePerDayDriver.java",
            "code_repo/hadoop/nyse/src/main/java/nyse/topthreestocksbyvolume/TopThreeStocksByVolumePerDayMapper.java",
            "code_repo/hadoop/nyse/src/main/java/nyse/topthreestocksbyvolume/TopThreeStocksByVolumePerDayReducer.java",
        ],
        "description": "For each trading day, find the top 3 stocks by volume. Uses a TextPair key (date, ticker) with custom partitioner and grouping comparator so all records of a date land on the same reducer; reducer keeps the top-N in memory. Generalised here to top 10 and surfaced as the 'most active' panel + volume anomaly feed.",
        "consumes": ["NYSE daily prices"],
        "produces": ["top_volume_per_day.json"],
        "stage": "mapper_reducer",
    },
    {
        "id": "TotalVolumePerYear",
        "title": "Total Volume Per Year Per Stock",
        "source_files": [
            "code_repo/hadoop/nyse/src/main/java/nyse/totalvolume/TotalVolumePerYearPerStock.java",
        ],
        "description": "Sums total trade volume per ticker per year. Simple (ticker|year, volume) reduceByKey. Output drives the 'most active' list on the Top Movers panel.",
        "consumes": ["NYSE daily prices"],
        "produces": ["top_movers.json (active slice)"],
        "stage": "mapper_reducer",
    },
    {
        "id": "NoTradeDays",
        "title": "No-Trade Days Counter",
        "source_files": [
            "code_repo/hadoop/nyse/src/main/java/nyse/counters/NoTradeDays.java",
        ],
        "description": "Counts days on which a registered ticker had zero trades. Uses MapReduce counters incremented in the mapper when a record with volume=0 is seen. Here we generalise: for each year, find tickers with the most missing days in the trading calendar.",
        "consumes": ["NYSE daily prices"],
        "produces": ["notrade_days.json"],
        "stage": "counter",
    },
    {
        "id": "StockCompanyJoinDistCache",
        "title": "Stock ↔ Company Join (Distributed Cache)",
        "source_files": [
            "code_repo/hadoop/nyse/src/main/java/nyse/stockcompanyjoin/distcache/StockCompanyJoinDistCacheDriver.java",
            "code_repo/hadoop/nyse/src/main/java/nyse/stockcompanyjoin/distcache/StockCompanyJoinDistCacheMapper.java",
            "code_repo/hadoop/nyse/src/main/java/nyse/parsers/CompanyParser.java",
        ],
        "description": "Broadcasts the small company-list CSV to all mappers via Hadoop's Distributed Cache, then enriches each price record with sector/industry in-map. Reproduced here as a pandas merge, powering the ticker lookup table and the sector dimension of the heatmap.",
        "consumes": ["NYSE daily prices", "NYSE company list"],
        "produces": ["ticker_lookup.json", "sectors.json"],
        "stage": "map_side_join",
    },
    {
        "id": "CompositeIndex",
        "title": "Composite Market Index (derived)",
        "source_files": [],
        "description": "Not in the original course. Equal-weighted average daily close across all tickers that traded that day, plus market breadth (advancing vs declining). Acts as a self-computed benchmark line in the same spirit as the original course's per-stock analytics.",
        "consumes": ["NYSE daily prices"],
        "produces": ["composite_index.json"],
        "stage": "derived",
    },
    {
        "id": "VolumeAnomalies",
        "title": "Volume Anomaly Detector (derived)",
        "source_files": [],
        "description": "Not in the original course. Per ticker, compute a 30-day rolling mean of volume and flag any day where volume >= 5x that mean. Surfaces unusual activity for further investigation.",
        "consumes": ["NYSE daily prices"],
        "produces": ["volume_anomalies.json"],
        "stage": "derived",
    },
]

def write_pipeline_meta():
    log("Writing pipeline_meta.json (lineage)...")
    write_json("pipeline_meta.json", PIPELINE_META)

# ---------- Per-ticker daily series (for stock detail page) ----------
def build_per_ticker_series(prices, ticker_meta):
    """Save per-ticker daily OHLC + volume as one JSON file per ticker.
    Writes ALL tickers in the dataset (~3,200 files, ~100 MB total).

    Memory-safe approach: write each ticker's records to its own file as a
    JSON array, growing it year-by-year without ever holding the full
    dataset in memory.
    """
    log("Building per_ticker_series for all tickers (streaming)...")
    out_dir = OUT_DIR / "tickers"
    if out_dir.exists():
        import shutil
        shutil.rmtree(out_dir)
    out_dir.mkdir(exist_ok=True)

    # Cache open file handles (we have ~3,200 tickers, well within fd limits
    # if we cap at ~3,500 and recycle). Each file is built up as a JSON array.
    files: dict[str, object] = {}
    counts: dict[str, int] = {}

    # Iterate as numpy arrays for minimum memory overhead.
    # Extract columns once.
    for year, sub in prices.groupby("year", sort=True):
        log(f"  year {year}: {len(sub):,} rows, "
            f"{sub['ticker'].nunique()} tickers")
        # Sort by date within year
        sub = sub.sort_values("yyyymmdd")
        # Convert columns to lists once (faster than iterrows)
        tickers = sub["ticker"].astype(str).tolist()
        dates   = sub["yyyymmdd"].tolist()
        years   = sub["year"].tolist()
        opens   = sub["open"].tolist()
        highs   = sub["high"].tolist()
        lows    = sub["low"].tolist()
        closes  = sub["close"].tolist()
        vols    = sub["volume"].tolist()
        del sub
        for i in range(len(tickers)):
            t = tickers[i]
            if t not in files:
                f = open(out_dir / f"{t}.json", "w")
                f.write("[")
                files[t] = f
                counts[t] = 0
            f = files[t]
            if counts[t] > 0:
                f.write(",")
            f.write(json.dumps({
                "date":   int(dates[i]),
                "year":   int(years[i]),
                "open":   round(float(opens[i]), 2),
                "high":   round(float(highs[i]), 2),
                "low":    round(float(lows[i]), 2),
                "close":  round(float(closes[i]), 2),
                "volume": int(vols[i]),
            }))
            counts[t] += 1
        log(f"    (cumulative tickers: {len(files)})")

    # Close all files with closing bracket
    log(f"  closing {len(files)} ticker files...")
    for t, f in files.items():
        f.write("]")
        f.close()
    log(f"  wrote {len(files)} ticker files to {out_dir}")
    return len(files)

# ---------- Main ----------
def main():
    log("=" * 60)
    log("NYSE PIPELINE — reproducing MapReduce/Spark jobs as JSON artifacts")
    log("=" * 60)

    prices = load_nyse()
    companies = load_companies()

    ticker_meta = build_ticker_lookup(prices, companies)
    build_composite_index(prices)
    build_sector_heatmap(prices, ticker_meta)
    build_top_volume_per_day(prices, top_n=10)
    build_top_movers(prices)
    build_notrade_days(prices)
    build_volume_anomalies(prices)
    build_per_ticker_series(prices, ticker_meta)
    write_pipeline_meta()

    log("=" * 60)
    log("DONE — artifacts in /home/z/my-project/data/processed/")
    log("=" * 60)

if __name__ == "__main__":
    main()
