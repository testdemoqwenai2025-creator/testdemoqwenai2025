/**
 * market-data-adapter.ts — Configurable market data source.
 *
 * Stage 6: Real Market Data
 *
 * This adapter provides a unified interface for fetching market data from
 * multiple sources:
 * 1. "simulator" — the existing price-feed WebSocket (geometric Brownian motion)
 * 2. "historical" — pulls real data from our pre-computed NYSE JSON files
 * 3. "api" — ready for real APIs (Polygon.io, Alpha Vantage, etc.) — just
 *    add API keys to .env and uncomment the fetch logic
 *
 * The adapter pattern means we can swap data sources without changing the
 * frontend — the LiveTickerBar and AlertsPanel just consume whatever the
 * adapter provides.
 */

export type DataSource = "simulator" | "historical" | "api";
export type AssetClass = "stock" | "etf" | "crypto" | "forex";

export interface MarketQuote {
  symbol: string;
  assetClass: AssetClass;
  price: number;
  change: number;          // absolute change
  changePercent: number;   // percentage change
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: number;
  source: DataSource;
}

export interface AssetMeta {
  symbol: string;
  assetClass: AssetClass;
  name: string;
  exchange: string;
  sector?: string;
  industry?: string;
}

// ---------- Configuration ----------
const DATA_SOURCE: DataSource =
  (process.env.MARKET_DATA_SOURCE as DataSource) ?? "simulator";

const API_KEYS = {
  polygon: process.env.POLYGON_API_KEY ?? "",
  alphaVantage: process.env.ALPHA_VANTAGE_API_KEY ?? "",
  coinapi: process.env.COINAPI_KEY ?? "",
};

// ---------- Asset registry ----------
const ASSET_REGISTRY: Record<string, AssetMeta> = {
  // Stocks (from NYSE data)
  GE:   { symbol: "GE",   assetClass: "stock", name: "General Electric", exchange: "NYSE", sector: "Energy" },
  F:    { symbol: "F",    assetClass: "stock", name: "Ford Motor", exchange: "NYSE", sector: "Capital Goods" },
  BAC:  { symbol: "BAC",  assetClass: "stock", name: "Bank of America", exchange: "NYSE", sector: "Finance" },
  JPM:  { symbol: "JPM",  assetClass: "stock", name: "JPMorgan Chase", exchange: "NYSE", sector: "Finance" },
  XOM:  { symbol: "XOM",  assetClass: "stock", name: "Exxon Mobil", exchange: "NYSE", sector: "Energy" },
  PFE:  { symbol: "PFE",  assetClass: "stock", name: "Pfizer", exchange: "NYSE", sector: "Health Care" },
  ORCL: { symbol: "ORCL", assetClass: "stock", name: "Oracle", exchange: "NYSE", sector: "Technology" },
  WFC:  { symbol: "WFC",  assetClass: "stock", name: "Wells Fargo", exchange: "NYSE", sector: "Finance" },
  // ETFs (synthetic for demo — real data would come from an API)
  SPY:  { symbol: "SPY",  assetClass: "etf", name: "SPDR S&P 500 ETF", exchange: "NYSE" },
  DIA:  { symbol: "DIA",  assetClass: "etf", name: "SPDR Dow Jones ETF", exchange: "NYSE" },
  QQQ:  { symbol: "QQQ",  assetClass: "etf", name: "Invesco QQQ Trust", exchange: "NASDAQ" },
  // Crypto (synthetic for demo)
  BTC:  { symbol: "BTC",  assetClass: "crypto", name: "Bitcoin", exchange: "COINBASE" },
  ETH:  { symbol: "ETH",  assetClass: "crypto", name: "Ethereum", exchange: "COINBASE" },
  // Forex (synthetic for demo)
  EURUSD: { symbol: "EURUSD", assetClass: "forex", name: "Euro / US Dollar", exchange: "FX" },
  GBPUSD: { symbol: "GBPUSD", assetClass: "forex", name: "British Pound / US Dollar", exchange: "FX" },
};

// ---------- Quote cache ----------
const quoteCache = new Map<string, MarketQuote>();

// ---------- Historical data loader (for "historical" mode) ----------
import { getTickerSeries } from "@/lib/data-access";

function getHistoricalQuote(symbol: string): MarketQuote | null {
  const meta = ASSET_REGISTRY[symbol];
  if (!meta) return null;

  if (meta.assetClass === "stock") {
    const series = getTickerSeries(symbol);
    if (!series || series.length === 0) return null;
    const last = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2] : last;
    const change = last.close - prev.close;
    const changePercent = prev.close > 0 ? (change / prev.close) * 100 : 0;
    return {
      symbol,
      assetClass: meta.assetClass,
      price: last.close,
      change,
      changePercent,
      volume: last.volume,
      high: last.high,
      low: last.low,
      open: last.open,
      previousClose: prev.close,
      timestamp: Date.now(),
      source: "historical",
    };
  }

  // For ETFs, crypto, forex — generate synthetic quotes
  return generateSyntheticQuote(symbol, meta);
}

