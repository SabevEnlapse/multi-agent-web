"use client";

import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo } from "react";

interface FinancialDataPoint {
  date: string;
  price: number;
}

interface FinancialChartProps {
  data: FinancialDataPoint[];
  title?: string;
  symbol?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-popover border border-border p-3 rounded-lg shadow-lg">
        <p className="text-sm font-medium text-popover-foreground mb-1">
          {new Date(label).toLocaleDateString(undefined, {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </p>
        <p className="text-sm font-bold text-primary">
          ${Number(payload[0].value).toFixed(2)}
        </p>
      </div>
    );
  }
  return null;
};

export function FinancialChart({ data, title, symbol }: FinancialChartProps) {
  const averagePrice = useMemo(() => {
    if (!data || data.length === 0) return 0;
    const sum = data.reduce((acc, curr) => acc + curr.price, 0);
    return sum / data.length;
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <Card className="w-full h-[400px] mb-4 flex items-center justify-center">
        <p className="text-muted-foreground">No data available</p>
      </Card>
    );
  }

  return (
    <Card className="w-full h-[400px] mb-4 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center justify-between">
          <span>{title || "Price History"}</span>
          {symbol && (
            <span className="text-sm font-normal text-muted-foreground bg-muted px-2 py-1 rounded">
              {symbol}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[320px] w-full pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{
              top: 10,
              right: 30,
              left: 10,
              bottom: 0,
            }}
          >
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--border)"
              opacity={0.5}
            />
            <XAxis
              dataKey="date"
              tickFormatter={(value) =>
                new Date(value).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              }
              minTickGap={40}
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              dy={10}
            />
            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={(value) => `$${value.toFixed(0)}`}
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              dx={-10}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={averagePrice}
              stroke="var(--muted-foreground)"
              strokeDasharray="3 3"
              label={{
                value: "Avg",
                position: "insideRight",
                fill: "var(--muted-foreground)",
                fontSize: 10
              }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="var(--primary)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorPrice)"
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
