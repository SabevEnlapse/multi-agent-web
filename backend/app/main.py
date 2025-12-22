from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

load_dotenv()

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "data.db"))

# In dev, Next.js typically runs on :3000 or :3001. We allow both by default so
# the frontend can reach the API without CORS failures.
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3001")
FRONTEND_ORIGIN_2 = os.getenv("FRONTEND_ORIGIN_2", "http://localhost:3000")

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
ALPHAVANTAGE_API_KEY = os.getenv("ALPHAVANTAGE_API_KEY", "")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = db()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
              id TEXT PRIMARY KEY,
              created_at TEXT NOT NULL,
              prompt TEXT NOT NULL,
              mode TEXT NOT NULL,
              status TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              agent TEXT NOT NULL,
              title TEXT NOT NULL,
              status TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY(session_id) REFERENCES sessions(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              type TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY(session_id) REFERENCES sessions(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
              session_id TEXT PRIMARY KEY,
              markdown TEXT NOT NULL,
              sources_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY(session_id) REFERENCES sessions(id)
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def persist_event(session_id: str, event_type: str, payload: dict[str, Any]) -> None:
    conn = db()
    try:
        conn.execute(
            "INSERT INTO events (id, session_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), session_id, event_type, json.dumps(payload), utc_now_iso()),
        )
        conn.commit()
    finally:
        conn.close()


def persist_tasks(session_id: str, planned: list[dict[str, str]]) -> None:
    conn = db()
    try:
        for t in planned:
            conn.execute(
                "INSERT INTO tasks (id, session_id, agent, title, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), session_id, t["agent"], t["title"], "planned", utc_now_iso()),
            )
        conn.commit()
    finally:
        conn.close()


def update_session_status(session_id: str, status: str) -> None:
    conn = db()
    try:
        conn.execute("UPDATE sessions SET status = ? WHERE id = ?", (status, session_id))
        conn.commit()
    finally:
        conn.close()


def persist_report(session_id: str, markdown: str, sources: list[dict[str, Any]]) -> None:
    conn = db()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO reports (session_id, markdown, sources_json, created_at) VALUES (?, ?, ?, ?)",
            (session_id, markdown, json.dumps(sources), utc_now_iso()),
        )
        conn.commit()
    finally:
        conn.close()


class CreateSessionRequest(BaseModel):
    prompt: str = Field(min_length=3)
    mode: Literal["sequential", "hierarchical"] = "sequential"


class CreateSessionResponse(BaseModel):
    id: str


class SessionResponse(BaseModel):
    id: str
    created_at: str
    prompt: str
    mode: str
    status: str
    tasks: list[dict[str, Any]]
    report_markdown: str | None
    report_sources: list[dict[str, Any]] | None


@dataclass
class SearchResult:
    title: str
    snippet: str
    url: str
    published_at: str | None = None


async def tavily_search(query: str) -> list[SearchResult]:
    if not TAVILY_API_KEY:
        return [
            SearchResult(
                title="(Mock) Tavily disabled",
                snippet=f"No TAVILY_API_KEY set. Query: {query}",
                url="https://tavily.com",
                published_at=None,
            )
        ]

    url = "https://api.tavily.com/search"
    payload = {
        "api_key": TAVILY_API_KEY,
        "query": query,
        "search_depth": "basic",
        "include_answer": False,
        "include_raw_content": False,
        "max_results": 6,
    }
    timeout = httpx.Timeout(12.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()

    out: list[SearchResult] = []
    for r in data.get("results", [])[:6]:
        out.append(
            SearchResult(
                title=str(r.get("title") or ""),
                snippet=str(r.get("content") or ""),
                url=str(r.get("url") or ""),
                published_at=r.get("published_date"),
            )
        )
    return out


async def alphavantage_overview(symbol: str) -> dict[str, Any]:
    if not ALPHAVANTAGE_API_KEY:
        return {
            "mock": True,
            "symbol": symbol,
            "note": "No ALPHAVANTAGE_API_KEY set; returning mock overview.",
            "market_cap": None,
            "pe_ratio": None,
            "profit_margin": None,
        }

    # Alpha Vantage is rate-limited; keep calls minimal.
    base = "https://www.alphavantage.co/query"
    params = {"function": "OVERVIEW", "symbol": symbol, "apikey": ALPHAVANTAGE_API_KEY}
    timeout = httpx.Timeout(12.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(base, params=params)
        resp.raise_for_status()
        data = resp.json()

    if "Note" in data:
        # Rate limit message.
        return {"symbol": symbol, "rate_limited": True, "note": data["Note"]}

    return {
        "symbol": symbol,
        "name": data.get("Name"),
        "description": data.get("Description"),
        "sector": data.get("Sector"),
        "industry": data.get("Industry"),
        "market_cap": data.get("MarketCapitalization"),
        "pe_ratio": data.get("PERatio"),
        "profit_margin": data.get("ProfitMargin"),
        "52w_high": data.get("52WeekHigh"),
        "52w_low": data.get("52WeekLow"),
        "currency": data.get("Currency"),
    }


def decompose_prompt(prompt: str) -> dict[str, Any]:
    # Lightweight heuristic decomposition (fast, deterministic). You can swap for an LLM planner later.
    # Extract a competitor name as the last capitalized token group if present.
    competitor = None
    tokens = prompt.replace("\n", " ").split(" ")
    caps = [t.strip(" ,.!?\"'") for t in tokens if t[:1].isupper()]
    if caps:
        competitor = " ".join(caps[-2:]) if len(caps) >= 2 else caps[-1]
    competitor = competitor or "Competitor X"

    # Finance symbol heuristic: if user includes ticker like (AAPL) use it.
    symbol = None
    if "(" in prompt and ")" in prompt:
        inside = prompt.split("(", 1)[1].split(")", 1)[0].strip().upper()
        if 1 <= len(inside) <= 6 and inside.isalnum():
            symbol = inside
    symbol = symbol or "MSFT"

    planned = [
        {
            "agent": "NewsResearcher",
            "title": f"Find latest news, press releases, and product launches for {competitor}.",
        },
        {
            "agent": "FinancialAnalyst",
            "title": f"Pull recent stock/financial overview for {competitor} (symbol: {symbol}).",
        },
        {
            "agent": "ReportWriter",
            "title": f"Write a final business memo synthesizing findings about {competitor}.",
        },
    ]

    return {"competitor": competitor, "symbol": symbol, "tasks": planned}


async def run_sequential(session_id: str, prompt: str) -> AsyncGenerator[dict[str, Any], None]:
    plan = decompose_prompt(prompt)
    planned_tasks = plan["tasks"]

    yield {"type": "task_planned", "payload": {"tasks": planned_tasks, "plan": plan}}

    # Run researcher + analyst concurrently (still considered sequential pipeline into writer).
    async def do_news() -> dict[str, Any]:
        query = f"{plan['competitor']} latest news press release product launch"
        results = await tavily_search(query)
        return {
            "query": query,
            "results": [r.__dict__ for r in results],
        }

    async def do_finance() -> dict[str, Any]:
        overview = await alphavantage_overview(plan["symbol"])
        return {"overview": overview}

    yield {"type": "agent_started", "payload": {"agent": "NewsResearcher"}}
    yield {"type": "agent_started", "payload": {"agent": "FinancialAnalyst"}}

    news_task = asyncio.create_task(do_news())
    fin_task = asyncio.create_task(do_finance())

    news = await news_task
    yield {
        "type": "agent_output",
        "payload": {"agent": "NewsResearcher", "content": "Collected latest news results.", "data": news},
    }
    yield {"type": "agent_finished", "payload": {"agent": "NewsResearcher"}}

    finance = await fin_task
    yield {
        "type": "agent_output",
        "payload": {"agent": "FinancialAnalyst", "content": "Collected financial overview.", "data": finance},
    }
    yield {"type": "agent_finished", "payload": {"agent": "FinancialAnalyst"}}

    yield {"type": "agent_started", "payload": {"agent": "ReportWriter"}}

    # Synthesize memo (deterministic template). Swap for LLM later.
    sources: list[dict[str, Any]] = []
    for r in news.get("results", []):
        if r.get("url"):
            sources.append({"title": r.get("title"), "url": r.get("url")})

    overview = finance.get("overview", {})
    memo = "\n".join(
        [
            f"# Market Research Memo: {plan['competitor']}",
            "",
            "## Executive Summary",
            f"This memo summarizes recent public signals and financial context for **{plan['competitor']}**.",
            "",
            "## Recent News & Product Signals",
        ]
        + [f"- [{r.get('title','(untitled)')}]({r.get('url','')}) — {r.get('snippet','')[:160]}" for r in news.get("results", [])]
        + [
            "",
            "## Financial Snapshot",
            f"- Symbol: `{overview.get('symbol')}`",
            f"- Market Cap: {overview.get('market_cap')}",
            f"- P/E Ratio: {overview.get('pe_ratio')}",
            f"- Profit Margin: {overview.get('profit_margin')}",
            "",
            "## Implications",
            "- Recent product/news momentum can signal investment areas and go-to-market priorities.",
            "- Financial ratios should be interpreted alongside revenue growth and competitive positioning.",
            "",
            "## Sources",
        ]
        + [f"- {s['title']}: {s['url']}" for s in sources[:10]]
    )

    yield {
        "type": "agent_output",
        "payload": {"agent": "ReportWriter", "content": "Drafted final business memo.", "data": {"markdown": memo}},
    }
    yield {"type": "agent_finished", "payload": {"agent": "ReportWriter"}}

    yield {"type": "final_report", "payload": {"markdown": memo, "sources": sources}}


async def run_hierarchical(session_id: str, prompt: str) -> AsyncGenerator[dict[str, Any], None]:
    plan = decompose_prompt(prompt)
    planned_tasks = [
        {"agent": "Manager", "title": "Create plan and delegate to specialists."},
        *plan["tasks"],
    ]
    yield {"type": "task_planned", "payload": {"tasks": planned_tasks, "plan": plan}}

    yield {"type": "agent_started", "payload": {"agent": "Manager"}}
    yield {
        "type": "agent_output",
        "payload": {
            "agent": "Manager",
            "content": "Delegating research to NewsResearcher and FinancialAnalyst, then requesting synthesis from ReportWriter.",
            "data": {"plan": plan},
        },
    }

    # Delegate concurrently
    yield {"type": "agent_started", "payload": {"agent": "NewsResearcher"}}
    yield {"type": "agent_started", "payload": {"agent": "FinancialAnalyst"}}

    news_task = asyncio.create_task(tavily_search(f"{plan['competitor']} latest news press release product launch"))
    fin_task = asyncio.create_task(alphavantage_overview(plan["symbol"]))

    news_results = await news_task
    news_payload = {"results": [r.__dict__ for r in news_results]}
    yield {
        "type": "agent_output",
        "payload": {"agent": "NewsResearcher", "content": "Delivered news results to Manager.", "data": news_payload},
    }
    yield {"type": "agent_finished", "payload": {"agent": "NewsResearcher"}}

    fin_overview = await fin_task
    fin_payload = {"overview": fin_overview}
    yield {
        "type": "agent_output",
        "payload": {"agent": "FinancialAnalyst", "content": "Delivered finance overview to Manager.", "data": fin_payload},
    }
    yield {"type": "agent_finished", "payload": {"agent": "FinancialAnalyst"}}

    # Manager validates (simple rule)
    sources = [{"title": r.title, "url": r.url} for r in news_results if r.url]
    ok = len(sources) >= 2
    yield {
        "type": "agent_output",
        "payload": {
            "agent": "Manager",
            "content": "Validation passed." if ok else "Validation incomplete (insufficient sources); proceeding with available data.",
            "data": {"sources_found": len(sources)},
        },
    }
    yield {"type": "agent_finished", "payload": {"agent": "Manager"}}

    yield {"type": "agent_started", "payload": {"agent": "ReportWriter"}}

    memo = "\n".join(
        [
            f"# Market Research Memo: {plan['competitor']}",
            "",
            "## Executive Summary",
            f"This memo summarizes recent public signals and financial context for **{plan['competitor']}**.",
            "",
            "## Recent News & Product Signals",
        ]
        + [f"- [{r.title}]({r.url}) — {r.snippet[:160]}" for r in news_results]
        + [
            "",
            "## Financial Snapshot",
            f"- Symbol: `{fin_overview.get('symbol')}`",
            f"- Market Cap: {fin_overview.get('market_cap')}",
            f"- P/E Ratio: {fin_overview.get('pe_ratio')}",
            f"- Profit Margin: {fin_overview.get('profit_margin')}",
            "",
            "## Sources",
        ]
        + [f"- {s['title']}: {s['url']}" for s in sources[:10]]
    )

    yield {
        "type": "agent_output",
        "payload": {"agent": "ReportWriter", "content": "Drafted final business memo.", "data": {"markdown": memo}},
    }
    yield {"type": "agent_finished", "payload": {"agent": "ReportWriter"}}
    yield {"type": "final_report", "payload": {"markdown": memo, "sources": sources}}


app = FastAPI(title="Multi-Agent Market Research API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, FRONTEND_ORIGIN_2],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup() -> None:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    init_db()


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "time": utc_now_iso()}


@app.post("/api/sessions", response_model=CreateSessionResponse)
async def create_session(req: CreateSessionRequest) -> CreateSessionResponse:
    session_id = str(uuid.uuid4())
    conn = db()
    try:
        conn.execute(
            "INSERT INTO sessions (id, created_at, prompt, mode, status) VALUES (?, ?, ?, ?, ?)",
            (session_id, utc_now_iso(), req.prompt, req.mode, "created"),
        )
        conn.commit()
    finally:
        conn.close()

    persist_event(session_id, "session_created", {"id": session_id})
    return CreateSessionResponse(id=session_id)


@app.get("/api/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str) -> SessionResponse:
    conn = db()
    try:
        s = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")

        tasks = conn.execute("SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at ASC", (session_id,)).fetchall()
        r = conn.execute("SELECT * FROM reports WHERE session_id = ?", (session_id,)).fetchone()

        return SessionResponse(
            id=s["id"],
            created_at=s["created_at"],
            prompt=s["prompt"],
            mode=s["mode"],
            status=s["status"],
            tasks=[dict(row) for row in tasks],
            report_markdown=r["markdown"] if r else None,
            report_sources=json.loads(r["sources_json"]) if r else None,
        )
    finally:
        conn.close()


@app.post("/api/sessions/{session_id}/run")
async def run_session(session_id: str) -> dict[str, Any]:
    conn = db()
    try:
        s = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
    finally:
        conn.close()

    update_session_status(session_id, "running")
    persist_event(session_id, "run_requested", {"id": session_id})
    return {"ok": True, "id": session_id}


@app.get("/api/sessions/{session_id}/events")
async def session_events(request: Request, session_id: str) -> EventSourceResponse:
    conn = db()
    try:
        s = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
        if not s:
            raise HTTPException(status_code=404, detail="Session not found")
        prompt = str(s["prompt"])
        mode = str(s["mode"])
    finally:
        conn.close()

    async def event_gen() -> AsyncGenerator[dict[str, Any], None]:
        start = time.time()
        try:
            runner = run_hierarchical(session_id, prompt) if mode == "hierarchical" else run_sequential(session_id, prompt)
            async for ev in runner:
                if await request.is_disconnected():
                    break

                persist_event(session_id, ev["type"], ev.get("payload", {}))

                if ev["type"] == "task_planned":
                    persist_tasks(session_id, ev["payload"]["tasks"])

                if ev["type"] == "final_report":
                    persist_report(session_id, ev["payload"]["markdown"], ev["payload"]["sources"])
                    update_session_status(session_id, "completed")

                yield {
                    "event": ev["type"],
                    "data": json.dumps(ev["payload"]),
                }

        except Exception as e:  # noqa: BLE001
            update_session_status(session_id, "error")
            payload = {"message": str(e)}
            persist_event(session_id, "error", payload)
            yield {"event": "error", "data": json.dumps(payload)}
        finally:
            elapsed = time.time() - start
            persist_event(session_id, "run_finished", {"elapsed_s": elapsed})

    return EventSourceResponse(event_gen())
