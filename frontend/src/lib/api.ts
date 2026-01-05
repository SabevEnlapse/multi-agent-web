/**
 * API Client Library
 *
 * Handles communication with the backend API.
 * - Defines types for API requests and responses.
 * - Provides functions to create and run sessions.
 * - Manages Server-Sent Events (SSE) connection for real-time updates.
 */

export type RunMode = "sequential" | "hierarchical";

export type PlannedTask = {
  agent: string;
  title: string;
};

export type SSEEvent =
  | { type: "session_created"; payload: { id: string } }
  | { type: "run_requested"; payload: { id: string } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { type: "task_planned"; payload: { tasks: PlannedTask[]; plan: any } }
  | { type: "agent_started"; payload: { agent: string } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { type: "agent_output"; payload: { agent: string; content: string; data?: any } }
  | { type: "agent_finished"; payload: { agent: string } }
  | { type: "final_report"; payload: { markdown: string; sources: { title: string; url: string }[] } }
  | { type: "error"; payload: { message: string } };

export function backendUrl(): string {
  // Our dev backend runs on :8000 (see [`frontend/.env.local.example`](frontend/.env.local.example)).
  // Defaulting to :8000 avoids "Failed to fetch" when env vars aren't loaded.
  return process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
}

/**
 * Creates a new research session.
 * @param prompt The user's research query.
 * @param mode The execution mode (sequential or hierarchical).
 * @returns The created session ID.
 */
export async function createSession(prompt: string, mode: RunMode): Promise<{ id: string }> {
  const res = await fetch(`${backendUrl()}/api/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, mode }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || "Failed to create session");
  }

  return res.json();
}

/**
 * Triggers the execution of a session.
 * @param sessionId The ID of the session to run.
 */
export async function runSession(sessionId: string): Promise<void> {
  const res = await fetch(`${backendUrl()}/api/sessions/${sessionId}/run`, {
    method: "POST",
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || "Failed to run session");
  }
}

/**
 * Connects to the backend SSE endpoint to receive real-time updates.
 * @param sessionId The ID of the session to monitor.
 * @param onEvent Callback function to handle incoming events.
 * @returns A cleanup function to close the connection.
 */
export function streamSessionEvents(sessionId: string, onEvent: (ev: SSEEvent) => void): () => void {
  const es = new EventSource(`${backendUrl()}/api/sessions/${sessionId}/events`);

  const handler = (type: SSEEvent["type"]) => (e: MessageEvent) => {
    try {
      const payload = JSON.parse(e.data);
      onEvent({ type, payload } as SSEEvent);
    } catch (err) {
      onEvent({ type: "error", payload: { message: (err as Error).message } });
    }
  };

  es.addEventListener("session_created", handler("session_created"));
  es.addEventListener("run_requested", handler("run_requested"));
  es.addEventListener("task_planned", handler("task_planned"));
  es.addEventListener("agent_started", handler("agent_started"));
  es.addEventListener("agent_output", handler("agent_output"));
  es.addEventListener("agent_finished", handler("agent_finished"));
  es.addEventListener("final_report", handler("final_report"));
  es.addEventListener("error", handler("error"));

  es.onerror = () => {
    // Browser will retry automatically; we keep the connection open.
  };

  return () => {
    es.close();
  };
}
