import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export type AgentStatus = "idle" | "running" | "done";

export type AgentMeta = {
  name: string;
  label: string;
  accentClass: string;
};

export function AgentCard({ meta, status }: { meta: AgentMeta; status: AgentStatus }) {
  const dot = status === "running" ? "bg-emerald-500" : status === "done" ? "bg-slate-400" : "bg-slate-300";

  return (
    <Card className="agent-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
          <Badge className={meta.accentClass} variant="secondary">
            {meta.label}
          </Badge>
          <div className="text-sm font-medium">{meta.name}</div>
        </div>

        <div className="text-xs text-muted-foreground">{status === "idle" ? "Idle" : status === "running" ? "Running" : "Done"}</div>
      </div>
    </Card>
  );
}
