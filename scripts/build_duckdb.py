#!/usr/bin/env python3
"""
build_duckdb.py — Load NYSE data into DuckDB for ad-hoc SQL queries.

Creates a DuckDB database file at data/nyse.duckdb with:
- Table `prices`: daily OHLCV for all tickers (9.4M rows)
- Table `companies`: company metadata (3,298 rows)
- Views: `prices_with_sector` (joined view for convenience)

This enables the SQL Query Editor panel where users can write ad-hoc SQL
against the data without pre-computation.
"""

import gzip
import os
from pathlib import Path
import duckdb
import pandas as pd
from datetime import datetime

RAW_DIR     = Path("/home/z/my-project/repo/nyse_all/nyse_data")
COMPANY_CSV = Path("/home/z/my-project/repo/nyse_all/nyse_stocks/companylist_noheader.csv")
DB_PATH     = Path("/home/z/my-project/data/nyse.duckdb")

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

def main():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()

    con = duckdb.connect(str(DB_PATH))

    # ---------- Load prices ----------
    log("Loading NYSE daily prices into DuckDB...")
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
        log(f"  {gz.name}: {len(df):,} rows")

    log("Concatenating...")
    df = pd.concat(frames, ignore_index=True)
    df["year"]  = (df["date"] // 10000).astype("int16")
    df["month"] = (df["date"] // 100).astype("int32")
    log(f"Total: {len(df):,} rows")

    log("Registering with DuckDB and creating table...")
    con.register("df_temp", df)
    con.execute("""
        CREATE TABLE prices AS
        SELECT
            ticker::VARCHAR    AS ticker,
            date::INTEGER      AS date,
            year::SMALLINT     AS year,
            month::INTEGER     AS month,
            open::FLOAT        AS open,
            high::FLOAT        AS high,
            low::FLOAT         AS low,
            close::FLOAT       AS close,
            volume::BIGINT     AS volume
        FROM df_temp
    """)
    con.unregister("df_temp")
    del df

    count = con.execute("SELECT COUNT(*) FROM prices").fetchone()[0]
    log(f"  prices table: {count:,} rows")

    # ---------- Load companies ----------
    log("Loading company list...")
    comp = pd.read_csv(
        COMPANY_CSV, header=None, sep="|",
        names=["ticker","name","lastsale","marketcap","adrtso","ipoyear",
               "sector","industry","summaryquote","_junk"],
        dtype=str, on_bad_lines="skip",
    )
    comp = comp[["ticker","name","lastsale","marketcap","ipoyear","sector","industry"]]
    comp["ticker"]   = comp["ticker"].str.strip().str.upper()
    comp["name"]     = comp["name"].fillna("").str.strip()
    comp["sector"]   = comp["sector"].fillna("Unknown").str.strip()
    comp["industry"] = comp["industry"].fillna("Unknown").str.strip()
    comp["ipoyear"]  = pd.to_numeric(comp["ipoyear"].replace("n/a", pd.NA), errors="coerce")
    comp["marketcap"]= pd.to_numeric(comp["marketcap"].replace("n/a", pd.NA), errors="coerce")
    comp["lastsale"] = pd.to_numeric(comp["lastsale"].replace("n/a", pd.NA), errors="coerce")

    con.register("comp_temp", comp)
    con.execute("""
        CREATE TABLE companies AS
        SELECT
            ticker::VARCHAR     AS ticker,
            name::VARCHAR       AS name,
            lastsale::DOUBLE    AS lastsale,
            marketcap::DOUBLE   AS marketcap,
            ipoyear::INTEGER    AS ipoyear,
            sector::VARCHAR     AS sector,
            industry::VARCHAR   AS industry
        FROM comp_temp
    """)
    con.unregister("comp_temp")
    comp_count = con.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
    log(f"  companies table: {comp_count:,} rows")

    # ---------- Create joined view ----------
    log("Creating prices_with_sector view...")
    con.execute("""
        CREATE VIEW prices_with_sector AS
        SELECT
            p.ticker,
            p.date,
            p.year,
            p.month,
            p.open,
            p.high,
            p.low,
            p.close,
            p.volume,
            c.name,
            c.sector,
            c.industry,
            c.marketcap,
            c.ipoyear
        FROM prices p
        LEFT JOIN companies c ON p.ticker = c.ticker
    """)

    # ---------- Create summary tables (mirroring MapReduce jobs) ----------
    log("Creating summary tables (mirroring MapReduce jobs)...")

    # AvgStockVolumePerMonth equivalent
    con.execute("""
        CREATE TABLE avg_volume_per_month AS
        SELECT
            ticker,
            year,
            month,
            CAST(AVG(volume) AS BIGINT) AS avg_volume,
            COUNT(*) AS trading_days
        FROM prices
        GROUP BY ticker, year, month
        ORDER BY ticker, year, month
    """)

    # TotalVolumePerYear equivalent
    con.execute("""
        CREATE TABLE total_volume_per_year AS
        SELECT
            ticker,
            year,
            SUM(volume) AS total_volume,
            COUNT(*) AS trading_days,
            FIRST(close ORDER BY date) AS first_close,
            LAST(close ORDER BY date) AS last_close,
            MAX(high) AS high,
            MIN(low) AS low
        FROM prices
        GROUP BY ticker, year
        ORDER BY ticker, year
    """)

    # Create indexes for common queries
    log("Creating indexes...")
    con.execute("CREATE INDEX idx_prices_ticker ON prices(ticker)")
    con.execute("CREATE INDEX idx_prices_year ON prices(year)")
    con.execute("CREATE INDEX idx_prices_ticker_year ON prices(ticker, year)")

    # ---------- Print summary ----------
    log("=" * 50)
    log("DuckDB database created successfully!")
    log(f"  Path: {DB_PATH}")
    log(f"  Size: {DB_PATH.stat().st_size / 1024 / 1024:.0f} MB")
    log("")
    log("Tables:")
    tables = con.execute("""
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = 'main'
        ORDER BY table_name
    """).fetchall()
    for name, typ in tables:
        count = con.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
        log(f"  {name:30s} ({typ:5s})  {count:>12,} rows")
    log("")
    log("Sample query:")
    sample = con.execute("""
        SELECT sector, year, SUM(total_volume) AS sector_volume
        FROM total_volume_per_year t
        JOIN companies c ON t.ticker = c.ticker
        WHERE year = 2008
        GROUP BY sector, year
        ORDER BY sector_volume DESC
        LIMIT 5
    """).fetchall()
    for row in sample:
        log(f"  {row}")

    con.close()

if __name__ == "__main__":
    main()
