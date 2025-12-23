"use client"

import type React from "react"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Play, Copy, Check, Zap, Newspaper, TrendingUp, PenTool, ExternalLink, Loader2 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { createSession, runSession, streamSessionEvents, type PlannedTask, type RunMode, type SSEEvent } from "@/lib/api"
import { FinancialChart } from "@/components/financial-chart"
import { NewsCard } from "@/components/news-card"

type AgentName = "Manager" | "NewsResearcher" | "FinancialAnalyst" | "ReportWriter"
type AgentStatus = "idle" | "running" | "done"

type ChatMsg = {
  id: string
  agent: AgentName
  title: string
  content: string
  kind: "status" | "output"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any
}

const AGENTS: {
  name: AgentName
  label: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}[] = [
  { name: "Manager", label: "Manager", icon: Zap, color: "text-foreground" },
  { name: "NewsResearcher", label: "News", icon: Newspaper, color: "text-sky-400" },
  { name: "FinancialAnalyst", label: "Finance", icon: TrendingUp, color: "text-emerald-400" },
  { name: "ReportWriter", label: "Writer", icon: PenTool, color: "text-amber-400" },
]

const QUICK_PROMPTS = [
  "Analyze Apple (AAPL)",
  "Compare Tesla vs Rivian",
  "Market outlook for AI stocks",
  "Latest crypto trends",
]

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16)
}

