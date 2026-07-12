"use client";

import { memo } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
}

/**
 * Sparkline — a tiny inline line chart for showing trends in table rows.
 * Pure SVG, no Recharts overhead. Memoized to prevent unnecessary re-renders.
 */
export const Sparkline = memo(function Sparkline({
  data,
  width = 80,
  height = 24,
  positive,
}: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const color =
    positive === undefined
      ? "oklch(0.7 0.18 165)"
      : positive
      ? "oklch(0.7 0.2 145)"
      : "oklch(0.65 0.25 25)";

  const lastY = height - ((data[data.length - 1] - min) / range) * (height - 2) - 1;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={width}
        cy={lastY}
        r={1.5}
        fill={color}
      />
    </svg>
  );
});
