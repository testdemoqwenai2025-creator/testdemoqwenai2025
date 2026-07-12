"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { TrendingUp, TrendingDown, Radio } from "lucide-react";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";
import { cn } from "@/lib/utils";

interface Tick {
  ticker: string;
  price: number;
  change: number;
  volume: number;
  isSpike: boolean;
  timestamp: number;
}

const DEFAULT_TICKERS = ["GE", "F", "BAC", "JPM", "XOM", "PFE", "ORCL", "WFC"];

export function LiveTickerBar() {
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const selectTicker = useSelectedTicker((s) => s.select);

  useEffect(() => {
    const socket = io("/?XTransformPort=3003", {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("subscribe", DEFAULT_TICKERS);
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("tick", (tick: Tick) => {
      setTicks((prev) => ({ ...prev, [tick.ticker]: tick }));
    });

    socket.on("volume-spike", (spike: { ticker: string; volume: number; timestamp: number }) => {
      // Could trigger a toast notification here
      console.log("[volume-spike]", spike);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const tickers = Object.values(ticks).sort((a, b) =>
    a.ticker.localeCompare(b.ticker)
  );

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border bg-card/30 overflow-x-auto">
      {/* Live indicator */}
      <div className="flex items-center gap-1.5 shrink-0 pr-2 border-r border-border">
        <Radio
          className={cn(
            "h-3.5 w-3.5",
            connected ? "text-up animate-pulse" : "text-muted-foreground"
          )}
        />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {connected ? "Live" : "Off"}
        </span>
      </div>

      {/* Ticker tape */}
      <div className="flex items-center gap-4 overflow-x-auto">
        {tickers.length === 0 && (
          <span className="text-xs text-muted-foreground">
            {connected ? "Waiting for ticks…" : "Connecting…"}
          </span>
        )}
        {tickers.map((t) => (
          <button
            key={t.ticker}
            onClick={() => selectTicker(t.ticker)}
            className="flex items-center gap-1.5 shrink-0 hover:bg-accent/50 px-1.5 py-0.5 rounded transition-colors"
          >
            <span className="font-mono font-bold text-xs">{t.ticker}</span>
            <span className="font-mono text-xs text-mono-tabular">
              ${t.price.toFixed(2)}
            </span>
            <span
              className={cn(
                "flex items-center gap-0.5 font-mono text-[10px]",
                t.change >= 0 ? "text-up" : "text-down"
              )}
            >
              {t.change >= 0 ? (
                <TrendingUp className="h-2.5 w-2.5" />
              ) : (
                <TrendingDown className="h-2.5 w-2.5" />
              )}
              {t.change >= 0 ? "+" : ""}
              {t.change.toFixed(2)}%
            </span>
            {t.isSpike && (
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" title="Volume spike" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