function ChatInner() {
  const sp = useSearchParams()
  const initialMode = (sp.get("mode") as RunMode) || "sequential"

  const [mode, setMode] = useState<RunMode>(initialMode)
  const [prompt, setPrompt] = useState<string>(
    "Generate a comprehensive market report on Apple (AAPL). Focus on the last 30 days: product launches, press releases, and investor-relevant signals.",
  )
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [copied, setCopied] = useState(false)

  const [tasks, setTasks] = useState<PlannedTask[]>([])
  const [agentStatus, setAgentStatus] = useState<Record<AgentName, AgentStatus>>({
    Manager: "idle",
    NewsResearcher: "idle",
    FinancialAnalyst: "idle",
    ReportWriter: "idle",
  })

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [finalMarkdown, setFinalMarkdown] = useState<string | null>(null)
  const [sources, setSources] = useState<{ title: string; url: string }[]>([])
  const [error, setError] = useState<string | null>(null)

  const cleanupRef = useRef<null | (() => void)>(null)

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  const agentMap = useMemo(() => Object.fromEntries(AGENTS.map((a) => [a.name, a])), [])

  function pushMsg(m: Omit<ChatMsg, "id">) {
    setMessages((prev) => [...prev, { ...m, id: uid() }])
  }

  function onSSE(ev: SSEEvent) {
    if (ev.type === "task_planned") {
      setTasks(ev.payload.tasks as PlannedTask[])
      pushMsg({
        agent: "Manager",
        title: "Plan Created",
        content: "Task plan generated and agents assigned.",
        kind: "status",
      })
      return
    }

    if (ev.type === "agent_started") {
      const agent = ev.payload.agent as AgentName
      setAgentStatus((s) => ({ ...s, [agent]: "running" }))
      return
    }

    if (ev.type === "agent_output") {
      const agent = ev.payload.agent as AgentName
      pushMsg({
        agent,
        title: "Output",
        content: ev.payload.content as string,
        kind: "output",
        data: ev.payload.data,
      })
      return
    }

    if (ev.type === "agent_finished") {
      const agent = ev.payload.agent as AgentName
      setAgentStatus((s) => ({ ...s, [agent]: "done" }))
      return
    }

    if (ev.type === "final_report") {
      setFinalMarkdown(ev.payload.markdown as string)
      setSources(ev.payload.sources as { title: string; url: string }[])
      setRunning(false)
      cleanupRef.current?.()
      cleanupRef.current = null
      return
    }

    if (ev.type === "error") {
      setError(ev.payload.message as string)
      setRunning(false)
      cleanupRef.current?.()
      cleanupRef.current = null
      return
    }
  }

  async function onRun() {
    setError(null)
    setFinalMarkdown(null)
    setSources([])
    setMessages([])
    setTasks([])
    setAgentStatus({
      Manager: "idle",
      NewsResearcher: "idle",
      FinancialAnalyst: "idle",
      ReportWriter: "idle",
    })

    setRunning(true)
    const s = await createSession(prompt, mode)
    setSessionId(s.id)

    cleanupRef.current?.()
    cleanupRef.current = streamSessionEvents(s.id, onSSE)

    await runSession(s.id)
  }

  function copyMarkdown() {
    if (!finalMarkdown) return
    void navigator.clipboard.writeText(finalMarkdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const visibleAgents = mode === "hierarchical" ? AGENTS : AGENTS.filter((a) => a.name !== "Manager")

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-foreground">
              <Zap className="h-3 w-3 text-background" />
            </div>
            <span className="font-medium">Workspace</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={mode} onValueChange={(v) => setMode(v as RunMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="sequential" className="text-xs">
                Sequential
              </TabsTrigger>
              <TabsTrigger value="hierarchical" className="text-xs">
                Hierarchical
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Badge variant="secondary" className="font-mono text-xs">
            {sessionId ? sessionId.slice(0, 8) : "—"}
          </Badge>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden w-72 shrink-0 border-r border-border/50 lg:block">
          <ScrollArea className="h-full">
            <div className="p-4">
              {/* Agents Section */}
              <div className="mb-6">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Agents</h3>
                <div className="space-y-2">
                  {visibleAgents.map((agent) => {
                    const status = agentStatus[agent.name]
                    const Icon = agent.icon
                    return (
                      <div
                        key={agent.name}
                        className="flex items-center justify-between rounded-lg border border-border/60 bg-card/50 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`h-4 w-4 ${agent.color}`} />
                          <span className="text-sm">{agent.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {status === "running" && <Loader2 className="h-3 w-3 animate-spin text-accent" />}
                          <span
                            className={`h-2 w-2 rounded-full ${
                              status === "running"
                                ? "bg-accent"
                                : status === "done"
                                  ? "bg-emerald-400"
                                  : "bg-muted-foreground/30"
                            }`}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Tasks Section */}
              <div className="mb-6">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Tasks</h3>
                {tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tasks yet</p>
                ) : (
                  <div className="space-y-2">
                    {tasks.map((t, i) => (
                      <div key={i} className="rounded-lg border border-border/60 bg-card/50 p-3">
                        <div className="text-xs font-medium text-muted-foreground">{t.agent}</div>
                        <p className="mt-1 text-sm">{t.title}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sources Section */}
              <div>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Sources</h3>
                {sources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sources yet</p>
                ) : (
                  <div className="space-y-2">
                    {sources.map((s, idx) => (
                      <a
                        key={idx}
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 p-3 text-sm transition-colors hover:bg-card"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{s.title}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* Main Content */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Input Area */}
          <div className="shrink-0 border-b border-border/50 p-4 lg:p-6">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {QUICK_PROMPTS.map((qp) => (
                <Button
                  key={qp}
                  variant="outline"
                  size="sm"
                  className="h-7 whitespace-nowrap text-xs"
                  onClick={() => setPrompt(qp)}
                  disabled={running}
                >
                  {qp}
                </Button>
              ))}
            </div>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="resize-none bg-card/50"
              placeholder="Describe what you want to research (e.g., Analyze Apple (AAPL))..."
              disabled={running}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button onClick={() => void onRun()} disabled={running || prompt.trim().length < 3} className="gap-2">
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Crew
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={copyMarkdown}
                disabled={!finalMarkdown}
                className="gap-2 bg-transparent"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Report
                  </>
                )}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </div>

          {/* Messages Area */}
          <ScrollArea className="flex-1">
            <div className="p-4 lg:p-6">
              {messages.length === 0 && !finalMarkdown ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Zap className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="mb-2 font-medium">Ready to run</h3>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Enter a research prompt and click Run Crew. Agents will decompose the task and stream their outputs
                    in real-time.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((m) => {
                    const agent = agentMap[m.agent]
                    const Icon = agent?.icon || Zap
                    return (
                      <div key={m.id} className="flex gap-3">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card ${agent?.color || ""}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="text-sm font-medium">{agent?.label}</span>
                            <span className="text-xs text-muted-foreground">{m.title}</span>
                          </div>
                          <div
                            className={`rounded-lg border border-border/60 p-4 text-sm leading-relaxed ${
                              m.kind === "output" ? "bg-card" : "bg-card/50"
                            }`}
                          >
                            {m.content}
                            {m.agent === "FinancialAnalyst" && m.data?.overview && (
                              <div className="mt-4">
                                <FinancialChart
                                  data={m.data.overview.history || []}
                                  title={`Stock Price History: ${m.data.overview.symbol}`}
                                  symbol={m.data.overview.symbol}
                                />
                              </div>
                            )}
                            {m.agent === "NewsResearcher" && m.data?.results && (
                              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                {m.data.results.map((item: any, idx: number) => (
                                  <NewsCard
                                    key={idx}
                                    news={{
                                      title: item.title,
                                      url: item.url,
                                      summary: item.snippet,
                                      date: item.published_at,
                                    }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {finalMarkdown && (
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card text-amber-400">
                        <PenTool className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-sm font-medium">Writer</span>
                          <span className="text-xs text-muted-foreground">Final Report</span>
                        </div>
                        <div className="rounded-lg border border-accent/30 bg-card p-6 text-sm leading-relaxed overflow-x-auto prose dark:prose-invert max-w-none prose-sm prose-headings:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-pre:bg-muted prose-pre:text-foreground prose-table:border-collapse prose-th:border prose-th:border-border prose-th:p-2 prose-td:border prose-td:border-border prose-td:p-2">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {finalMarkdown}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </main>

        {/* Right Panel - Stats */}
        <aside className="hidden w-64 shrink-0 border-l border-border/50 xl:block">
          <div className="p-4">
            <h3 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Session</h3>
            <div className="space-y-3">
              <div className="rounded-lg border border-border/60 bg-card/50 p-3">
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      running ? "bg-accent" : sessionId ? "bg-emerald-400" : "bg-muted-foreground/30"
                    }`}
                  />
                  <span className="text-sm font-medium">{running ? "Running" : sessionId ? "Complete" : "Ready"}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/60 bg-card/50 p-3">
                  <div className="text-xs text-muted-foreground">Messages</div>
                  <div className="mt-1 text-xl font-semibold">{messages.length}</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-card/50 p-3">
                  <div className="text-xs text-muted-foreground">Tasks</div>
                  <div className="mt-1 text-xl font-semibold">{tasks.length}</div>
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-card/50 p-3">
                <div className="text-xs text-muted-foreground">Sources</div>
                <div className="mt-1 text-xl font-semibold">{sources.length}</div>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Mode</h3>
              <div className="rounded-lg border border-border/60 bg-card/50 p-3">
                <div className="text-sm font-medium capitalize">{mode}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {mode === "hierarchical" ? "Manager coordinates worker agents" : "Agents work in sequence"}
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ChatInner />
    </Suspense>
  )
}
