import Link from "next/link"
import { ArrowRight, Zap, FileText, BarChart3, Search, Users, Activity, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground">
              <Zap className="h-4 w-4 text-background" />
            </div>
            <span className="text-lg font-semibold tracking-tight">CrewAI</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <Link href="#" className="transition-colors hover:text-foreground">
              Documentation
            </Link>
            <Link href="#" className="transition-colors hover:text-foreground">
              Workflows
            </Link>
            <Link href="#" className="transition-colors hover:text-foreground">
              Examples
            </Link>
          </nav>
          <Button asChild size="sm" className="rounded-full px-5">
            <Link href="/chat" className="flex items-center gap-2">
              Open Workspace
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12 lg:gap-20">
            <div className="max-w-2xl">
              <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                The complete platform for market research
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                A professional multi-agent workflow that decomposes your prompt into specialist tasks and streams a
                comprehensive business memo.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <Button asChild size="lg" className="rounded-full px-8 h-12 text-base">
                  <Link href="/chat?mode=sequential">
                    Get started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="rounded-full px-8 h-12 text-base bg-transparent">
                  <Link href="#features">Explore Features</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-t border-border/40">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border/40">
            <div className="py-12 lg:py-16 pr-6 lg:pr-12">
              <p className="text-3xl lg:text-4xl font-semibold tracking-tight">3</p>
              <p className="mt-2 text-muted-foreground">Specialized agents</p>
            </div>
            <div className="py-12 lg:py-16 px-6 lg:px-12">
              <p className="text-3xl lg:text-4xl font-semibold tracking-tight">Real-time</p>
              <p className="mt-2 text-muted-foreground">Streaming output</p>
            </div>
            <div className="py-12 lg:py-16 px-6 lg:px-12">
              <p className="text-3xl lg:text-4xl font-semibold tracking-tight">2</p>
              <p className="mt-2 text-muted-foreground">Workflow modes</p>
            </div>
            <div className="py-12 lg:py-16 pl-6 lg:pl-12">
              <p className="text-3xl lg:text-4xl font-semibold tracking-tight">100%</p>
              <p className="mt-2 text-muted-foreground">Automated</p>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow Modes */}
      <section id="features" className="border-t border-border/40 py-20 lg:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16">
            <p className="text-sm font-medium text-accent mb-3">Workflow Modes</p>
            <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight max-w-xl">
              Choose your execution strategy
            </h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-8 lg:p-10 transition-all duration-300 hover:border-border">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary mb-6">
                <ArrowRight className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Sequential Mode</h3>
              <p className="text-muted-foreground leading-relaxed mb-8">
                Assembly-line execution where each agent builds on prior outputs. Perfect for linear research workflows
                with clear dependencies.
              </p>
              <Button asChild className="rounded-full">
                <Link href="/chat?mode=sequential" className="flex items-center gap-2">
                  Start Sequential
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-8 lg:p-10 transition-all duration-300 hover:border-border">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary mb-6">
                <Users className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Hierarchical Mode</h3>
              <p className="text-muted-foreground leading-relaxed mb-8">
                Manager agent coordinates workers and synthesizes results. Ideal for complex research requiring parallel
                information gathering.
              </p>
              <Button asChild className="rounded-full">
                <Link href="/chat?mode=hierarchical" className="flex items-center gap-2">
                  Start Hierarchical
                  <Users className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="border-t border-border/40 py-20 lg:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-16">
            <p className="text-sm font-medium text-accent mb-3">Agent Capabilities</p>
            <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight max-w-xl">
              Specialized agents for comprehensive research
            </h2>
          </div>
          <div className="grid gap-px bg-border/40 rounded-2xl overflow-hidden border border-border/40 lg:grid-cols-3">
            <div className="bg-card p-8 lg:p-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary mb-5">
                <Search className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-semibold mb-2">News Research</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Tavily-powered search agent scans news sources, press releases, and industry updates for relevant
                intelligence.
              </p>
            </div>
            <div className="bg-card p-8 lg:p-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary mb-5">
                <BarChart3 className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-semibold mb-2">Financial Analysis</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Alpha Vantage integration delivers real-time stock data, market trends, and investor-relevant metrics.
              </p>
            </div>
            <div className="bg-card p-8 lg:p-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary mb-5">
                <FileText className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-semibold mb-2">Report Writing</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Synthesizes findings into a structured business memo with citations and actionable insights.
              </p>
            </div>
          </div>
          <div className="grid gap-px bg-border/40 rounded-2xl overflow-hidden border border-border/40 lg:grid-cols-2 mt-4">
            <div className="bg-card p-8 lg:p-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary mb-5">
                <Activity className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-semibold mb-2">Real-time Streaming</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Watch agents work in real-time with SSE-powered status updates and incremental output delivery.
              </p>
            </div>
            <div className="bg-card p-8 lg:p-10">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary mb-5">
                <Zap className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-semibold mb-2">Multi-Agent Orchestration</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Powered by CrewAI for intelligent task decomposition and seamless agent coordination.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border/40 py-20 lg:py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl lg:text-4xl font-semibold tracking-tight mb-4">Ready to get started?</h2>
            <p className="text-lg text-muted-foreground mb-8">
              Configure your API keys and launch your first multi-agent research session in minutes.
            </p>
            <div className="inline-flex items-center gap-3 rounded-full bg-secondary px-5 py-2.5 font-mono text-sm mb-10">
              <span className="text-muted-foreground">$</span>
              <span>backend/.env</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="rounded-full px-8 h-12 text-base">
                <Link href="/chat">
                  Launch Workspace
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 text-sm text-muted-foreground">
          <span>Multi-Agent Systems • Module 5</span>
          <span>Built with CrewAI</span>
        </div>
      </footer>
    </div>
  )
}