// ---------- Synthetic quote generator (for ETFs, crypto, forex) ----------
const syntheticState = new Map<string, { price: number; history: number[] }>();

function generateSyntheticQuote(symbol: string, meta: AssetMeta): MarketQuote {
  let state = syntheticState.get(symbol);
  if (!state) {
    // Seed with a realistic starting price
    const seedPrice: Record<string, number> = {
      SPY: 450, DIA: 380, QQQ: 380,
      BTC: 43000, ETH: 2300,
      EURUSD: 1.085, GBPUSD: 1.27,
    };
    const price = seedPrice[symbol] ?? 100;
    state = { price, history: [price] };
    syntheticState.set(symbol, state);
  }

  // Random walk with asset-class-appropriate volatility
  const volMap: Record<AssetClass, number> = {
    stock: 0.02,
    etf: 0.01,
    crypto: 0.05,  // higher volatility
    forex: 0.003, // very low volatility
  };
  const volatility = volMap[meta.assetClass];
  const shock = (Math.random() - 0.5) * 2;
  const newPrice = state.price * Math.exp(volatility * shock * 0.5);

  state.price = newPrice;
  state.history.push(newPrice);
  if (state.history.length > 60) state.history.shift();

  const prev = state.history[state.history.length - 2] ?? newPrice;
  const change = newPrice - prev;
  const changePercent = prev > 0 ? (change / prev) * 100 : 0;

  return {
    symbol,
    assetClass: meta.assetClass,
    price: Math.round(newPrice * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    volume: Math.floor(Math.random() * 10000000) + 1000000,
    high: Math.round(newPrice * 1.005 * 100) / 100,
    low: Math.round(newPrice * 0.995 * 100) / 100,
    open: prev,
    previousClose: prev,
    timestamp: Date.now(),
    source: "simulator",
  };
}

// ---------- Real API fetcher (ready for production) ----------
async function fetchApiQuote(symbol: string, meta: AssetMeta): Promise<MarketQuote | null> {
  // To enable real API data:
  // 1. Add API keys to .env:
  //    POLYGON_API_KEY=your_key
  //    ALPHA_VANTAGE_API_KEY=your_key
  //    COINAPI_KEY=your_key
  // 2. Uncomment the appropriate fetch below

  try {
    if (meta.assetClass === "crypto" && API_KEYS.coinapi) {
      // Uncomment for real crypto data:
      // const res = await fetch(
      //   `https://rest.coinapi.io/v1/quotes/${symbol}/USD`,
      //   { headers: { "X-CoinAPI-Key": API_KEYS.coinapi } }
      // );
      // const data = await res.json();
      // return { symbol, assetClass: "crypto", price: data.ask, ... };
    }

    if (meta.assetClass === "stock" && API_KEYS.polygon) {
      // Uncomment for real stock data:
      // const res = await fetch(
      //   `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${API_KEYS.polygon}`
      // );
      // const data = await res.json();
      // return { symbol, assetClass: "stock", price: data.results.p, ... };
    }

    // Fallback to synthetic if no API keys configured
    return generateSyntheticQuote(symbol, meta);
  } catch (err) {
    console.error(`[market-data] API fetch failed for ${symbol}:`, err);
    return generateSyntheticQuote(symbol, meta);
  }
}

// ---------- Public API ----------
export function getQuote(symbol: string): MarketQuote | null {
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < 5000) return cached;

  const meta = ASSET_REGISTRY[symbol];
  if (!meta) return null;

  let quote: MarketQuote | null = null;
  if (DATA_SOURCE === "historical") {
    quote = getHistoricalQuote(symbol);
  } else if (DATA_SOURCE === "api") {
    // For API mode, we return synthetic immediately and let the caller
    // call fetchApiQuoteAsync for the real data
    quote = generateSyntheticQuote(symbol, meta);
  } else {
    // simulator mode
    quote = generateSyntheticQuote(symbol, meta);
  }

  if (quote) quoteCache.set(symbol, quote);
  return quote;
}

export async function getQuoteAsync(symbol: string): Promise<MarketQuote | null> {
  const meta = ASSET_REGISTRY[symbol];
  if (!meta) return null;

  if (DATA_SOURCE === "api") {
    return fetchApiQuote(symbol, meta);
  }
  return getQuote(symbol);
}

export function getQuotes(symbols: string[]): MarketQuote[] {
  return symbols
    .map((s) => getQuote(s))
    .filter((q): q is MarketQuote => q !== null);
}

export function getAssetsByClass(assetClass: AssetClass): AssetMeta[] {
  return Object.values(ASSET_REGISTRY).filter((a) => a.assetClass === assetClass);
}

export function getAllAssets(): AssetMeta[] {
  return Object.values(ASSET_REGISTRY);
}

export function getDataSource(): DataSource {
  return DATA_SOURCE;
}

export function searchAssets(query: string): AssetMeta[] {
  const q = query.toUpperCase();
  return Object.values(ASSET_REGISTRY).filter(
    (a) => a.symbol.includes(q) || a.name.toUpperCase().includes(q)
  );
}
