import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

/**
 * POST /api/sql-query
 * Body: { sql: string, limit?: number }
 *
 * Executes an ad-hoc SQL query against the DuckDB database and returns
 * the results as JSON. This is the "modern data stack" layer — users
 * can write SQL against the raw data without pre-computation.
 *
 * Safety:
 * - Only SELECT/WITH statements are allowed (no DML/DDL)
 * - Results are capped at 1000 rows by default, 5000 max
 * - Query timeout is 30 seconds
 *
 * Tables available:
 * - prices (ticker, date, year, month, open, high, low, close, volume) — 9.4M rows
 * - companies (ticker, name, lastsale, marketcap, ipoyear, sector, industry) — 3,298 rows
 * - prices_with_sector (view — joined prices + companies)
 * - avg_volume_per_month (ticker, year, month, avg_volume, trading_days)
 * - total_volume_per_year (ticker, year, total_volume, trading_days, first_close, last_close, high, low)
 */

const DB_PATH = path.resolve(process.cwd(), "data", "nyse.duckdb");
const QUERY_TIMEOUT = 30000;
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sql: string = body.sql?.trim();
    const limit = Math.min(body.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    if (!sql) {
      return NextResponse.json({ error: "sql is required" }, { status: 400 });
    }

    // Safety: only allow SELECT/WITH statements
    const normalized = sql.toLowerCase().replace(/--.*$/gm, "").trim();
    const forbidden = [
      /^\s*insert\s/i, /^\s*update\s/i, /^\s*delete\s/i, /^\s*drop\s/i,
      /^\s*create\s/i, /^\s*alter\s/i, /^\s*truncate\s/i, /^\s*attach\s/i,
      /^\s*detach\s/i, /^\s*copy\s/i, /^\s*export\s/i, /^\s*import\s/i,
      /^\s*load\s/i, /^\s*install\s/i, /^\s*pragma\s/i,
    ];
    for (const pattern of forbidden) {
      if (pattern.test(normalized)) {
        return NextResponse.json(
          { error: "Only SELECT statements are allowed" },
          { status: 403 }
        );
      }
    }
    if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
      return NextResponse.json(
        { error: "Query must start with SELECT or WITH" },
        { status: 400 }
      );
    }

    const result = await executeQuery(sql, limit);
    return NextResponse.json({
      sql,
      ...result,
      lineage: {
        job_id: "DuckDB",
        title: "Ad-hoc SQL Query (Modern Data Stack)",
        stage: "derived",
        description:
          "Executes user-written SQL against a DuckDB database with 9.4M rows of NYSE daily prices. On-demand querying replaces pre-computation — the modern data stack approach.",
      },
    });
  } catch (err: any) {
    console.error("SQL query error:", err);
    return NextResponse.json(
      { error: err.message ?? "internal error" },
      { status: 500 }
    );
  }
}

async function executeQuery(sql: string, limit: number): Promise<{
  columns: string[];
  rows: any[][];
  row_count: number;
  execution_ms: number;
}> {
  return new Promise((resolve, reject) => {
    const sqlJson = JSON.stringify(sql);
    const pythonScript = `
import duckdb
import json
import sys
import math

db_path = "${DB_PATH}"
sql = json.loads(${JSON.stringify(sqlJson)})
limit = ${limit}

def safe_value(v):
    if v is None:
        return None
    if isinstance(v, float):
        if math.isinf(v) or math.isnan(v):
            return None
        return v
    if isinstance(v, int):
        return v
    if isinstance(v, bool):
        return v
    return str(v)

try:
    con = duckdb.connect(db_path, read_only=True)
    sql_lower = sql.lower().strip().rstrip(";")
    if "limit " not in sql_lower:
        sql = sql.rstrip(";") + f" LIMIT {limit}"

    result = con.execute(sql)
    columns = [d[0] for d in result.description]
    rows = result.fetchall()
    rows = [[safe_value(c) for c in row] for row in rows]
    con.close()

    output = {"columns": columns, "rows": rows, "row_count": len(rows)}
    print(json.dumps(output))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
`;

    const proc = spawn("python3", ["-c", pythonScript], {
      timeout: QUERY_TIMEOUT,
      cwd: "/home/z/my-project",
    });

    let stdout = "";
    let stderr = "";
    const startTime = Date.now();

    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { stderr += data.toString(); });
    proc.on("close", (code) => {
      const execution_ms = Date.now() - startTime;
      if (code !== 0) {
        reject(new Error(stderr || `Python exited with code ${code}`));
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        if (result.error) {
          reject(new Error(result.error));
          return;
        }
        resolve({ ...result, execution_ms });
      } catch (e) {
        reject(new Error(`Failed to parse result: ${stdout.substring(0, 200)}`));
      }
    });
    proc.on("error", (err) => reject(err));
  });
}

