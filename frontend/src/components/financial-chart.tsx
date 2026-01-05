"use client";

import { AdvancedRealTimeChart } from "react-ts-tradingview-widgets";
import { useTheme } from "next-themes";

/**
 * Financial Chart Component
 *
 * Displays a TradingView widget for a specific stock symbol.
 * - Uses `react-ts-tradingview-widgets` for the chart.
 * - Adapts to the application's theme (light/dark).
 * - Wrapped in a Card component for consistent styling.
 */

export interface FinancialChartProps {
  symbol: string;
  title?: string;
}

export function FinancialChart({ symbol }: FinancialChartProps) {
  const { theme } = useTheme();
  
  return (
    <div className="w-full h-[500px] mb-8 rounded-xl overflow-hidden border border-border/50 bg-card/50">
       <AdvancedRealTimeChart
          symbol={symbol}
          theme={theme === "dark" ? "dark" : "light"}
          autosize
          width="100%"
          height="100%"
          interval="D"
          timezone="Etc/UTC"
          style="1"
          locale="en"
          toolbar_bg="#f1f3f6"
          enable_publishing={false}
          hide_top_toolbar={false}
          hide_legend={false}
          save_image={false}
          container_id="tradingview_widget"
       />
    </div>
  );
}
