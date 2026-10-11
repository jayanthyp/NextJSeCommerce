/**
 * Cross-run memory via claude-mem's worker HTTP API (SQLite + Chroma on the
 * VPS, bound to 127.0.0.1 there and reached through the SSH tunnel the agent
 * workflow opens — see docs/agentic-pipeline-vps.md).
 *
 *   stage 1 (ingest): recallMemory()  — GET  /api/search
 *   stage 2 (grill) and stage 7 (ship): rememberEvent()
 *                     — POST /api/sessions/init → /observations → /summarize → /session-end
 *
 * The worker compresses each recorded event into a searchable observation
 * asynchronously with its own model, so a write returns immediately.
 *
 * Memory is an optimisation, never a dependency: unset CLAUDE_MEM_URL, an
 * unreachable worker, or any error degrades to "no memory" with a warning.
 */
const BASE = (process.env.CLAUDE_MEM_URL || "").replace(/\/+$/, "");
const PROJECT = process.env.CLAUDE_MEM_PROJECT || "NextJSeCommerce";
const MAX_CONTEXT_CHARS = 6000;

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Past observations and session summaries relevant to `query`, rendered as compact prompt context ("" when unavailable). */
export async function recallMemory(query: string, limit = 8): Promise<string> {
  if (!BASE) return "";
  try {
    const params = new URLSearchParams({ query: query.slice(0, 300), format: "json", limit: String(limit), project: PROJECT });
    const result = (await call(`/api/search?${params}`)) as { observations?: Record<string, unknown>[]; sessions?: Record<string, unknown>[] };
    const lines: string[] = [];
    for (const o of result.observations ?? []) {
      const when = str(o.created_at).slice(0, 10);
      const body = str(o.narrative) || str(o.subtitle) || str(o.text);
      lines.push(`- [${str(o.type) || "observation"} ${when}] ${str(o.title)}${body ? ` — ${body}` : ""}`);
    }
    for (const s of result.sessions ?? []) {
      const when = str(s.created_at).slice(0, 10);
      const body = [str(s.request), str(s.learned), str(s.completed)].filter(Boolean).join(" | ");
      if (body) lines.push(`- [session ${when}] ${body}`);
    }
    const text = lines.join("\n").slice(0, MAX_CONTEXT_CHARS);
    console.log(`[memory] recalled ${lines.length} entr${lines.length === 1 ? "y" : "ies"} for "${query.slice(0, 60)}"`);
    return text;
  } catch (err) {
    console.warn(`[memory] recall skipped: ${err instanceof Error ? err.message : String(err)}`);
    return "";
  }
}

/** Records one pipeline event (requirements resolved, change shipped) for future issues to recall. */
export async function rememberEvent(e: { issueNumber: number; title: string; kind: "requirements" | "ship"; input: object; output: object; summary: string }): Promise<void> {
  if (!BASE) return;
  const contentSessionId = `sdlc-issue-${e.issueNumber}-${e.kind}-${Date.now()}`;
  const cwd = process.cwd();
  try {
    await call("/api/sessions/init", { method: "POST", body: JSON.stringify({ contentSessionId, project: PROJECT, prompt: `Issue #${e.issueNumber}: ${e.title}`, cwd }) });
    await call("/api/sessions/observations", {
      method: "POST",
      body: JSON.stringify({ contentSessionId, tool_name: e.kind === "ship" ? "ShipPullRequest" : "ResolveRequirements", tool_input: e.input, tool_response: e.output, cwd }),
    });
    await call("/api/sessions/summarize", { method: "POST", body: JSON.stringify({ contentSessionId, last_assistant_message: e.summary, cwd }) });
    await call("/api/sessions/session-end", { method: "POST", body: JSON.stringify({ contentSessionId, reason: "completed", cwd }) });
    console.log(`[memory] recorded ${e.kind} for #${e.issueNumber}`);
  } catch (err) {
    console.warn(`[memory] record skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
}
