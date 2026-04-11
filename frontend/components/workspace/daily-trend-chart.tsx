"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  newCases: {
    label: "New cases",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

type TrendPoint = { date: string; newCases?: number };

function shortDateLabel(dateStr: string) {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return dateStr.length > 5 ? dateStr.slice(5) : dateStr;
  }
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
}

export function DailyTrendChart({ data }: { data: TrendPoint[] }) {
  const chartData = useMemo(() => {
    return data.slice(-10).map((point) => ({
      date: point.date,
      label: shortDateLabel(point.date),
      newCases: Number(point.newCases) || 0,
    }));
  }, [data]);

  if (!chartData.length) {
    return null;
  }

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">Daily Trend</p>
      <ChartContainer
        config={chartConfig}
        className="mt-2 aspect-auto h-[260px] min-h-[260px] w-full"
      >
        <BarChart
          accessibilityLayer
          data={chartData}
          margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-slate-200" />
          <XAxis
            dataKey="label"
            type="category"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={36}
            tick={{ fontSize: 11 }}
            allowDecimals={false}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_value, payload) => {
                  const row = payload?.[0]?.payload as { date?: string } | undefined;
                  if (!row?.date) return "";
                  const parsed = new Date(row.date);
                  return Number.isNaN(parsed.getTime()) ? row.date : parsed.toLocaleDateString();
                }}
              />
            }
          />
          <Bar dataKey="newCases" fill="var(--color-newCases)" radius={[4, 4, 0, 0]} maxBarSize={52} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}