/**
 * GET /api/sql-query
 * Returns the database schema and sample queries for the SQL editor.
 */
export async function GET() {
  const schema = {
    tables: [
      {
        name: "prices",
        description: "Daily OHLCV stock prices (9.4M rows, 1997-2017)",
        columns: [
          { name: "ticker", type: "VARCHAR", description: "Stock ticker symbol" },
          { name: "date", type: "INTEGER", description: "Date as YYYYMMDD" },
          { name: "year", type: "SMALLINT", description: "Year (1997-2017)" },
          { name: "month", type: "INTEGER", description: "Month as YYYYMM" },
          { name: "open", type: "FLOAT", description: "Opening price" },
          { name: "high", type: "FLOAT", description: "Daily high" },
          { name: "low", type: "FLOAT", description: "Daily low" },
          { name: "close", type: "FLOAT", description: "Closing price" },
          { name: "volume", type: "BIGINT", description: "Daily trade volume" },
        ],
      },
      {
        name: "companies",
        description: "Company metadata (3,298 rows)",
        columns: [
          { name: "ticker", type: "VARCHAR" },
          { name: "name", type: "VARCHAR" },
          { name: "lastsale", type: "DOUBLE" },
          { name: "marketcap", type: "DOUBLE" },
          { name: "ipoyear", type: "INTEGER" },
          { name: "sector", type: "VARCHAR" },
          { name: "industry", type: "VARCHAR" },
        ],
      },
      {
        name: "prices_with_sector",
        description: "View: prices joined with companies",
        columns: "See prices + companies",
      },
      {
        name: "avg_volume_per_month",
        description: "Pre-computed: avg volume per ticker per month (mirrors AvgStockVolumePerMonth MapReduce job)",
        columns: [
          { name: "ticker", type: "VARCHAR" },
          { name: "year", type: "SMALLINT" },
          { name: "month", type: "INTEGER" },
          { name: "avg_volume", type: "BIGINT" },
          { name: "trading_days", type: "BIGINT" },
        ],
      },
      {
        name: "total_volume_per_year",
        description: "Pre-computed: total volume per ticker per year (mirrors TotalVolumePerYear MapReduce job)",
        columns: [
          { name: "ticker", type: "VARCHAR" },
          { name: "year", type: "SMALLINT" },
          { name: "total_volume", type: "BIGINT" },
          { name: "trading_days", type: "BIGINT" },
          { name: "first_close", type: "FLOAT" },
          { name: "last_close", type: "FLOAT" },
          { name: "high", type: "FLOAT" },
          { name: "low", type: "FLOAT" },
        ],
      },
    ],
    sample_queries: [
      {
        label: "Top 10 tickers by 2008 volume",
        sql: "SELECT ticker, total_volume, first_close, last_close, ROUND((last_close/first_close - 1)*100, 1) AS return_pct FROM total_volume_per_year WHERE year = 2008 ORDER BY total_volume DESC LIMIT 10",
      },
      {
        label: "Sector volume ranking for 2008",
        sql: "SELECT c.sector, SUM(t.total_volume) AS sector_volume, COUNT(*) AS n_tickers FROM total_volume_per_year t JOIN companies c ON t.ticker = c.ticker WHERE t.year = 2008 GROUP BY c.sector ORDER BY sector_volume DESC",
      },
      {
        label: "GE daily prices in 2008 (first 10 days)",
        sql: "SELECT date, open, high, low, close, volume FROM prices WHERE ticker = 'GE' AND year = 2008 ORDER BY date LIMIT 10",
      },
      {
        label: "Best performing sectors in 2009",
        sql: "SELECT c.sector, ROUND(AVG(t.last_close / t.first_close - 1) * 100, 1) AS avg_return_pct, COUNT(*) AS n_tickers FROM total_volume_per_year t JOIN companies c ON t.ticker = c.ticker WHERE t.year = 2009 AND t.trading_days > 30 GROUP BY c.sector ORDER BY avg_return_pct DESC",
      },
      {
        label: "Tickers with >1B volume in 2008",
        sql: "SELECT p.ticker, c.name, c.sector, SUM(p.volume) AS total_vol FROM prices p JOIN companies c ON p.ticker = c.ticker WHERE p.year = 2008 GROUP BY p.ticker, c.name, c.sector HAVING SUM(p.volume) > 1000000000 ORDER BY total_vol DESC LIMIT 20",
      },
      {
        label: "Monthly avg volume trend for GE in 2008",
        sql: "SELECT month, avg_volume FROM avg_volume_per_month WHERE ticker = 'GE' AND year = 2008 ORDER BY month",
      },
    ],
  };

  return NextResponse.json({ schema });
}
