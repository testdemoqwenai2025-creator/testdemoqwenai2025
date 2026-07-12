/**
 * price-feed/index.ts — Real-time market price simulator (mini-service).
 *
 * Since we don't have a live market data feed, this service simulates one
 * by picking up the last known close price for tracked tickers from the
 * pre-computed JSON data, then applying a random-walk (geometric Brownian
 * motion) model to generate realistic-looking intraday price ticks.
 *
 * Tick frequency: 1 second per ticker
 * Volatility: derived from the ticker's historical daily range
 *
 * Clients subscribe via Socket.IO:
 *   socket.emit('subscribe', ['GE', 'F', 'BAC'])
 *   socket.on('tick', (data) => { ... })
 *
 * The data also drives:
 *   - Volume anomaly alerts (when simulated volume > threshold)
 *   - Price threshold alerts (when price crosses user-set levels)
 */

import { createServer } from "http";
import { Server } from "socket.io";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DATA_DIR = "/home/z/my-project/data/processed";
const TICKER_DIR = join(DATA_DIR, "tickers");
const PORT = 3003;

// ---------- Load reference data ----------
interface DailyPoint {
  date: number;
  year: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function loadTickerData(ticker: string): DailyPoint[] | null {
  const file = join(TICKER_DIR, `${ticker.toUpperCase()}.json`);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

// Get the last known price + volatility for a ticker
function getTickerSeed(ticker: string) {
  const data = loadTickerData(ticker);
  if (!data || data.length === 0) return null;
  const last = data[data.length - 1];
  // Compute average daily volatility from the last 60 days
  const recent = data.slice(-60);
  const returns = recent
    .map((d, i) => (i > 0 ? Math.log(d.close / recent[i - 1].close) : 0))
    .filter((r) => isFinite(r));
  const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(variance);
  return {
    ticker: ticker.toUpperCase(),
    price: last.close,
    volatility: Math.max(volatility, 0.01), // floor at 1%
    baseVolume: last.volume || 100000,
    history: [last.close],
  };
}

// ---------- Simulate ticks ----------
const tickerState = new Map<
  string,
  {
    ticker: string;
    price: number;
    volatility: number;
    baseVolume: number;
    history: number[];
    lastTick: number;
  }
>();

function simulateTick(ticker: string) {
  const state = tickerState.get(ticker);
  if (!state) return null;

  // Geometric Brownian Motion: nextPrice = price * exp(drift + vol * randomN(0,1))
  const drift = 0; // no drift — pure random walk
  const shock = (Math.random() - 0.5) * 2; // [-1, 1]
  const change = Math.exp(drift + state.volatility * shock * 0.3);
  const newPrice = state.price * change;

  // Simulate volume: base ± 50% with occasional spikes
  const volumeMultiplier = 0.5 + Math.random();
  const isSpike = Math.random() < 0.02; // 2% chance of volume spike
  const volume = Math.floor(
    state.baseVolume * volumeMultiplier * (isSpike ? 3 + Math.random() * 7 : 1)
  );

  state.price = newPrice;
  state.history.push(newPrice);
  if (state.history.length > 60) state.history.shift();
  state.lastTick = Date.now();

  return {
    ticker: state.ticker,
    price: Math.round(newPrice * 100) / 100,
    change: Math.round((newPrice / state.history[0] - 1) * 10000) / 100,
    volume,
    isSpike,
    timestamp: state.lastTick,
  };
}

// ---------- HTTP server + Socket.IO ----------
const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

const clientSubscriptions = new Map<string, Set<string>>(); // socketId → tickers
const tickIntervals = new Map<string, NodeJS.Timeout>(); // ticker → interval

function ensureTicker(ticker: string): boolean {
  if (tickerState.has(ticker)) return true;
  const seed = getTickerSeed(ticker);
  if (!seed) return false;
  tickerState.set(ticker, { ...seed, lastTick: Date.now() });
  return true;
}

function startTickerIfNeeded(ticker: string) {
  if (tickIntervals.has(ticker)) return;
  const interval = setInterval(() => {
    const tick = simulateTick(ticker);
    if (!tick) return;
    // Broadcast to all subscribed clients
    for (const [socketId, subs] of clientSubscriptions) {
      if (subs.has(ticker)) {
        io.to(socketId).emit("tick", tick);
        if (tick.isSpike) {
          io.to(socketId).emit("volume-spike", {
            ticker: tick.ticker,
            volume: tick.volume,
            timestamp: tick.timestamp,
          });
        }
      }
    }
  }, 1000);
  tickIntervals.set(ticker, interval);
}

function stopTickerIfUnused(ticker: string) {
  let inUse = false;
  for (const subs of clientSubscriptions.values()) {
    if (subs.has(ticker)) {
      inUse = true;
      break;
    }
  }
  if (!inUse) {
    const interval = tickIntervals.get(ticker);
    if (interval) {
      clearInterval(interval);
      tickIntervals.delete(ticker);
    }
  }
}

io.on("connection", (socket) => {
  console.log(`[price-feed] client connected: ${socket.id}`);
  clientSubscriptions.set(socket.id, new Set());

  socket.on("subscribe", (tickers: string[]) => {
    const subs = clientSubscriptions.get(socket.id) ?? new Set();
    for (const t of tickers) {
      const upper = t.toUpperCase();
      if (ensureTicker(upper)) {
        subs.add(upper);
        startTickerIfNeeded(upper);
        // Send immediate tick so the client doesn't wait 1s
        const tick = simulateTick(upper);
        if (tick) socket.emit("tick", tick);
      } else {
        socket.emit("error", { ticker: upper, message: "ticker not found" });
      }
    }
    console.log(`[price-feed] ${socket.id} subscribed to: ${[...subs].join(", ")}`);
  });

  socket.on("unsubscribe", (tickers: string[]) => {
    const subs = clientSubscriptions.get(socket.id);
    if (!subs) return;
    for (const t of tickers) {
      subs.delete(t.toUpperCase());
    }
    // Stop unused tickers
    for (const t of tickers) {
      stopTickerIfUnused(t.toUpperCase());
    }
  });

  socket.on("get-snapshot", (ticker: string) => {
    const state = tickerState.get(ticker.toUpperCase());
    if (state) {
      socket.emit("snapshot", {
        ticker: state.ticker,
        price: state.price,
        history: state.history,
        volatility: state.volatility,
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(`[price-feed] client disconnected: ${socket.id}`);
    const subs = clientSubscriptions.get(socket.id);
    if (subs) {
      for (const t of subs) {
        stopTickerIfUnused(t);
      }
    }
    clientSubscriptions.delete(socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[price-feed] WebSocket server running on port ${PORT}`);
  console.log(`[price-feed] Connect from frontend with: io("/?XTransformPort=${PORT}")`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[price-feed] SIGTERM received, shutting down...");
  for (const interval of tickIntervals.values()) clearInterval(interval);
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("[price-feed] SIGINT received, shutting down...");
  for (const interval of tickIntervals.values()) clearInterval(interval);
  httpServer.close(() => process.exit(0));
});
