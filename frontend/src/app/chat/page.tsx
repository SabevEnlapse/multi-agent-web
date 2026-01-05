"use client"

import type React from "react"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Play, Copy, Check, Zap, Newspaper, TrendingUp, PenTool, ExternalLink, Loader2, ChevronDown, ChevronUp, FileText, Search, BarChart3 } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { createSession, runSession, streamSessionEvents, type PlannedTask, type RunMode, type SSEEvent } from "@/lib/api"
import { FinancialChart } from "@/components/financial-chart"
import { FinancialReportTable } from "@/components/financial-report-table"
import { NewsCard } from "@/components/news-card"

/**
 * Chat Workspace Page
 *
 * This is the main interface for the multi-agent system. It handles:
 * 1. Session Management: Creating and running research sessions.
 * 2. Real-time Updates: Listening to Server-Sent Events (SSE) from the backend.
 * 3. UI State: Managing the state of agents, tasks, and messages.
 * 4. Visualization: Rendering agent outputs (text, charts, news cards).
 */

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
  // URL params to determine initial mode (sequential vs hierarchical)
  const sp = useSearchParams()
  const initialMode = (sp.get("mode") as RunMode) || "sequential"

  const [mode, setMode] = useState<RunMode>(initialMode)
  const [prompt, setPrompt] = useState<string>(
    "Generate a comprehensive market report on Apple (AAPL). Focus on the last 30 days: product launches, press releases, and investor-relevant signals.",
  )
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isStepsOpen, setIsStepsOpen] = useState(false)

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

  /**
   * Handles incoming Server-Sent Events (SSE) from the backend.
   * Updates the UI state based on the event type.
   */
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

  /**
   * Starts a new research session.
   * 1. Resets all state (messages, tasks, etc.).
   * 2. Creates a session via API.
   * 3. Connects to the SSE stream.
   * 4. Triggers the run.
   */
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
          {/* Messages Area */}
          <ScrollArea className="flex-1">
            <div className="mx-auto max-w-4xl p-4 lg:p-8">
              {messages.length === 0 && !finalMarkdown ? (
                <div className="flex h-full flex-col items-center justify-center py-20">
                  <div className="mb-8 text-center">
                    <h1 className="mb-3 text-3xl font-semibold tracking-tight">What would you like to research?</h1>
                    <p className="text-muted-foreground">
                      Deploy a team of AI agents to analyze markets, news, and financial data.
                    </p>
                  </div>

                  <div className="w-full max-w-2xl">
                    <div className="relative mb-8">
                      <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={3}
                        className="resize-none rounded-xl border-border/50 bg-card p-4 text-base shadow-sm transition-all focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
                        placeholder="Ask anything (e.g., 'Deep dive into NVIDIA's AI strategy')..."
                        disabled={running}
                      />
                      <div className="absolute bottom-3 right-3">
                        <Button
                          size="sm"
                          onClick={() => void onRun()}
                          disabled={running || prompt.trim().length < 3}
                          className="h-8 rounded-lg px-3"
                        >
                          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {QUICK_PROMPTS.map((qp) => (
                        <button
                          key={qp}
                          onClick={() => setPrompt(qp)}
                          className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 text-left transition-all hover:border-primary/20 hover:bg-card hover:shadow-sm"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background">
                            <Search className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <span className="text-sm font-medium">{qp}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-8 pb-20">
                  {/* Analysis Steps (Collapsible) */}
                  {messages.length > 0 && (
                    <div className="rounded-xl border border-border/50 bg-card/30 overflow-hidden">
                      <button
                        onClick={() => setIsStepsOpen(!isStepsOpen)}
                        className="flex w-full items-center justify-between bg-card/50 px-4 py-3 text-sm font-medium transition-colors hover:bg-card"
                      >
                        <div className="flex items-center gap-2">
                          <div className={`flex h-2 w-2 rounded-full ${running ? "animate-pulse bg-accent" : "bg-emerald-500"}`} />
                          <span>Analysis Steps</span>
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {messages.length} steps
                          </span>
                        </div>
                        {isStepsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      
                      {isStepsOpen && (
                        <div className="divide-y divide-border/50 border-t border-border/50">
                          {messages.map((m) => {
                            const agent = agentMap[m.agent]
                            const Icon = agent?.icon || Zap
                            return (
                              <div key={m.id} className="flex gap-4 p-4">
                                <div
                                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card ${agent?.color || ""}`}
                                >
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="flex-1 overflow-hidden">
                                  <div className="mb-1 flex items-center gap-2">
                                    <span className="text-sm font-medium">{agent?.label}</span>
                                    <span className="text-xs text-muted-foreground">• {m.title}</span>
                                  </div>
                                  <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono text-xs bg-muted/30 p-3 rounded-md">
                                    {m.content}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Main Content Area (Charts & Report) */}
                  <div className="space-y-8">
                    {/* Charts Section */}
                    {messages.some(m => m.agent === "FinancialAnalyst" && m.data?.overview) && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                          <BarChart3 className="h-4 w-4" />
                          Market Data
                        </div>
                        {messages
                          .filter(m => m.agent === "FinancialAnalyst" && m.data?.overview)
                          .map((m) => (
                            <div key={m.id} className="space-y-6">
                              <FinancialChart
                                symbol={m.data.overview.symbol}
                              />
                            </div>
                          ))}
                      </div>
                    )}

                    {/* News Section */}
                    {messages.some(m => m.agent === "NewsResearcher" && m.data?.results) && (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                          <Newspaper className="h-4 w-4" />
                          Key Developments
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          {messages
                            .filter(m => m.agent === "NewsResearcher" && m.data?.results)
                            .flatMap(m => m.data.results)
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            .map((item: any, idx: number) => (
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
                      </div>
                    )}

                    {/* Final Report Artifact */}
                    {finalMarkdown && (
                      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 space-y-8">
                        {/* Financial Report Table (Moved here) */}
                        {messages.some(m => m.agent === "FinancialAnalyst" && m.data?.overview) && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                              <TrendingUp className="h-4 w-4" />
                              Financial Overview
                            </div>
                            {messages
                              .filter(m => m.agent === "FinancialAnalyst" && m.data?.overview)
                              .map((m) => (
                                <FinancialReportTable
                                  key={m.id}
                                  data={m.data.overview}
                                />
                              ))}
                          </div>
                        )}

                        <div>
                          <div className="mb-4 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                              <FileText className="h-4 w-4" />
                              Intelligence Report
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={copyMarkdown}
                              className="h-8 gap-2 text-xs"
                            >
                              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                              {copied ? "Copied" : "Copy Report"}
                            </Button>
                          </div>
                          
                          <div className="rounded-xl border border-border/50 bg-[#fcfcfc] dark:bg-[#1a1a1a] p-8 shadow-sm md:p-12">
                            <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-serif prose-headings:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-p:leading-relaxed prose-p:text-base prose-li:text-base">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {finalMarkdown}
                              </ReactMarkdown>
                            </article>
                            
                            {/* Sources Footer */}
                            {sources.length > 0 && (
                              <div className="mt-12 border-t border-border/50 pt-6">
                                <h4 className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Referenced Sources</h4>
                                <div className="flex flex-wrap gap-2">
                                  {sources.map((s, idx) => (
                                    <a
                                      key={idx}
                                      href={s.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-2 rounded-full border border-border/50 bg-background px-3 py-1.5 text-xs transition-colors hover:border-primary/30 hover:bg-accent/5"
                                    >
                                      <img
                                        src={`https://www.google.com/s2/favicons?domain=${new URL(s.url).hostname}`}
                                        alt=""
                                        className="h-3 w-3 opacity-70"
                                        onError={(e) => e.currentTarget.style.display = 'none'}
                                      />
                                      <span className="max-w-[150px] truncate">{new URL(s.url).hostname.replace('www.', '')}</span>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Floating Input (When content exists) */}
          {(messages.length > 0 || finalMarkdown) && (
            <div className="fixed bottom-6 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 px-4">
              <div className="relative rounded-xl border border-border/50 bg-background/80 shadow-lg backdrop-blur-md transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50">
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={1}
                  className="max-h-32 min-h-[3rem] w-full resize-none bg-transparent px-4 py-3 pr-12 text-sm focus-visible:ring-0"
                  placeholder="Ask a follow-up question..."
                  disabled={running}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!running && prompt.trim().length >= 3) void onRun();
                    }
                  }}
                />
                <div className="absolute bottom-2 right-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-lg hover:bg-primary/10 hover:text-primary"
                    onClick={() => void onRun()}
                    disabled={running || prompt.trim().length < 3}
                  >
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                  </Button>
                </div>
              </div>
            </div>
          )}
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

