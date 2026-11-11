"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { DISTRIBUTION_BIN_WIDTH, type CaptionDistribution } from "@/utils/study-clean-results";

const SERIES_LABELS: Record<string, string> = {
  before: "All raters",
  after: "Without excluded raters",
};

export function StudyCleanResultsDistribution({
  bins,
  showBefore,
  averagePercent,
}: {
  bins: CaptionDistribution["bins"];
  showBefore: boolean;
  averagePercent: number;
}) {
  // Each bin sits at its midpoint, so the average line lands in the right place.
  const data = bins.map((bin, index) => ({
    ...bin,
    midpoint: (index + 0.5) * DISTRIBUTION_BIN_WIDTH,
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 22, right: 16, bottom: 4, left: 0 }} accessibilityLayer>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="midpoint"
            type="number"
            domain={[0, 100]}
            ticks={[0, 20, 40, 60, 80, 100]}
            tickFormatter={(value) => `${value}%`}
            stroke="var(--chart-axis)"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            allowDecimals={false}
            width={44}
            stroke="var(--chart-axis)"
            tick={{ fontSize: 12 }}
            label={{ value: "Captions", angle: -90, position: "insideLeft", fontSize: 12 }}
          />
          <Tooltip
            labelFormatter={(value) => {
              const start = Number(value) - DISTRIBUTION_BIN_WIDTH / 2;
              return `${start}–${start + DISTRIBUTION_BIN_WIDTH}% positive`;
            }}
            formatter={(value, name) => [`${value} captions`, SERIES_LABELS[String(name)] ?? name]}
          />
          <Legend
            formatter={(value) => SERIES_LABELS[String(value)] ?? value}
            wrapperStyle={{ fontSize: 12 }}
          />
          {showBefore ? (
            <Area
              type="monotone"
              dataKey="before"
              stroke="var(--chart-before)"
              fill="var(--chart-before)"
              fillOpacity={0.12}
              strokeWidth={2}
            />
          ) : null}
          <Area
            type="monotone"
            dataKey="after"
            stroke="var(--chart-after)"
            fill="var(--chart-after)"
            fillOpacity={0.18}
            strokeWidth={2}
          />
          <ReferenceLine
            x={averagePercent}
            stroke="var(--chart-axis)"
            strokeDasharray="4 4"
            label={{ value: "Average", position: "top", fontSize: 12, fill: "var(--chart-axis)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
