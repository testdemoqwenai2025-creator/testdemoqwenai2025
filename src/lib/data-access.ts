/**
 * data-access.ts — server-side data access layer for the NYSE Terminal.
 *
 * Reads pre-computed JSON artifacts produced by scripts/build_artifacts.py
 * (which mirrors the MapReduce/Spark jobs from github.com/dgadiraju/code.git).
 *
 * The middleware never touches the raw .gz files; it only reads these
 * pre-computed JSON files from disk.
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data", "processed");
const CODE_REPO_DIR = path.resolve(process.cwd(), "code_repo");

// ---------- Types ----------
export interface CompositeIndexPoint {
  date: number;        // yyyymmdd
  year: number;
  avg_close: number;
  change_pct: number | null;
  avg_volume: number;
  total_volume: number;
  n_tickers: number;
  advancing: number;
  declining: number;
}

export interface TickerMeta {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  ipoyear: number | null;
  marketcap: number | null;
  first_date: number;
  last_date: number;
  first_close: number;
  last_close: number;
  total_volume: number;
  trading_days: number;
  total_return_pct: number | null;
}

export interface MoverEntry {
  ticker: string;
  return_pct: number;
  total_volume: number;
  first_close: number;
  last_close: number;
  high: number;
  low: number;
  n_days: number;
}

export interface TopMoversYear {
  gainers: MoverEntry[];
  losers: MoverEntry[];
  active: MoverEntry[];
}

export interface HeatmapCell {
  sector: string;
  year: number;
  avg_monthly_volume: number;
  yoy_pct: number | null;
  n_tickers: number;
}

export interface SectorHeatmap {
  sectors: string[];
  years: number[];
  cells: HeatmapCell[];
}

export interface VolumeAnomaly {
  ticker: string;
  date: number;
  volume: number;
  avg_30d: number;
  ratio: number;
  close: number;
}

export interface NoTradeYear {
  year: number;
  first_day: number;
  last_day: number;
  n_trading_days: number;
  top_silent: {
    ticker: string;
    n_missing: number;
    first_missing: number;
    last_missing: number;
  }[];
}

export interface TickerDailyPoint {
  date: number;
  year: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PipelineJobMeta {
  id: string;
  title: string;
  source_files: string[];
  description: string;
  consumes: string[];
  produces: string[];
  stage: "mapper_reducer" | "counter" | "map_side_join" | "derived";
}

// ---------- Cache (in-process, never expires in dev) ----------
const cache = new Map<string, unknown>();
function readCached<T>(filename: string): T {
  if (cache.has(filename)) return cache.get(filename) as T;
  const fullPath = path.join(DATA_DIR, filename);
  const raw = fs.readFileSync(fullPath, "utf-8");
  const parsed = JSON.parse(raw) as T;
  cache.set(filename, parsed);
  return parsed;
}

// ---------- Public accessors ----------
export function getCompositeIndex(year?: number): CompositeIndexPoint[] {
  const all = readCached<CompositeIndexPoint[]>("composite_index.json");
  if (year) return all.filter((p) => p.year === year);
  return all;
}

export function getTickerLookup(): TickerMeta[] {
  return readCached<TickerMeta[]>("ticker_lookup.json");
}

export function getTickerMeta(ticker: string): TickerMeta | null {
  const all = getTickerLookup();
  return all.find((t) => t.ticker.toUpperCase() === ticker.toUpperCase()) ?? null;
}

export function getTopMovers(year: number): TopMoversYear | null {
  const all = readCached<Record<string, TopMoversYear>>("top_movers.json");
  return all[String(year)] ?? null;
}

export function getSectorHeatmap(): SectorHeatmap {
  return readCached<SectorHeatmap>("sector_volume_heatmap.json");
}

export function getVolumeAnomalies(year: number): VolumeAnomaly[] {
  const all = readCached<Record<string, VolumeAnomaly[]>>("volume_anomalies.json");
  return all[String(year)] ?? [];
}

export function getNoTradeDays(year: number): NoTradeYear | null {
  const all = readCached<Record<string, NoTradeYear>>("notrade_days.json");
  return all[String(year)] ?? null;
}

export function getSectors(): string[] {
  return readCached<string[]>("sectors.json");
}

export function getTickerSeries(ticker: string): TickerDailyPoint[] | null {
  const upper = ticker.toUpperCase();
  const file = path.join(DATA_DIR, "tickers", `${upper}.json`);
  if (!fs.existsSync(file)) return null;
  return readCached<TickerDailyPoint[]>(`tickers/${upper}.json`);
}

export function getPipelineMeta(): PipelineJobMeta[] {
  return readCached<PipelineJobMeta[]>("pipeline_meta.json");
}

export function getPipelineJob(jobId: string): PipelineJobMeta | null {
  return getPipelineMeta().find((j) => j.id === jobId) ?? null;
}

export function getPipelineJobSource(jobId: string): { file: string; content: string }[] {
  const job = getPipelineJob(jobId);
  if (!job) return [];
  const out: { file: string; content: string }[] = [];
  for (const relPath of job.source_files) {
    const fullPath = path.resolve(CODE_REPO_DIR, relPath.replace(/^code_repo\//, ""));
    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      out.push({ file: relPath, content });
    } catch {
      out.push({ file: relPath, content: "// Source file not found in cloned repo." });
    }
  }
  return out;
}

export function getAvailableYears(): number[] {
  const ci = getCompositeIndex();
  return Array.from(new Set(ci.map((p) => p.year))).sort();
}

// ---------- Decorator: attach lineage to any payload ----------
export function withLineage<T>(jobId: string, data: T) {
  const job = getPipelineJob(jobId);
  if (!job) return { data, lineage: null };
  return {
    data,
    lineage: {
      job_id:   job.id,
      title:    job.title,
      stage:    job.stage,
      description: job.description,
      source_files: job.source_files,
      produces: job.produces,
      consumes: job.consumes,
    },
  };
}
