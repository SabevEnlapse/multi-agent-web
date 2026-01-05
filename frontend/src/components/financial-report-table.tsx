import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface FinancialReportTableProps {
  data: {
    symbol: string;
    name?: string;
    description?: string;
    sector?: string;
    industry?: string;
    market_cap?: string;
    pe_ratio?: string;
    profit_margin?: string;
    "52w_high"?: string;
    "52w_low"?: string;
    currency?: string;
  };
}

export function FinancialReportTable({ data }: FinancialReportTableProps) {
  if (!data) return null;

  const metrics = [
    { label: "Market Cap", value: data.market_cap },
    { label: "P/E Ratio", value: data.pe_ratio },
    { label: "Profit Margin", value: data.profit_margin },
    { label: "52 Week High", value: data["52w_high"] },
    { label: "52 Week Low", value: data["52w_low"] },
    { label: "Sector", value: data.sector },
    { label: "Industry", value: data.industry },
    { label: "Currency", value: data.currency },
  ].filter((m) => m.value);

  return (
    <Card className="w-full border-border/50 bg-card/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium">
            Financial Report: {data.name || data.symbol}
          </CardTitle>
          <Badge variant="outline" className="font-mono">
            {data.symbol}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-border/50 overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground font-medium">
              <tr>
                <th className="px-4 py-3">Metric</th>
                <th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {metrics.map((metric, index) => (
                <tr
                  key={metric.label}
                  className={`hover:bg-muted/30 transition-colors ${
                    index % 2 === 0 ? "bg-transparent" : "bg-muted/10"
                  }`}
                >
                  <td className="px-4 py-3 font-medium">{metric.label}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                    {metric.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.description && (
          <div className="mt-4 text-sm text-muted-foreground leading-relaxed border-t border-border/50 pt-4">
            <p>{data.description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
