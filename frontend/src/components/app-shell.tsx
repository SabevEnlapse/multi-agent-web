import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type AppShellProps = {
  title?: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
};

export function AppShell({
  title = "Multi-Agent Ops",
  subtitle = "Prompt → plan → specialists → final output",
  left,
  right,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <div className="app-bg" aria-hidden />

      <header className="app-topbar">
        <div className="app-topbar-inner">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="app-brand"
              aria-label="Go to home"
              title="Multi-agent app"
            >
              <span className="app-brand-mark" />
              <span className="app-brand-text">CrewLab</span>
            </Link>

            <div className="hidden sm:block">
              <div className="text-sm font-semibold leading-tight">{title}</div>
              <div className="text-xs text-muted-foreground">{subtitle}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {right}
            <Button asChild variant="secondary" className="h-9">
              <a href="https://github.com" target="_blank" rel="noreferrer">
                Docs
              </a>
            </Button>
            <Badge variant="outline" className="font-mono text-[11px]">
              v0.1
            </Badge>
          </div>
        </div>
      </header>

      <div className="app-body">
        <aside className="app-left">{left}</aside>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
