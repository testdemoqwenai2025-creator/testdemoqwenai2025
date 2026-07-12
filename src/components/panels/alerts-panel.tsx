"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Bell, Plus, Trash2, BellRing } from "lucide-react";
import { io, Socket } from "socket.io-client";

interface Alert {
  id: string;
  ticker: string;
  type: "price_above" | "price_below" | "volume_spike";
  threshold: number;
  message: string | null;
  triggered: boolean;
  triggeredAt: string | null;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  price_above: "Price ≥",
  price_below: "Price ≤",
  volume_spike: "Volume ≥",
};

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [ticker, setTicker] = useState("");
  const [type, setType] = useState("price_above");
  const [threshold, setThreshold] = useState("");
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<{ ticker: string; msg: string; ts: number }[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    fetchAlerts();

    // Connect to price-feed for alert monitoring
    const socket = io("/?XTransformPort=3003", {
      transports: ["websocket"],
      reconnection: true,
    });
    socketRef.current = socket

    socket.on("connect", () => {
      // Subscribe to all tickers that have alerts
      const tickers = Array.from(new Set(alerts.map((a) => a.ticker)));
      if (tickers.length > 0) {
        socket.emit("subscribe", tickers);
      }
    });

    socket.on("tick", (tick: { ticker: string; price: number; volume: number }) => {
      // Check if any alert should trigger
      for (const alert of alerts) {
        if (alert.triggered) continue;
        if (alert.ticker !== tick.ticker) continue;

        let shouldTrigger = false;
        let msg = "";
        if (alert.type === "price_above" && tick.price >= alert.threshold) {
          shouldTrigger = true;
          msg = `${alert.ticker} crossed above $${alert.threshold}: now $${tick.price.toFixed(2)}`;
        }
        if (alert.type === "price_below" && tick.price <= alert.threshold) {
          shouldTrigger = true;
          msg = `${alert.ticker} crossed below $${alert.threshold}: now $${tick.price.toFixed(2)}`;
        }
        if (alert.type === "volume_spike" && tick.volume >= alert.threshold) {
          shouldTrigger = true;
          msg = `${alert.ticker} volume spike: ${tick.volume.toLocaleString()} ≥ ${alert.threshold.toLocaleString()}`;
        }

        if (shouldTrigger) {
          triggerAlert(alert.id, msg);
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [alerts]);

  async function fetchAlerts() {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts");
      const json = await res.json();
      setAlerts(json.alerts ?? []);
      // Subscribe to tickers for untriggered alerts
      const tickers = Array.from(
        new Set((json.alerts ?? []).filter((a: Alert) => !a.triggered).map((a: Alert) => a.ticker))
      );
      if (tickers.length > 0 && socketRef.current?.connected) {
        socketRef.current.emit("subscribe", tickers);
      }
    } finally {
      setLoading(false);
    }
  }

  async function createAlert() {
    if (!ticker.trim() || !threshold) return;
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: ticker.toUpperCase(),
        type,
        threshold: parseFloat(threshold),
      }),
    });
    const json = await res.json();
    setAlerts((prev) => [json.alert, ...prev]);
    setTicker("");
    setThreshold("");
    // Subscribe to the new ticker
    if (socketRef.current?.connected) {
      socketRef.current.emit("subscribe", [json.alert.ticker]);
    }
  }

  async function triggerAlert(id: string, msg: string) {
    await fetch(`/api/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trigger" }),
    });
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, triggered: true, triggeredAt: new Date().toISOString() } : a
      )
    );
    setNotifications((prev) => [
      { ticker: a_ticker(a, id), msg, ts: Date.now() },
      ...prev,
    ].slice(0, 10));
  }

  // Helper to find ticker by id (avoiding closure issues)
  function a_ticker(a: Alert[], id: string) {
    return a.find((x) => x.id === id)?.ticker ?? "?";
  }

  async function deleteAlert(id: string) {
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  async function resetAlert(id: string) {
    await fetch(`/api/alerts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, triggered: false, triggeredAt: null } : a
      )
    );
  }

  return (
    <Card className="col-span-12 lg:col-span-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4 text-amber-400" />
          Alerts
          {notifications.length > 0 && (
            <Badge className="text-[10px] bg-orange-500/20 text-orange-400 border-orange-500/30">
              {notifications.length} new
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Price & volume threshold alerts — monitored via live feed.
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Create alert */}
        <div className="grid grid-cols-12 gap-1.5">
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Ticker"
            className="col-span-3 h-8 text-xs font-mono"
          />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="col-span-4 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="price_above">Price ≥</SelectItem>
              <SelectItem value="price_below">Price ≤</SelectItem>
              <SelectItem value="volume_spike">Volume ≥</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createAlert()}
            placeholder="Value"
            type="number"
            className="col-span-3 h-8 text-xs font-mono"
          />
          <Button onClick={createAlert} size="sm" className="col-span-2 h-8 px-2">
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="space-y-1 max-h-[80px] overflow-y-auto">
            {notifications.map((n, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1 rounded bg-orange-500/10 border border-orange-500/20 text-xs"
              >
                <BellRing className="h-3 w-3 text-orange-400 shrink-0" />
                <span className="truncate">{n.msg}</span>
              </div>
            ))}
          </div>
        )}

        {/* Alert list */}
        <ScrollArea className="h-[200px] pr-2">
          <div className="space-y-1">
            {loading && (
              <div className="text-xs text-muted-foreground p-4 text-center">
                Loading…
              </div>
            )}
            {!loading && alerts.length === 0 && (
              <div className="text-xs text-muted-foreground p-4 text-center">
                No alerts yet. Create one above.
              </div>
            )}
            {alerts.map((a) => (
              <div
                key={a.id}
                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded transition-colors group ${
                  a.triggered
                    ? "bg-orange-500/10 border border-orange-500/20"
                    : "hover:bg-accent"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <BellRing
                    className={`h-3 w-3 shrink-0 ${
                      a.triggered ? "text-orange-400" : "text-muted-foreground"
                    }`}
                  />
                  <span className="font-mono font-bold text-sm w-12">{a.ticker}</span>
                  <span className="text-xs text-muted-foreground">
                    {TYPE_LABELS[a.type]} {a.threshold.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {a.triggered ? (
                    <Button
                      onClick={() => resetAlert(a.id)}
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                    >
                      Reset
                    </Button>
                  ) : null}
                  <button
                    onClick={() => deleteAlert(a.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-down" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
