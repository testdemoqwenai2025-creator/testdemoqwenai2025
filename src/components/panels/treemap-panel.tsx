"use client";

import { useEffect, useState, useMemo } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineageBadge } from "@/components/lineage-badge";
import { useYearStore } from "@/hooks/use-year-store";
import { useSelectedTicker } from "@/hooks/use-selected-ticker";
import { Layers } from "lucide-react";

interface TreemapNode {
  name: string;
  volume: number;
  return_pct?: number;
  fullName?: string;
  last_close?: number;
  children?: TreemapNode[];
}

interface TreemapData {
  year: number;
  total_volume: number;
  children: TreemapNode[];
}

interface TooltipPayload {
  payload: TreemapNode & {
    depth: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

function formatVolume(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toString();
}

function colorForReturn(returnPct: number | undefined) {
  if (returnPct == null) return "oklch(0.3 0.02 255)";
  const clamped = Math.max(-50, Math.min(50, returnPct)) / 50;
  if (clamped >= 0) {
    const l = 0.3 + clamped * 0.3;
    return `oklch(${l} 0.18 145)`;
  } else {
    const l = 0.3 + Math.abs(clamped) * 0.3;
    return `oklch(${l} 0.22 25)`;
  }
}

export function TreemapPanel() {
  const year = useYearStore((s) => s.year);
  const [data, setData] = useState<TreemapData | null>(null);
  const [loading, setLoading] = useState(true);
  const selectTicker = useSelectedTicker((s) => s.select);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/treemap?year=${year}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [year]);

  const treemapData = useMemo(() => {
    if (!data) return [];
    return [data];
  }, [data]);

  const handleCellClick = (node: any) => {
    if (node?.depth === 3 && node?.name) {
      // Leaf node — select ticker
      selectTicker(node.name);
    }
  };

  return (
    <Card className="col-span-12">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            Market Treemap — {year}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Sized by total volume, colored by annual return. Click a ticker to drill in.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>-50%</span>
          <div className="w-24 h-2 rounded-full" style={{
            background: "linear-gradient(to right, oklch(0.6 0.22 25), oklch(0.3 0.02 255), oklch(0.6 0.18 145))"
          }} />
          <span>+50%</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
            Loading…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={400} key={year}>
            <Treemap
              data={treemapData}
              dataKey="volume"
              stroke="oklch(0.16 0.02 255)"
              fill="oklch(0.3 0.02 255)"
              content={<TreemapContent onClick={handleCellClick} />}
              isAnimationActive={false}
            />
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

interface TreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  depth?: number;
  volume?: number;
  return_pct?: number;
  fullName?: string;
  index?: number;
  onClick?: (node: any) => void;
}

function TreemapContent(props: TreemapContentProps) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    name = "",
    depth = 0,
    volume = 0,
    return_pct,
    fullName,
    onClick,
  } = props;

  if (depth === 0) return null;

  const isLeaf = depth === 3;
  const bgColor = isLeaf
    ? colorForReturn(return_pct)
    : depth === 1
    ? "oklch(0.22 0.025 255)"
    : "oklch(0.25 0.03 255)";

  const textColor = isLeaf
    ? return_pct != null && Math.abs(return_pct) > 25
      ? "white"
      : "oklch(0.9 0.01 240)"
    : "oklch(0.8 0.02 240)";

  const fontSize = isLeaf
    ? Math.min(width / (name.length * 0.7), height / 4, 14)
    : Math.min(width / (name.length * 0.6), height / 3, 16);

  const showLabel = fontSize >= 8 && width > 30 && height > 20;

  return (
    <g
      onClick={() => onClick?.(props)}
      style={{ cursor: isLeaf ? "pointer" : "default" }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={bgColor}
        stroke="oklch(0.16 0.02 255)"
        strokeWidth={1}
      />
      {showLabel && (
        <>
          <text
            x={x + 4}
            y={y + fontSize + 2}
            fill={textColor}
            fontSize={fontSize}
            fontWeight={isLeaf ? 700 : 600}
            fontFamily="var(--font-geist-mono), monospace"
          >
            {name}
          </text>
          {isLeaf && return_pct != null && height > 35 && (
            <text
              x={x + 4}
              y={y + fontSize * 2 + 6}
              fill={textColor}
              fontSize={fontSize * 0.8}
              fontFamily="var(--font-geist-mono), monospace"
            >
              {return_pct >= 0 ? "+" : ""}
              {return_pct.toFixed(0)}%
            </text>
          )}
          {!isLeaf && volume > 0 && height > 30 && (
            <text
              x={x + 4}
              y={y + fontSize * 2 + 6}
              fill="oklch(0.6 0.01 240)"
              fontSize={fontSize * 0.75}
              fontFamily="var(--font-geist-mono), monospace"
            >
              {formatVolume(volume)}
            </text>
          )}
        </>
      )}
    </g>
  );
}
