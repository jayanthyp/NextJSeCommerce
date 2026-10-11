/**
 * Every tunable of the 7-stage pipeline in one place, all overridable by env
 * so a threshold or model change is a repo-variable flip, not a code change.
 */

const num = (name: string, fallback: number): number => {
  const raw = process.env[name];
  const parsed = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Three model roles. Which concrete model serves a role depends on the
 * transport llm.ts is using — see the provider chain there.
 *   orchestrator — reads the issue, runs Grill-me, writes the spec, triages failures
 *   worker       — default coding subagent
 *   workerLight  — subagent for tasks the spec marks as mechanical
 */
export type Role = "orchestrator" | "worker" | "workerLight";

/**
 * Provider 1 — OmniRoute (self-hosted on the VPS, reached through the SSH
 * tunnel the agent workflow opens). Each role is an OmniRoute *combo*: an
 * ordered fallback chain that spends free-tier models first and ends with
 * DeepSeek. The combos themselves live in OmniRoute's dashboard — see
 * docs/agentic-pipeline-vps.md.
 */
export const OMNIROUTE = {
  baseUrl: (process.env.OMNIROUTE_BASE_URL || "").replace(/\/+$/, ""),
  apiKey: process.env.OMNIROUTE_API_KEY || "",
  combos: {
    orchestrator: process.env.OMNIROUTE_ORCHESTRATOR_COMBO || "sdlc-orchestrator",
    worker: process.env.OMNIROUTE_WORKER_COMBO || "sdlc-worker",
    workerLight: process.env.OMNIROUTE_WORKER_LIGHT_COMBO || "sdlc-worker-light",
  } satisfies Record<Role, string>,
};

/**
 * Provider 2 — direct DeepSeek (or any Anthropic-compatible endpoint) via the
 * pre-existing ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY / ANTHROPIC_MODEL
 * secrets. One model for every role.
 */
export const PROXY_MODEL = process.env.ANTHROPIC_MODEL || "deepseek-v4-pro";

/**
 * Provider 3 — Claude direct, used only when ANTHROPIC_API_KEY is a real
 * Anthropic key (ANTHROPIC_BASE_URL unset). ANTHROPIC_MODEL still overrides
 * every role at once; the role-specific vars override it.
 */
export const CLAUDE_MODELS: Record<Role, string> = {
  orchestrator: process.env.ORCHESTRATOR_MODEL || process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  worker: process.env.WORKER_MODEL || process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
  workerLight: process.env.WORKER_LIGHT_MODEL || process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
};

/** max_tokens for the gateway/proxy transports, whose upstream models often cap output at 8K. */
export const GATEWAY_MAX_TOKENS = num("GATEWAY_MAX_TOKENS", 8192);

export const REPO_OWNER_LOGIN = process.env.REPO_OWNER_LOGIN || "jayanthyp";

/**
 * The issue-label state machine (scripts/ensure-labels.ts creates them).
 * Entry labels a human or another tool sets: readyForDev (also the legacy
 * readyForUiWork), inReview, readyForQa, readyToShip, and the blocked trio.
 * The rest are transient "a stage is running" locks that
 * scripts/recover-stuck-issues.ts rolls back if a run dies mid-stage.
 */
export const LABEL = {
  readyForDev: "status:ready-for-dev",
  readyForUiWork: "status:ready-for-ui-work",
  grilling: "status:grilling",
  awaitingAnswers: "status:awaiting-answers",
  designing: "status:designing",
  inProgress: "status:in-progress",
  inReview: "status:in-review",
  jevReview: "status:jev-review-in-progress",
  readyForQa: "status:ready-for-qa",
  qaInProgress: "status:qa-in-progress",
  readyToShip: "status:ready-to-ship",
  deploying: "status:deploying",
  blocked: "status:blocked",
  blockedArchitecture: "status:blocked-architecture-review",
  blockedDeploy: "status:blocked-deploy-failed",
  /** Pre-restructure ui-designer clarity label — treated like awaitingAnswers. */
  legacyUiClarity: "status:blocked-ui-work-need-clarity",
} as const;

/** Subagents dispatched concurrently per wave (the spec may plan at most this many tasks). */
export const MAX_PARALLEL_WORKERS = 5;

/** Build attempts (initial + fix rounds) per build-stage run before blocking to tech-lead escalation. */
export const MAX_BUILD_ATTEMPTS = num("MAX_BUILD_ATTEMPTS", 4);

/** Hard backstop on total changed lines — Ponytail + Jev's complexity score are the real over-engineering guard. */
export const MAX_DIFF_LINES = num("MAX_DIFF_LINES", 800);

/** Jev rejections routed back to the subagents (since the owner last commented) before escalating to a human. */
export const MAX_JEV_ROUNDS = num("MAX_JEV_ROUNDS", 3);

/** Dev<->E2E round trips before a persistent Playwright failure escalates. */
export const MAX_QA_ROUNDS = 3;

/** In-run build<->escalation hand-backs before the circuit breaker trips (see graph.ts). */
export const MAX_HANDOVERS = 3;

export const JEV = {
  baseUrl: (process.env.JEV_BASE_URL || "https://api.typesafe.ai").replace(/\/+$/, ""),
  model: process.env.JEV_MODEL || "jev-latest",
  /** A Noul passes when P(desired answer) >= this. TypeSafe's docs suggest 0.8 as the "definitive" cutoff. */
  passThreshold: num("JEV_PASS_THRESHOLD", 0.8),
  /** Highest acceptable complexity score on the 0-4 rubric in jev/rubric.ts (1 = "lean"). */
  maxComplexity: num("JEV_MAX_COMPLEXITY", 1.5),
  /**
   * Jev's context window is 32,000 tokens for state + questions. Leave room
   * for the questions themselves; a diff that does not fit is escalated to a
   * human rather than silently truncated.
   */
  stateTokenBudget: num("JEV_STATE_TOKEN_BUDGET", 26_000),
} as const;

/** Where spec.md / spec.json are committed on the feature branch. */
export const specDir = (issueNumber: number): string => `docs/specs/issue-${issueNumber}`;

/**
 * Paths no subagent may touch: the pipeline's own control plane and the locked
 * spec. A change here needs a human — otherwise an agent could relax the very
 * gates that review it.
 */
export const PROTECTED_PATH_RE = /^(src\/agents\/|scripts\/(trigger|recover-stuck-issues|reconcile-closed-issues)\.ts$|scripts\/tech-lead-|\.claude\/|\.github\/workflows\/langgraph-agent\.yml$|docs\/specs\/|langgraph\.json$)/;
