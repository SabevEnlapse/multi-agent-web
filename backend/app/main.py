from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Any, AsyncGenerator, Literal

import google.generativeai as genai
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

# Load env vars from backend/.env and root .env
# load_dotenv() does not override existing env vars, so we load specific paths
backend_env = os.path.join(os.path.dirname(__file__), "..", ".env")
root_env = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(backend_env)
load_dotenv(root_env)

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "data.db"))

# In dev, Next.js typically runs on :3000 or :3001. We allow both by default so
# the frontend can reach the API without CORS failures.
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3001")
FRONTEND_ORIGIN_2 = os.getenv("FRONTEND_ORIGIN_2", "http://localhost:3000")

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
ALPHAVANTAGE_API_KEY = os.getenv("ALPHAVANTAGE_API_KEY", "")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)


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


async def tavily_search(query: str) -> dict[str, Any]:
    if not TAVILY_API_KEY:
        return {
            "results": [
                SearchResult(
                    title="(Mock) Tavily disabled",
                    snippet=f"No TAVILY_API_KEY set. Query: {query}",
                    url="https://tavily.com",
                    published_at=None,
                )
            ],
            "images": [],
        }

    url = "https://api.tavily.com/search"
    payload = {
        "api_key": TAVILY_API_KEY,
        "query": query,
        "search_depth": "basic",
        "include_answer": False,
        "include_raw_content": False,
        "include_images": True,
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
    return {"results": out, "images": data.get("images", [])}


def get_mock_financial_data(symbol: str, note: str) -> dict[str, Any]:
    mock_history = []
    # Generate 30 days of mock data ending today
    today = datetime.now(timezone.utc)
    for i in range(30):
        date = (today - timedelta(days=30-i)).strftime("%Y-%m-%d")
        mock_history.append({
            "date": date,
            "price": 150.0 + (i * 0.5)
        })
    return {
        "mock": True,
        "symbol": symbol,
        "note": note,
        "market_cap": "2.5T",
        "pe_ratio": "30.5",
        "profit_margin": "0.25",
        "history": mock_history
    }


async def get_yahoo_history(symbol: str) -> list[dict[str, Any]] | None:
    # Unofficial Yahoo Finance API - use with caution, may be rate limited or blocked
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1mo&interval=1d"
    timeout = httpx.Timeout(10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            headers = {"User-Agent": "Mozilla/5.0"}
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            
            result = data.get("chart", {}).get("result", [])
            if not result:
                return None
            
            quote = result[0]
            timestamps = quote.get("timestamp", [])
            indicators = quote.get("indicators", {}).get("quote", [])
            
            if not timestamps or not indicators:
                return None
                
            closes = indicators[0].get("close", [])
            
            history = []
            for ts, price in zip(timestamps, closes):
                if price is not None:
                    dt = datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d")
                    history.append({"date": dt, "price": float(price)})
            
            return history
    except Exception as e:
        print(f"Yahoo Finance history failed: {e}")
        return None


async def alphavantage_overview(symbol: str) -> dict[str, Any]:
    # 1. Try AlphaVantage if Key is present
    if ALPHAVANTAGE_API_KEY and symbol != "UNKNOWN":
        base = "https://www.alphavantage.co/query"
        timeout = httpx.Timeout(15.0)
        
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                # 1. Overview
                params_ov = {"function": "OVERVIEW", "symbol": symbol, "apikey": ALPHAVANTAGE_API_KEY}
                resp_ov = await client.get(base, params=params_ov)
                resp_ov.raise_for_status()
                data_ov = resp_ov.json()

                # 2. Daily Series
                params_ts = {"function": "TIME_SERIES_DAILY", "symbol": symbol, "apikey": ALPHAVANTAGE_API_KEY}
                resp_ts = await client.get(base, params=params_ts)
                resp_ts.raise_for_status()
                data_ts = resp_ts.json()

            # Check for API errors / Rate limits
            if "Note" in data_ov or "Note" in data_ts:
                print("AlphaVantage rate limit reached.")
                # Fallthrough to backup
            elif not data_ov or ("Symbol" not in data_ov and "Name" not in data_ov):
                print("Symbol not found in AlphaVantage.")
                # Fallthrough to backup
            else:
                # Parse history
                history = []
                ts_data = data_ts.get("Time Series (Daily)", {})
                # Get last 30 days
                sorted_dates = sorted(ts_data.keys(), reverse=True)[:30]
                for d in sorted_dates:
                    # "4. close" is usually the closing price
                    close_price = ts_data[d].get("4. close")
                    if close_price:
                        history.append({"date": d, "price": float(close_price)})
                
                # Sort back to ascending for the graph
                history.sort(key=lambda x: x["date"])

                return {
                    "symbol": symbol,
                    "name": data_ov.get("Name"),
                    "description": data_ov.get("Description"),
                    "sector": data_ov.get("Sector"),
                    "industry": data_ov.get("Industry"),
                    "market_cap": data_ov.get("MarketCapitalization"),
                    "pe_ratio": data_ov.get("PERatio"),
                    "profit_margin": data_ov.get("ProfitMargin"),
                    "52w_high": data_ov.get("52WeekHigh"),
                    "52w_low": data_ov.get("52WeekLow"),
                    "currency": data_ov.get("Currency"),
                    "history": history
                }

        except Exception as e:
            print(f"AlphaVantage API failed: {e}")
            # Fallthrough to backup

    # 2. Backup: Yahoo Finance for History + Mock Overview
    if symbol != "UNKNOWN":
        print(f"Attempting Yahoo Finance fallback for {symbol}")
        yh = await get_yahoo_history(symbol)
        if yh:
            data = get_mock_financial_data(symbol, "Market data from Yahoo Finance (Overview mocked)")
            data["history"] = yh
            data["mock"] = False # Real history
            return data

    # 3. Final Fallback: Pure Mock
    note = "No ALPHAVANTAGE_API_KEY set" if not ALPHAVANTAGE_API_KEY else "Data source unavailable"
    return get_mock_financial_data(symbol, f"{note}; returning mock overview.")


def decompose_prompt(prompt: str) -> dict[str, Any]:
    # 1. Extract symbol using LLM
    symbol = None
    competitor = None

    if GOOGLE_API_KEY:
        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            # Improved prompt to handle natural language better
            resp = model.generate_content(
                f"Analyze this user prompt: '{prompt}'. "
                "Identify the company name and its stock symbol if possible. "
                "Return JSON: {{\"symbol\": \"AAPL\", \"company\": \"Apple Inc\"}}. "
                "If symbol is unknown, set it to null. If company is unknown, set it to null."
            )
            text = resp.text.strip()
            # Strip markdown code blocks if present
            if text.startswith("```"):
                text = text.split("\n", 1)[1] if "\n" in text else text
                if text.endswith("```"):
                    text = text.rsplit("\n", 1)[0] if "\n" in text else text
            
            try:
                data = json.loads(text)
                symbol = data.get("symbol")
                competitor = data.get("company")
            except json.JSONDecodeError:
                # Fallback if JSON parsing fails
                pass
        except Exception as e:
            print(f"LLM extraction failed: {e}")

    # 2. Fallback Heuristics
    if not symbol:
        # Finance symbol heuristic: if user includes ticker like (AAPL) use it.
        if "(" in prompt and ")" in prompt:
            try:
                inside = prompt.split("(", 1)[1].split(")", 1)[0].strip().upper()
                if 1 <= len(inside) <= 6 and inside.isalnum():
                    symbol = inside
            except Exception:
                pass
        
        # Simple lookup
        if not symbol:
            lookup = {
                "APPLE": "AAPL", "MICROSOFT": "MSFT", "GOOGLE": "GOOGL",
                "AMAZON": "AMZN", "TESLA": "TSLA", "META": "META",
                "NVIDIA": "NVDA", "NETFLIX": "NFLX", "ALPHABET": "GOOGL",
                "FACEBOOK": "META", "BMW": "BMW.DE"
            }
            prompt_upper = prompt.upper()
            for name, ticker in lookup.items():
                if name in prompt_upper:
                    symbol = ticker
                    break

    # 3. Determine Competitor Name
    if not competitor:
        if symbol:
            competitor = symbol
        else:
            # If prompt is short, assume it's the company name
            clean_prompt = prompt.strip()
            if len(clean_prompt) < 50:
                competitor = clean_prompt
            else:
                # Extract capitalized words as fallback
                tokens = prompt.replace("\n", " ").split(" ")
                caps = [t.strip(" ,.!?\"'") for t in tokens if t and t[0].isupper()]
                if caps:
                    competitor = " ".join(caps[:3])
                else:
                    competitor = "Unknown Company"

    # 4. Final Symbol Fallback
    if not symbol or symbol == "UNKNOWN":
        # If we have a competitor name, use it as the symbol so we get mock data for it
        # instead of "UNKNOWN".
        if competitor and competitor != "Unknown Company":
            symbol = competitor.upper().replace(" ", "")[:10]
        else:
            # Absolute fallback
            symbol = "AAPL"
            if not competitor or competitor == "Unknown Company":
                competitor = "Apple Inc"

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


def generate_report(competitor: str, news_data: dict, finance_data: dict) -> str:
    # Prepare data strings first, as they are needed for both LLM and fallback
    news_text = ""
    for i, r in enumerate(news_data.get("results", [])):
        news_text += f"{i+1}. {r.get('title')} - {r.get('url')}\n   {r.get('snippet')}\n"
        
    fin_overview = finance_data.get("overview", {})
    fin_json = json.dumps(fin_overview, indent=2)

    # Format financial data as Markdown table for fallback
    fin_table_rows = []
    fin_table_rows.append("| Metric | Value |")
    fin_table_rows.append("| :--- | :--- |")
    
    metrics = [
        ("market_cap", "Market Cap"),
        ("pe_ratio", "P/E Ratio"),
        ("profit_margin", "Profit Margin"),
        ("52w_high", "52 Week High"),
        ("52w_low", "52 Week Low"),
        ("sector", "Sector"),
        ("industry", "Industry")
    ]
    
    for key, label in metrics:
        val = fin_overview.get(key)
        if val:
            fin_table_rows.append(f"| {label} | {val} |")
            
    # Add any other scalar values not in the list
    for k, v in fin_overview.items():
        if k not in [m[0] for m in metrics] and k not in ["history", "description", "symbol", "name", "mock", "note"] and isinstance(v, (str, int, float)):
             fin_table_rows.append(f"| {k.replace('_', ' ').title()} | {v} |")

    fin_table = "\n".join(fin_table_rows)

    # Try LLM generation if key exists
    if GOOGLE_API_KEY:
        try:
            model = genai.GenerativeModel("gemini-1.5-flash")
            prompt = (
                f"Write a comprehensive financial report for '{competitor}' in Markdown format.\n\n"
                f"### Financial Data\n{fin_json}\n\n"
                f"### Recent News\n{news_text}\n\n"
                "The report should include:\n"
                "- Executive Summary\n"
                "- Key Financial Metrics (Market Cap, P/E, etc.)\n"
                "- Recent Developments & News Analysis\n"
                "- Conclusion/Outlook\n"
                "- List of Sources (URLs)\n\n"
                "Format cleanly with Markdown headers, bullet points, and bold text where appropriate."
            )
            resp = model.generate_content(prompt)
            return resp.text
        except Exception as e:
            print(f"LLM generation failed: {e}")
            # Fall through to fallback
    
    # Fallback static report
    return (
        f"# Financial Report for {competitor}\n\n"
        f"### Financial Overview\n{fin_table}\n\n"
        f"### Recent News\n{news_text}\n\n"
        "*(Note: Automated report generation unavailable. Displaying formatted data.)*"
    )


async def run_sequential(session_id: str, prompt: str) -> AsyncGenerator[dict[str, Any], None]:
    plan = decompose_prompt(prompt)
    if "error" in plan:
        yield {"type": "error", "payload": {"message": plan["error"]}}
        return

    planned_tasks = plan["tasks"]

    yield {"type": "task_planned", "payload": {"tasks": planned_tasks, "plan": plan}}

    # Run researcher + analyst concurrently (still considered sequential pipeline into writer).
    async def do_news() -> dict[str, Any]:
        query = f"{plan['competitor']} latest news press release product launch"
        search_data = await tavily_search(query)
        return {
            "query": query,
            "results": [r.__dict__ for r in search_data["results"]],
            "images": search_data["images"],
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

    # Synthesize memo using LLM
    sources: list[dict[str, Any]] = []
    for r in news.get("results", []):
        if r.get("url"):
            sources.append({"title": r.get("title"), "url": r.get("url")})

    memo = generate_report(plan["competitor"], news, finance)

    yield {
        "type": "agent_output",
        "payload": {"agent": "ReportWriter", "content": "Drafted final business memo.", "data": {"markdown": memo}},
    }
    yield {"type": "agent_finished", "payload": {"agent": "ReportWriter"}}

    yield {"type": "final_report", "payload": {"markdown": memo, "sources": sources}}


async def run_hierarchical(session_id: str, prompt: str) -> AsyncGenerator[dict[str, Any], None]:
    plan = decompose_prompt(prompt)
    if "error" in plan:
        yield {"type": "error", "payload": {"message": plan["error"]}}
        return

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

    news_data = await news_task
    news_payload = {
        "results": [r.__dict__ for r in news_data["results"]],
        "images": news_data["images"]
    }
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
    sources = [{"title": r.title, "url": r.url} for r in news_data["results"] if r.url]
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

    memo = generate_report(plan["competitor"], news_payload, fin_payload)

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
