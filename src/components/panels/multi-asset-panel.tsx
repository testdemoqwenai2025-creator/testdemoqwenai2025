"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LineageBadge } from "@/components/lineage-badge";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";
import { TrendingUp, TrendingDown, Bitcoin, Building2, Coins, DollarSign } from "lucide-react";

interface AssetMeta {
  symbol: string;
  assetClass: "stock" | "etf" | "crypto" | "forex";
  name: string;
  exchange: string;
}

interface Quote {
  symbol: string;
  assetClass: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  source: string;
}

const CLASS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  stock: Building2,
  etf: Coins,
  crypto: Bitcoin,
  forex: DollarSign,
};

function formatPrice(price: number, assetClass: string) {
  if (assetClass === "forex") return price.toFixed(4);
  if (assetClass === "crypto" && price > 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return price.toFixed(2);
}

function formatVolume(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toString();
}

export function MultiAssetPanel() {
  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const selectTicker = useSelectedTicker((s) => s.select);

  useEffect(() => {
    fetch("/api/assets")
      .then((r) => r.json())
      .then((data) => {
        setAssets(data.assets ?? []);
        // Fetch quotes for all assets
        const symbols = (data.assets ?? []).map((a: AssetMeta) => a.symbol);
        if (symbols.length > 0) {
          fetch(`/api/market-data/quotes?symbols=${symbols.join(",")}`)
            .then((r) => r.json())
            .then((qData) => {
              const quoteMap: Record<string, Quote> = {};
              (qData.quotes ?? []).forEach((q: Quote) => {
                quoteMap[q.symbol] = q;
              });
              setQuotes(quoteMap);
            });
        }
      })
      .finally(() => setLoading(false));

    // Refresh quotes every 5 seconds (simulated live data)
    const interval = setInterval(() => {
      const symbols = assets.map((a) => a.symbol);
      if (symbols.length > 0) {
        fetch(`/api/market-data/quotes?symbols=${symbols.join(",")}`)
          .then((r) => r.json())
          .then((qData) => {
            const quoteMap: Record<string, Quote> = {};
            (qData.quotes ?? []).forEach((q: Quote) => {
              quoteMap[q.symbol] = q;
            });
            setQuotes(quoteMap);
          });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const stocks = assets.filter((a) => a.assetClass === "stock");
  const etfs = assets.filter((a) => a.assetClass === "etf");
  const cryptos = assets.filter((a) => a.assetClass === "crypto");
  const forex = assets.filter((a) => a.assetClass === "forex");

  return (
    <Card className="col-span-12">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          Multi-Asset Market Overview
          <LineageBadge jobId="MarketDataAdapter" jobTitle="Multi-Asset Data Adapter" stage="derived" />
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Stocks, ETFs, Crypto, and Forex — unified view with live quotes (refreshes every 5s)
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs defaultValue="stock">
          <TabsList className="grid w-full grid-cols-4 h-8">
            <TabsTrigger value="stock" className="text-xs">
              <Building2 className="h-3 w-3 mr-1" /> Stocks ({stocks.length})
            </TabsTrigger>
            <TabsTrigger value="etf" className="text-xs">
              <Coins className="h-3 w-3 mr-1" /> ETFs ({etfs.length})
            </TabsTrigger>
            <TabsTrigger value="crypto" className="text-xs">
              <Bitcoin className="h-3 w-3 mr-1" /> Crypto ({cryptos.length})
            </TabsTrigger>
            <TabsTrigger value="forex" className="text-xs">
              <DollarSign className="h-3 w-3 mr-1" /> Forex ({forex.length})
            </TabsTrigger>
          </TabsList>

          {(["stock", "etf", "crypto", "forex"] as const).map((cls) => {
            const list = assets.filter((a) => a.assetClass === cls);
            const Icon = CLASS_ICONS[cls];
            return (
              <TabsContent key={cls} value={cls} className="mt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {loading && (
                    <div className="col-span-full text-xs text-muted-foreground p-4 text-center">
                      Loading…
                    </div>
                  )}
                  {!loading && list.map((asset) => {
                    const q = quotes[asset.symbol];
                    const positive = q ? q.changePercent >= 0 : true;
                    return (
                      <button
                        key={asset.symbol}
                        onClick={() => cls === "stock" && selectTicker(asset.symbol)}
                        className={`flex flex-col p-2 rounded-md border border-border hover:bg-accent/50 transition-colors text-left ${
                          cls === "stock" ? "cursor-pointer" : "cursor-default"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <Icon className="h-3 w-3 text-muted-foreground" />
                            <span className="font-mono font-bold text-sm">{asset.symbol}</span>
                          </div>
                          {q && (
                            <span className={`flex items-center gap-0.5 text-[10px] font-mono ${positive ? "text-up" : "text-down"}`}>
                              {positive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                              {positive ? "+" : ""}{q.changePercent.toFixed(2)}%
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate mb-1">{asset.name}</span>
                        {q ? (
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm font-semibold">
                              {cls === "forex" ? "" : "$"}{formatPrice(q.price, cls)}
                            </span>
                            {cls !== "forex" && (
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {formatVolume(q.volume)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
