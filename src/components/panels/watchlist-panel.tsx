"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Star, Plus, Trash2, X } from "lucide-react";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";

interface WatchlistTicker {
  id: string;
  ticker: string;
  addedAt: string;
}

interface Watchlist {
  id: string;
  name: string;
  tickers: WatchlistTicker[];
}

export function WatchlistPanel() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [newTicker, setNewTicker] = useState("");
  const [loading, setLoading] = useState(true);
  const selectTicker = useSelectedTicker((s) => s.select);

  useEffect(() => {
    fetchWatchlists();
  }, []);

  async function fetchWatchlists() {
    setLoading(true);
    try {
      const res = await fetch("/api/watchlists");
      const json = await res.json();
      setWatchlists(json.watchlists ?? []);
      if (json.watchlists?.length > 0 && !activeListId) {
        setActiveListId(json.watchlists[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function createList() {
    if (!newListName.trim()) return;
    const res = await fetch("/api/watchlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newListName }),
    });
    const json = await res.json();
    setWatchlists((prev) => [json.watchlist, ...prev]);
    setActiveListId(json.watchlist.id);
    setNewListName("");
  }

  async function deleteList(id: string) {
    await fetch(`/api/watchlists/${id}`, { method: "DELETE" });
    setWatchlists((prev) => prev.filter((w) => w.id !== id));
    if (activeListId === id) {
      setActiveListId(watchlists.find((w) => w.id !== id)?.id ?? null);
    }
  }

  async function addTicker() {
    if (!activeListId || !newTicker.trim()) return;
    const res = await fetch(`/api/watchlists/${activeListId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_ticker", ticker: newTicker }),
    });
    const json = await res.json();
    setWatchlists((prev) =>
      prev.map((w) => (w.id === activeListId ? json.watchlist : w))
    );
    setNewTicker("");
  }

  async function removeTicker(ticker: string) {
    if (!activeListId) return;
    const res = await fetch(`/api/watchlists/${activeListId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove_ticker", ticker }),
    });
    const json = await res.json();
    setWatchlists((prev) =>
      prev.map((w) => (w.id === activeListId ? json.watchlist : w))
    );
  }

  const activeList = watchlists.find((w) => w.id === activeListId);

  return (
    <Card className="col-span-12 lg:col-span-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-400" />
          Watchlists
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Save tickers to track. Click any to open detail.
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Create new list */}
        <div className="flex gap-2">
          <Input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createList()}
            placeholder="New list name…"
            className="h-8 text-xs"
          />
          <Button onClick={createList} size="sm" className="h-8 px-2">
            <Plus className="h-3 w-3" />
          </Button>
        </div>

        {/* List tabs */}
        {watchlists.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {watchlists.map((w) => (
              <button
                key={w.id}
                onClick={() => setActiveListId(w.id)}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  activeListId === w.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted"
                }`}
              >
                {w.name} ({w.tickers.length})
              </button>
            ))}
          </div>
        )}

        {/* Add ticker to active list */}
        {activeList && (
          <div className="flex gap-2">
            <Input
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && addTicker()}
              placeholder="Add ticker…"
              className="h-8 text-xs font-mono"
            />
            <Button onClick={addTicker} size="sm" className="h-8 px-2">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Ticker list */}
        <ScrollArea className="h-[200px] pr-2">
          <div className="space-y-1">
            {loading && (
              <div className="text-xs text-muted-foreground p-4 text-center">
                Loading…
              </div>
            )}
            {!loading && !activeList && (
              <div className="text-xs text-muted-foreground p-4 text-center">
                Create a watchlist to get started.
              </div>
            )}
            {!loading && activeList?.tickers.length === 0 && (
              <div className="text-xs text-muted-foreground p-4 text-center">
                No tickers yet. Add some above.
              </div>
            )}
            {activeList?.tickers.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-accent transition-colors group"
              >
                <button
                  onClick={() => selectTicker(t.ticker)}
                  className="font-mono font-bold text-sm flex-1 text-left"
                >
                  {t.ticker}
                </button>
                <button
                  onClick={() => removeTicker(t.ticker)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20 transition-opacity"
                >
                  <X className="h-3 w-3 text-muted-foreground hover:text-down" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Delete list button */}
        {activeList && (
          <Button
            onClick={() => deleteList(activeList.id)}
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground hover:text-down"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Delete "{activeList.name}"
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
