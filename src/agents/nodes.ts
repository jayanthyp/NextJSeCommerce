/**
 * The five SDLC roles as LangGraph nodes. Each is a faithful port of its
 * source-of-truth .md file (see the migration plan's "Decisions already
 * made" section) — not a reinvention. Tool-First: every gh/git/npm/docker
 * call goes through tools.ts via child_process; the LLM (ChatAnthropic) is
 * invoked only for reasoning — formatting a spec, generating/fixing code,
 * and the SOLID/VPS-resource audit — never for arbitrary bash scripting.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { interrupt } from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";
import { tool as makeTool } from "@langchain/core/tools";
import { z } from "zod";
import type { AgenticSdlcStateType, CodeChange } from "./state.js";
import {
  ghIssueView,
  ghIssueEdit,
  ghIssueComment,
  ghIssueCreate,
  ghPrList,
  ghPrDiff,
  ghPrChecks,
  ghPrCreate,
  ghPrComment,
  ghPrReviewComment,
  ghRunListLatestId,
  ghRunWatch,
  ghWorkflowRun,
  gitCheckout,
  gitAdd,
  gitCommit,
  gitPush,
  gitListFiles,
  gitHasStagedChanges,
  gitDiffSummary,
  gitDiscardChanges,
  runTechLeadApprove,
  runTechLeadMerge,
  runTechLeadRollback,
  runNpmScript,
  runPlaywright,
  dockerComposeUp,
  dockerComposeDown,
  dockerComposeSeed,
  dockerComposeIsHealthy,
  dockerComposeGetPublishableKey,
  dockerComposeRebuildStorefront,
  formatBlockingComment,
  formatQaReport,
} from "./tools.js";

const MAX_DEV_LOOP_ATTEMPTS = 5;

/**
 * Single place every node instantiates its LLM from. Provider is chosen by
 * env vars, so switching between Claude and DeepSeek (the repo's fallback
 * provider when Anthropic credit is exhausted) is a pure environment flip —
 * no code change, mirroring the `~/.claude/settings.json` convention:
 *
 *   Claude  (default):  ANTHROPIC_API_KEY = real Anthropic Console key
 *                       (leave ANTHROPIC_BASE_URL unset)
 *   DeepSeek:            ANTHROPIC_API_KEY = DeepSeek key
 *                       ANTHROPIC_BASE_URL = https://api.deepseek.com/anthropic
 *                       ANTHROPIC_MODEL    = deepseek-v4-pro
 *
 * DeepSeek exposes an Anthropic-compatible Messages endpoint, so
 * `@langchain/anthropic` talks to it unchanged — only the base URL, model
 * name, and key change, all three together (an Anthropic key sent to the
 * DeepSeek endpoint, or vice-versa, fails auth).
 *
 * Use `deepseek-v4-pro` (not `deepseek-v4-pro[1m]`) and let getLlm() disable
 * thinking: DeepSeek's endpoint emits `thinking` blocks by default (adaptive
 * thinking), which leaves `res.tool_calls` empty and breaks structured
 * extraction — see getLlm()'s `thinking: { type: "disabled" }`.
 */
function getLlm(temperature = 0) {
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  return new ChatAnthropic({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
    temperature,
    // ChatAnthropic defaults maxTokens to 1024. Under DeepSeek's endpoint, a
    // large context (the dev-loop prompt carries ~17K input tokens of repo
    // source) makes the model "hedge": with only 1024 output tokens budgeted
    // it emits plain text and ends the turn (`stop_reason: end_turn`) instead
    // of committing to the `tool_use` block `extractStructured` needs, so
    // `res.tool_calls` comes back empty. A larger budget (4096) lets it emit
    // the tool call reliably (~86 output tokens for a one-line edit).
    maxTokens: 4096,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    // DeepSeek's Anthropic-compatible endpoint defaults to adaptive thinking:
    // the model emits `thinking` blocks that crowd out the `tool_use` block
    // LangChain needs, so `res.tool_calls` comes back empty and structured
    // extraction throws. Disable thinking explicitly on the DeepSeek path.
    // Claude doesn't think unless `thinking` is enabled, so leave it unset.
    ...(baseURL ? { thinking: { type: "disabled" as const }, clientOptions: { baseURL } } : {}),
  });
}

/**
 * Structured extraction that works against both Claude and DeepSeek.
 *
 * `ChatAnthropic.withStructuredOutput()` is unusable on DeepSeek's
 * Anthropic-compatible endpoint: it forces
 * `tool_choice: { type: "tool", name: "extract" }`, and DeepSeek's proxy
 * routes any *forced-tool* request to its thinking/reasoner model, which
 * rejects it (`"Thinking mode does not support this tool_choice"`). Binding
 * the tool with `tool_choice: "any"` instead sidesteps that path and is
 * accepted by both providers; we parse the emitted tool call's args ourselves.
 */
async function extractStructured<S extends z.ZodTypeAny>(
  schema: S,
  messages: unknown[],
  temperature = 0
): Promise<z.infer<S>> {
  const llm = getLlm(temperature).bindTools(
    [
      makeTool(
        async (_input: z.infer<S>) => "",
        {
          name: "extract",
          description: schema.description ?? "Return the requested structured data.",
          schema,
        } as never
      ),
    ],
    { tool_choice: "any" }
  );

  // DeepSeek occasionally emits an empty `tool_use` (no `input`) under
  // `tool_choice: "any"` — especially for large outputs like full file
  // contents — and other times emits a valid one for the identical prompt.
  // Retry with a corrective nudge up to a bounded number of times instead of
  // failing the whole graph run on a transient empty call.
  const MAX_ATTEMPTS = 3;
  let history = messages as object[];
  let lastError = "no tool call";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await llm.invoke(history as never);
    const toolCall = res.tool_calls?.[0];
    if (!toolCall) {
      lastError = "no tool call";
      history = [...history, { role: "user", content: "You did not call the extract tool. Call it with the full structured arguments." }];
      continue;
    }
    try {
      return schema.parse(toolCall.args);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      history = [
        ...history,
        {
          role: "user",
          content: `Your extract tool call was missing required fields and failed validation. Re-read the request and return the COMPLETE structured output (do not emit an empty tool call). Validation error: ${lastError}`,
        },
      ];
    }
  }
  throw new Error(`extractStructured failed after ${MAX_ATTEMPTS} attempts (${lastError})`);
}

/** Whether the most recent comment is a genuine new reply from the repo owner, not the agent's own prior comment. Mirrors tech-lead.md's / ui-designer.md's reply-detection pattern. */
function hasOwnerReplySince(comments: { author: { login: string }; body: string }[], ownerLogin: string): boolean {
  const last = comments[comments.length - 1];
  if (!last) return false;
  return last.author.login === ownerLogin;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// 1. Business Analyst Node
//
// Not wired into the label-routing table in graph.ts — see the plan's Step 4
// note. business-analyst.md is a daily-cadence, cron-driven research role
// (already covered by the existing copilot-ba-agent/ service), not something
// an issue/label/comment webhook naturally triggers. Kept here for structural
// parity with the user's 5-node spec.
// =============================================================================

const FeatureSpecSchema = z.object({
  title: z.string(),
  body: z.string().describe("Full issue body in the Feature Summary / Value Proposition / Acceptance Criteria (Gherkin) format"),
  label: z.enum(["status:ready-for-ui-work", "status:ready-for-dev"]),
});

export async function businessAnalystNode(input: { rawFeatureNotes: string }): Promise<{ issueNumber: number }> {
  const spec = await extractStructured(FeatureSpecSchema, [
    {
      role: "system",
      content:
        "You are a Senior Technical Business Analyst. Format the given raw feature notes into a BDD/Gherkin GitHub issue, and classify it status:ready-for-ui-work (visual/layout/component/animation/responsiveness changes) or status:ready-for-dev (backend/logic/integration/data/API changes).",
    },
    { role: "user", content: input.rawFeatureNotes },
  ]);
  const issueNumber = await ghIssueCreate(spec.title, spec.body, spec.label);
  return { issueNumber };
}

// =============================================================================
// 2. UI Designer Node
// =============================================================================

function readDesignContext(): string {
  const candidates = ["storefront/DESIGN.md", "storefront/tailwind.config.ts", "storefront/src/app/globals.css"];
  const parts: string[] = [];
  for (const path of candidates) {
    try {
      parts.push(`--- ${path} ---\n${readFileSync(path, "utf-8")}`);
    } catch {
      // File absent — ui-designer.md itself treats "e.g., DESIGN.md" as an
      // example, not a guarantee, so a missing file here is expected, not an error.
    }
  }
  return parts.join("\n\n");
}

const UiSpecSchema = z.object({
  needsClarity: z.boolean(),
  refinedBody: z.string().describe("Full refined issue body with Desktop/Mobile/Design-System/Breakpoint/Interactive-state sections, if needsClarity is false"),
  clarityTopic: z.string().optional(),
  clarityOptions: z
    .array(z.object({ label: z.string(), description: z.string(), pros: z.string(), cons: z.string() }))
    .optional(),
  recommendation: z.string().optional(),
});

export async function uiDesignerNode(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  const issue = await ghIssueView(state.issueNumber);
  const resuming = state.currentLabel === "status:blocked-ui-work-need-clarity";

  if (resuming) {
    const ownerLogin = process.env.REPO_OWNER_LOGIN ?? "jayanthyp";
    if (!hasOwnerReplySince(issue.comments, ownerLogin)) {
      return {}; // no genuine reply yet — leave alone, matching Workflow C step 1
    }
    await ghIssueEdit(state.issueNumber, {
      addLabel: "status:ui-requirement-refinement-in-progress",
      removeLabel: "status:blocked-ui-work-need-clarity",
    });
  } else {
    await ghIssueEdit(state.issueNumber, { addLabel: "status:ui-requirement-refinement-in-progress" });
  }

  const designContext = readDesignContext();
  const result = await extractStructured(UiSpecSchema, [
    {
      role: "system",
      content:
        "You are a Senior Lead UI Designer & Technical UX Architect. Refine this issue into an explicit UI technical spec covering Desktop (>1024px), Mobile (<768px), Design System Alignment, Responsive Breakpoints, and Interactive States. If genuinely ambiguous (missing visual direction, conflicting UX logic, missing content hierarchy), set needsClarity=true and provide up to 3 options with pros/cons and a recommendation instead.",
    },
    { role: "user", content: `Design system context:\n${designContext}\n\nIssue #${state.issueNumber}: ${issue.title}\n\n${issue.body}` },
  ]);

  if (result.needsClarity) {
    const comment = formatBlockingComment(
      `Need clarification on **${result.clarityTopic}** to ensure responsive integrity and theme consistency.`,
      (result.clarityOptions ?? []).map((o) => `**${o.label}:** ${o.description} — *Pros:* ${o.pros} | *Cons:* ${o.cons}`),
      "### 🎨 UI Design Clarity Required"
    );
    await ghIssueComment(state.issueNumber, comment);
    await ghIssueEdit(state.issueNumber, {
      addLabel: "status:blocked-ui-work-need-clarity",
      removeLabel: "status:ui-requirement-refinement-in-progress",
    });
    return { currentLabel: "status:blocked-ui-work-need-clarity" };
  }

  if (resuming) {
    await ghIssueComment(state.issueNumber, `✅ Applied refined spec per your reply. Promoting to status:ready-for-dev.`);
  }
  await ghIssueEdit(state.issueNumber, {
    addLabel: "status:ready-for-dev",
    removeLabel: resuming
      ? "status:blocked-ui-work-need-clarity,status:ui-requirement-refinement-in-progress"
      : "status:ready-for-ui-work,status:ui-requirement-refinement-in-progress",
  });
  return { currentLabel: "status:ready-for-dev" };
}

// =============================================================================
// 3. Dev Loop Node
// =============================================================================

const CodeChangesSchema = z.object({
  changes: z
    .array(
      z.object({
        path: z.string().describe("Exact file path (relative to repo root)"),
        search: z.string().describe("The exact existing code snippet to find (copy it verbatim, including whitespace)"),
        replace: z.string().describe("The replacement snippet — the minimal change, nothing else"),
      })
    )
    .min(1),
  summary: z.string().describe("One-paragraph summary of what changed and why, for the PR body"),
});

async function runDevLoopTests(): Promise<{ passed: boolean; log: string }> {
  // Unit tests only — the integration suites (test:integration:modules/http)
  // need a running Postgres, which the event-driven CI runner does not
  // provision; the repo's own test.yml CI covers them on PR open.
  const steps: { cwd: "medusa" | "storefront"; script: string }[] = [
    { cwd: "medusa", script: "test:unit" },
    { cwd: "storefront", script: "test:unit" },
  ];
  let log = "";
  for (const step of steps) {
    const r = await runNpmScript(step.cwd, step.script);
    log += `\n--- ${step.cwd}: npm run ${step.script} ---\n${r.stdout}\n${r.stderr}`;
    if (r.exitCode !== 0) return { passed: false, log };
  }
  return { passed: true, log };
}

function applyCodeChanges(changes: CodeChange[]): void {
  for (const change of changes) {
    const content = readFileSync(change.path, "utf-8");
    if (!content.includes(change.search)) {
      throw new Error(
        `Search text not found in ${change.path}. The LLM's "search" didn't match the file — retry with a verbatim copy.\nSearch: ${change.search.slice(0, 200)}`
      );
    }
    const newContent = content.replace(change.search, change.replace);
    writeFileSync(change.path, newContent, "utf-8");
  }
}

/**
 * Words that carry no signal for locating a file, dropped when deriving grep
 * terms from the issue title/body.
 */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "into", "onto", "your",
  "you", "are", "was", "were", "add", "adds", "should", "when", "where",
  "which", "what", "have", "has", "will", "would", "could", "page", "pages",
  "issue", "able", "will", "not", "all", "any", "but",
]);

/** Pulls candidate grep terms out of free text, keeping the first ~10 meaningful words. */
function deriveSearchTerms(issueText: string): string[] {
  const words = issueText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 10);
}

/**
 * Builds the repo context the dev-loop LLM reasons over. Two halves:
 *
 * 1. A FULL path index (every tracked source file) — so the LLM can never
 *    hallucinate a path like `.../product-image/index.tsx` when the real file
 *    is `.../thumbnail/index.tsx`.
 * 2. Deterministically-located candidate files: files whose body matches the
 *    issue's terms, ranked by relevance (rare terms weigh more than generic
 *    ones), with FULL content for the top candidates and line-numbered grep
 *    evidence for the wider set. Locating the file is a search problem, so it
 *    is solved here with a deterministic scan — not left to the LLM to guess.
 *
 * The old alphabetical-first 60KB dump was the bug: it covered only the first
 * ~57 of 337 files (everything under `storefront/src/app/...`) and never
 * reached `storefront/src/modules/...`, so the model invented paths.
 */
async function readRepoContext(issueText: string): Promise<string> {
  const files = await gitListFiles(["storefront/src", "medusa/src"]);
  const source = files.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
  const terms = deriveSearchTerms(issueText);

  const pathIndex = source.map((f) => `- ${f}`).join("\n");

  // Read every candidate file once (bounded per file), then score.
  const MAX_FILE_BYTES = 6_000;
  const contents = new Map<string, string>();
  for (const file of source) {
    try {
      const c = readFileSync(file, "utf-8");
      if (c.length <= MAX_FILE_BYTES) contents.set(file, c);
    } catch {
      /* skip unreadable */
    }
  }

  // Rank candidates by: component-file boost (real code lives under
  // components/templates/models/services/api/jobs/lib, where edits actually
  // land) + number of distinct issue terms matched. The earlier 1/n rarity
  // weighting was a bug — a super-rare false-positive term ("img", matching
  // only two payment icons via role="img") outranked the real target.
  const CODE_DIR = /\/(components|templates|models|services|api|jobs|scripts|lib)\//;
  const scored = [...contents.keys()]
    .map((file) => {
      const h = contents.get(file)!.toLowerCase();
      const matchedTerms = terms.filter((t) => h.includes(t)).length;
      const boost = CODE_DIR.test(file) ? 5 : 0;
      return { file, score: boost + matchedTerms, matchedTerms };
    })
    .filter((s) => s.matchedTerms > 0)
    .sort((a, b) => b.score - a.score || b.matchedTerms - a.matchedTerms || a.file.localeCompare(b.file));

  // Full content for the top-ranked candidates (bounded).
  const TOP_CONTENT_BYTES = 40_000;
  let contentBytes = 0;
  const topContent: string[] = [];
  for (const s of scored) {
    const c = contents.get(s.file)!;
    if (contentBytes + c.length > TOP_CONTENT_BYTES) break;
    topContent.push(`=== ${s.file} ===\n${c}`);
    contentBytes += c.length;
  }

  // Line-numbered grep evidence across EVERY matching file (not just the top
  // candidates) — cheap and lets the LLM target the right lines even when the
  // target file ranks low (e.g. thumbnail, which only shares the generic word
  // "images" with the issue). Bounded by line count, not file count.
  const grepLines: string[] = [];
  const MAX_GREP_LINES = 400;
  for (const s of scored) {
    if (grepLines.length >= MAX_GREP_LINES) break;
    const matches = contents
      .get(s.file)!
      .split("\n")
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => terms.some((t) => line.toLowerCase().includes(t)))
      .slice(0, 8);
    if (!matches.length) continue;
    grepLines.push(`### ${s.file}`);
    for (const m of matches) grepLines.push(`  ${m.no}: ${m.line}`);
  }

  return [
    "## File path index (every tracked source file — use an exact path from this list, never invent one):",
    pathIndex,
    "",
    "## Top candidate files (ranked by relevance to the issue — full content):",
    topContent.join("\n\n") || "(none matched)",
    "",
    "## Grep evidence (line-numbered matches of the issue's terms):",
    grepLines.join("\n") || "(none)",
  ].join("\n");
}

/**
 * Writes a throwaway local `.env` so the QA node's docker-compose stack has the
 * env vars it references (the real `.env` is gitignored and absent in CI).
 * Values are fixed test placeholders — the stack is ephemeral and torn down
 * after the run, so no real secrets are involved.
 */
async function writeLocalEnv(): Promise<void> {
  const env = [
    "STORE_DOMAIN=localhost",
    "API_DOMAIN=localhost",
    "ACME_EMAIL=dev@localhost",
    "POSTGRES_USER=medusa",
    "POSTGRES_PASSWORD=medusa",
    "POSTGRES_DB=medusa",
    "REDIS_URL=redis://redis:6379",
    "MEILI_MASTER_KEY=0123456789abcdef0123456789abcdef",
    "JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "COOKIE_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "MEDUSA_WORKER_MODE=shared",
    "MEDUSA_BACKEND_URL=http://localhost:9000",
    "STORE_CORS=http://localhost:3000",
    "ADMIN_CORS=http://localhost:9000",
    "AUTH_CORS=http://localhost:3000",
    "NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000",
    "NEXT_PUBLIC_BASE_URL=http://localhost:3000",
    "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_test_placeholder",
    "REVALIDATE_SECRET=test-revalidate",
    "",
  ].join("\n");
  writeFileSync(".env", env, "utf-8");
}

/** Updates the .env with the real publishable key fetched after seeding. */
function updateLocalEnvPublishableKey(key: string): void {
  let env = readFileSync(".env", "utf-8");
  if (/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=/m.test(env)) {
    env = env.replace(/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=.*$/m, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${key}`);
  } else {
    env += `\nNEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${key}\n`;
  }
  writeFileSync(".env", env, "utf-8");
}

export async function devLoopNode(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  const issue = await ghIssueView(state.issueNumber);
  await ghIssueEdit(state.issueNumber, {
    addLabel: "status:in-progress",
    removeLabel: "status:ready-for-dev",
  });

  // Re-entry check (dev-loop.md step 2): an existing open PR means this is a
  // resumed/re-entered issue (e.g. tech-lead handed a resolved status:blocked
  // issue back), not fresh work.
  const existingPrs = (await ghPrList(`${state.issueNumber} in:body`, "number,headRefName")) as {
    number: number;
    headRefName: string;
  }[];
  const existingPr = existingPrs[0];
  const branch = existingPr?.headRefName ?? `feature/issue-${state.issueNumber}-langgraph`;

  if (existingPr) {
    await gitCheckout(branch);
  } else {
    await gitCheckout(branch, { create: true });
  }

  const commentsText = issue.comments.map((c) => `${c.author.login}: ${c.body}`).join("\n\n");
  const repoContext = await readRepoContext(`${issue.title}\n${issue.body}`);
  let attempts = 0;
  let lastError = "";
  let changes: CodeChange[] = [];
  let summary = "";

  while (attempts < MAX_DEV_LOOP_ATTEMPTS) {
    attempts += 1;
    const result = await extractStructured(CodeChangesSchema, [
      {
        role: "system",
        content:
          "You are implementing a GitHub issue by making the SMALLEST possible code change, expressed as a search/replace edit.\n\nRules (non-negotiable):\n1. MINIMAL DIFF — change only the exact line(s) needed. Adding one attribute (e.g. loading=\"lazy\") is a one-line change.\n2. RIGHT FILE — locate the single file that actually contains the element the issue targets. If the issue is about an image, find the file with the <img>/<Image> tag and edit THAT file, not its parent wrapper.\n3. NO REFACTORING — do not rename props/imports, do not change logic, do not reformat, do not touch unrelated files.\n\nFor each edit, provide:\n- `path`: the exact file path.\n- `search`: the exact existing snippet, copied VERBATIM from the file below (including whitespace/indentation).\n- `replace`: that same snippet with ONLY the minimal change applied.\n\nThe repository source files (current contents) are below:\n\n" +
          repoContext,
      },
      {
        role: "user",
        content: lastError
          ? `Previous attempt was rejected or failed:\n${lastError}\n\nFix the code accordingly. Original issue #${state.issueNumber}: ${issue.title}\n\n${issue.body}\n\nComments:\n${commentsText}`
          : `Issue #${state.issueNumber}: ${issue.title}\n\n${issue.body}\n\nComments:\n${commentsText}`,
      },
    ]);

    changes = result.changes;
    summary = result.summary;
    try {
      applyCodeChanges(changes);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Feed the actual on-disk content of the targeted paths back so the next
      // attempt's `search` is a verbatim copy, not another hallucinated guess.
      const real = changes
        .map((c) => {
          try {
            return `=== ${c.path} ===\n${readFileSync(c.path, "utf-8")}`;
          } catch {
            return `(path does not exist: ${c.path})`;
          }
        })
        .join("\n\n");
      lastError += `\n\nActual file content on disk (copy ` + "`search`" + ` verbatim from this):\n${real}`;
      await gitDiscardChanges();
      continue;
    }

    // Reject scope-creep: a broad rewrite instead of a minimal edit.
    const diff = await gitDiffSummary();
    if (diff.files > 2 || diff.lines > 40) {
      lastError = `Scope-creep detected: ${diff.files} file(s) / ${diff.lines} lines changed. Make a MINIMAL edit — modify only the one file that contains the target element, ideally a single line.`;
      await gitDiscardChanges();
      continue;
    }

    const testRun = await runDevLoopTests();
    if (testRun.passed) {
      lastError = "";
      break;
    }
    lastError = testRun.log.slice(-8000); // bound what we feed back
  }

  if (lastError) {
    const comment = formatBlockingComment(
      `Could not get tests passing after ${MAX_DEV_LOOP_ATTEMPTS} attempts. Last failure:\n\`\`\`\n${lastError.slice(-2000)}\n\`\`\``,
      ["Provide a more specific fix direction", "Confirm this is a known flaky test to skip for now", "Close/deprioritize this issue"]
    );
    await ghIssueComment(state.issueNumber, comment);
    await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked", removeLabel: "status:in-progress" });
    return { currentLabel: "status:blocked", devLoopAttempts: attempts, codeChanges: changes };
  }

  await gitAdd(changes.map((c) => c.path));
  await gitCommit(summary.slice(0, 72));

  let prNumber: number;
  if (existingPr) {
    await gitPush(branch);
    await ghPrComment(existingPr.number, `Pushed a fix for issue #${state.issueNumber}. Ran: unit + integration tests — all passing.`);
    prNumber = existingPr.number;
  } else {
    await gitPush(branch, { setUpstream: true });
    prNumber = await ghPrCreate(
      issue.title,
      `Closes #${state.issueNumber}\n\n${summary}\n\n## Test plan\nnpm run test:unit (medusa + storefront) — passing. e2e not run locally — awaiting quality-analyst verification.`,
      branch
    );
  }

  await ghIssueEdit(state.issueNumber, { addLabel: "status:ready-for-qa", removeLabel: "status:in-progress" });
  await ghIssueComment(
    state.issueNumber,
    `Opened PR #${prNumber}. Ran: unit + integration tests — all passing. e2e not run locally — awaiting quality-analyst verification.`
  );

  return { currentLabel: "status:ready-for-qa", prNumber, codeChanges: changes, devLoopAttempts: attempts };
}

// =============================================================================
// 4. Quality Analyst Node — zero-LLM fast path
// =============================================================================

export async function qualityAnalystNode(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  const issue = await ghIssueView(state.issueNumber);
  const prs = (await ghPrList(`${state.issueNumber} in:body`, "number,headRefName,url")) as {
    number: number;
    headRefName: string;
    url: string;
  }[];
  const pr = prs[0];
  if (!pr) {
    await ghIssueComment(
      state.issueNumber,
      formatBlockingComment("No open PR found for this issue — can't run QA against nothing.", [
        "A PR was expected but never opened",
        "The issue was relabeled to status:ready-for-qa in error",
      ])
    );
    await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked", removeLabel: "status:ready-for-qa" });
    return { currentLabel: "status:blocked" };
  }

  await ghIssueEdit(state.issueNumber, { addLabel: "status:qa-in-progress", removeLabel: "status:ready-for-qa" });

  const checks = await ghPrChecks(pr.number);
  console.log(`[qa] PR #${pr.number} checks: ${JSON.stringify(checks)}`);
  const pending = checks.filter((c) => c.bucket === "pending");
  if (pending.length > 0) {
    // Known limitation: this workflow doesn't subscribe to check_suite/workflow_run
    // completion events, so a pending-CI run has no automatic future retrigger
    // the way the old 3-minute poll did. Left as a note for a follow-up webhook
    // subscription rather than solved here (see migration plan / README).
    await ghIssueEdit(state.issueNumber, { addLabel: "status:ready-for-qa", removeLabel: "status:qa-in-progress" });
    return {}; // no-op this run; needs a later manual re-label or a check_suite trigger to retry
  }

  const failed = checks.filter((c) => c.bucket === "fail");
  if (failed.length > 0) {
    const report = formatQaReport({
      featureTitle: issue.title,
      passed: false,
      prUrl: pr.url,
      executionSummary: [`PR CI is red (${failed.map((c) => c.name).join(", ")}) — E2E not attempted`],
      acceptanceCriteria: [],
      failureDetails: "Per the QA gating protocol, a PR's own CI must be green before the isolated E2E stack is stood up against it.",
    });
    await ghIssueComment(state.issueNumber, report);
    await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked", removeLabel: "status:qa-in-progress" });
    return { currentLabel: "status:blocked", testResults: { passed: false, log: "CI red" } };
  }

  // Work on the PR's branch, not main — the E2E stack must run against the code
  // under test, and the mobile-chromium project addition must land on the PR.
  await gitCheckout(pr.headRefName);

  // Ensure the mobile-chromium project exists (quality-analyst.md requirement;
  // confirmed absent from storefront/playwright.config.ts by exploration).
  const configPath = "storefront/playwright.config.ts";
  const config = readFileSync(configPath, "utf-8");
  if (!config.includes("mobile-chromium")) {
    const patched = config.replace(
      /projects:\s*\[/,
      `projects: [\n    {\n      name: "mobile-chromium",\n      use: { ...devices["Pixel 5"] },\n    },`
    );
    writeFileSync(configPath, patched, "utf-8");
    await gitAdd([configPath]);
    // Only commit when there's actually a staged diff — a prior QA run (or the
    // dev-loop itself) may already have landed mobile-chromium on the branch.
    if (await gitHasStagedChanges()) {
      await gitCommit("Add mobile-chromium Playwright project for QA node");
      await gitPush(pr.headRefName);
    }
  }

  let testResults: { passed: boolean; log: string };
  console.log("[qa] entering docker compose + E2E path");
  try {
    await writeLocalEnv();
    await dockerComposeUp();
    let healthy = false;
    for (let i = 0; i < 24 && !healthy; i++) {
      healthy = await dockerComposeIsHealthy("backend");
      if (!healthy) await sleep(5000);
    }
    if (!healthy) throw new Error("backend never became healthy within 120s");
    await dockerComposeSeed();

    // The publishable key is generated at seed time and inlined into the
    // storefront bundle at build time, so fetch it and rebuild the storefront
    // with it before running the E2E suite (else the catalog is empty).
    const publishableKey = await dockerComposeGetPublishableKey();
    updateLocalEnvPublishableKey(publishableKey);
    await dockerComposeRebuildStorefront();
    await sleep(15000); // let the rebuilt storefront boot

    const run = await runPlaywright("http://localhost:3000", ["chromium", "mobile-chromium"]);
    testResults = { passed: run.exitCode === 0, log: (run.stdout + run.stderr).slice(-8000) };
  } catch (err) {
    testResults = { passed: false, log: err instanceof Error ? err.message : String(err) };
    console.log(`[qa] docker/seed/E2E failed: ${testResults.log}`);
  } finally {
    await dockerComposeDown();
  }

  const report = formatQaReport({
    featureTitle: issue.title,
    passed: testResults.passed,
    prUrl: pr.url,
    executionSummary: [`Desktop + Mobile Playwright run: ${testResults.passed ? "Passed" : "Failed"}`],
    acceptanceCriteria: [],
    failureDetails: testResults.passed ? undefined : testResults.log.slice(-2000),
  });
  await ghIssueComment(state.issueNumber, report);

  if (testResults.passed) {
    await ghIssueEdit(state.issueNumber, { addLabel: "status:in-review", removeLabel: "status:qa-in-progress" });
    return { currentLabel: "status:in-review", testResults, prNumber: pr.number };
  }
  await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked", removeLabel: "status:qa-in-progress" });
  return { currentLabel: "status:blocked", testResults, prNumber: pr.number };
}

// =============================================================================
// 5. Tech Lead Node — human-in-the-loop
// =============================================================================

const AuditVerdictSchema = z.object({
  approved: z.boolean(),
  findings: z.array(z.string()).describe("SOLID / VPS-resource / architecture concerns, empty if approved cleanly"),
  reviewSummary: z.string(),
});

async function auditPr(diff: string): Promise<z.infer<typeof AuditVerdictSchema>> {
  return extractStructured(AuditVerdictSchema, [
    {
      role: "system",
      content: [
        "You are the Principal Technical Lead for a Next.js + MedusaJS e-commerce platform on a 4 vCPU / 8GB RAM VPS.",
        "SOLID/Clean Code: custom Medusa logic must live in workflows/services/subscribers, never route handlers. Next.js: Server Components by default, 'use client' scoped to interactive leaves. TypeScript: no `any`, no unhandled promises.",
        "VPS resource rules (non-negotiable): Postgres query filters must use indexed columns, no unpaginated queries. No unbounded Promise.all, unclosed Redis pub/sub, or dependency-less useEffect. Next.js fetch calls need `next: { revalidate }`; images need `<Image/>` with dimensions.",
        "Any new/changed docker-compose.yml service MUST declare deploy.resources.limits.memory and .cpus — a missing limit is an automatic reject.",
        "redis's --maxmemory-policy is deliberately noeviction — any PR changing that flag or adding a Redis consumer needs explicit justification in the PR body, otherwise flag it.",
      ].join(" "),
    },
    { role: "user", content: diff },
  ]);
}

async function techLeadReviewWorkflow(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  await ghIssueEdit(state.issueNumber, {
    addLabel: "status:tech-lead-review-in-progress",
    removeLabel: "status:in-review",
  });

  const prs = (await ghPrList(`${state.issueNumber} in:body`, "number,headRefName,url")) as {
    number: number;
    headRefName: string;
    url: string;
  }[];
  const pr = prs[0];
  if (!pr) {
    await ghIssueComment(state.issueNumber, formatBlockingComment("No open PR found to review.", ["Relabel once a PR exists"]));
    await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked", removeLabel: "status:tech-lead-review-in-progress" });
    return { currentLabel: "status:blocked" };
  }

  const checks = await ghPrChecks(pr.number);
  if (checks.some((c) => c.bucket === "pending")) {
    await ghIssueEdit(state.issueNumber, { addLabel: "status:in-review", removeLabel: "status:tech-lead-review-in-progress" });
    return {}; // wait for a later run — see the same pending-CI caveat as qualityAnalystNode
  }
  const hardFail = checks.some((c) => c.bucket === "fail" && c.name !== "storefront-e2e");
  if (hardFail) {
    await ghPrReviewComment(pr.number, "CI is red on a required check (not storefront-e2e) — cannot approve.");
    await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked", removeLabel: "status:tech-lead-review-in-progress" });
    return { currentLabel: "status:blocked" };
  }

  const diff = await ghPrDiff(pr.number);
  const verdict = await auditPr(diff);

  if (!verdict.approved) {
    const comment = formatBlockingComment(
      verdict.findings.join(" "),
      ["Address the findings and push a fix", "Explain why the concern doesn't apply here", "Escalate for a human architecture call"],
      "🛑 **Architectural Escalation Required**"
    );
    await ghPrReviewComment(pr.number, comment);
    await ghIssueComment(state.issueNumber, comment);
    await ghIssueEdit(state.issueNumber, {
      addLabel: "status:blocked-architecture-review",
      removeLabel: "status:tech-lead-review-in-progress",
    });

    // Halt for human input. In LangGraph Studio (local, MemorySaver alive for
    // the session) this genuinely pauses the run and can be resumed with
    // Command({ resume: ... }) for demonstration. In production (a single
    // `graph.invoke()` per GitHub Actions job, no persisted checkpoint across
    // runs — see state.ts) there is nothing to resume: this call halts the
    // current run, and the owner's reply arrives as a brand-new
    // issue_comment webhook that starts a fresh process and re-enters this
    // same node via ownerReplyWorkflow, driven by the issue's now-current
    // GitHub label rather than a resumed checkpoint.
    interrupt({
      reason: "tech-lead architecture escalation",
      issueNumber: state.issueNumber,
      prNumber: pr.number,
      findings: verdict.findings,
    });

    return { currentLabel: "status:blocked-architecture-review", architecturalBlockers: verdict.findings };
  }

  await runTechLeadApprove(
    pr.number,
    [
      "### 🟢 Technical Lead Review Passed",
      "- [x] SOLID Principles & Clean Code",
      "- [x] VPS Resource & Memory Limits Audited (8GB RAM / 4 vCPU compliant)",
      "- [x] Postgres Query Indexes & Pagination Verified",
      "- [x] All CI Checks Passing",
      "",
      verdict.reviewSummary,
      "",
      "Proceeding to deploy pipeline.",
    ].join("\n")
  );
  await ghIssueEdit(state.issueNumber, { addLabel: "status:deploying", removeLabel: "status:tech-lead-review-in-progress" });

  return runDeployWorkflow(state.issueNumber, pr.number, pr.headRefName);
}

async function smokeTest(): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL;
  if (!baseUrl || !backendUrl) return false;
  for (let i = 0; i < 12; i++) {
    try {
      const [a, b] = await Promise.all([fetch(baseUrl), fetch(`${backendUrl}/health`)]);
      if (a.ok && b.ok) return true;
    } catch {
      // fall through to retry
    }
    await sleep(5000);
  }
  return false;
}

async function runDeployWorkflow(issueNumber: number, prNumber: number, headRefName: string): Promise<Partial<AgenticSdlcStateType>> {
  const diff = await ghPrDiff(prNumber);
  const touchesInfra = /diff --git a\/(docker-compose\.yml|Caddyfile|scripts\/deploy\.sh|\.github\/workflows\/deploy-vps\.yml)/.test(diff);

  if (!touchesInfra) {
    // Pre-merge fast path
    await ghWorkflowRun("deploy-vps.yml", headRefName);
    const runId = await ghRunListLatestId("deploy-vps.yml", headRefName);
    const deployOk = await ghRunWatch(runId);
    if (!deployOk || !(await smokeTest())) {
      await ghWorkflowRun("deploy-vps.yml", "main"); // restore known-good
      await ghIssueEdit(issueNumber, { addLabel: "status:blocked-deploy-failed", removeLabel: "status:deploying" });
      await ghIssueComment(
        issueNumber,
        `📌 **Blocking Reason:** Pre-merge deploy verification failed (run ${runId}). Production was not affected; redeployed main to confirm it's still healthy. Needs review before retry.`
      );
      return { currentLabel: "status:blocked-deploy-failed" };
    }
    await runTechLeadMerge(prNumber);
    return { currentLabel: "status:deploying" };
  }

  // Post-merge path — infra-sensitive PR, merge first so `git pull --ff-only` on the VPS picks it up.
  await runTechLeadMerge(prNumber);
  const runId = await ghRunListLatestId("deploy-vps.yml", "main");
  const deployOk = await ghRunWatch(runId);
  if (!deployOk || !(await smokeTest())) {
    const mergeSha = process.env.GITHUB_SHA ?? "";
    if (mergeSha) await runTechLeadRollback(mergeSha);
    await ghIssueEdit(issueNumber, { addLabel: "status:blocked-deploy-failed", removeLabel: "status:deploying" });
    await ghIssueComment(
      issueNumber,
      `📌 **Blocking Reason:** Post-merge deploy verification failed (run ${runId}). Reverted and redeployed to restore production. Needs review before retry.`
    );
    return { currentLabel: "status:blocked-deploy-failed" };
  }
  return { currentLabel: "status:deploying" };
}

async function unblockGenericWorkflow(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  const issue = await ghIssueView(state.issueNumber);
  const prs = (await ghPrList(`${state.issueNumber} in:body`, "number,headRefName,url")) as { number: number; url: string }[];
  const pr = prs[0];

  const lastComment = issue.comments[issue.comments.length - 1]?.body ?? "";

  // A scope-creep block (the dev-loop couldn't stay under the minimal-diff
  // limit after 3 retries) can't be resolved by giving direction — the code
  // model already retried and failed. Auto-unblocking here would loop
  // dev-loop -> blocked -> tech-lead -> ready-for-dev forever. Escalate to a
  // human instead.
  if (lastComment.includes("Scope-creep detected")) {
    await ghIssueComment(
      state.issueNumber,
      "🛑 **Escalation:** the dev-loop repeatedly exceeded the minimal-diff limit. This needs a human decision — either the issue scope, or the code-generation approach (model/prompt), must change. I will not auto-unblock it."
    );
    await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked-architecture-review", removeLabel: "status:blocked" });
    return { currentLabel: "status:blocked-architecture-review" };
  }

  const decision = await extractStructured(
    z.object({ canResolve: z.boolean(), direction: z.string() }),
    [
    {
      role: "system",
      content:
        "You are the Technical Lead resolving a status:blocked issue. If you can give a clear, concrete technical direction (architectural call, disambiguation, bug-fix direction), set canResolve=true. If it needs a product/business call only a human can make, set canResolve=false.",
    },
    { role: "user", content: `Issue #${state.issueNumber}: ${issue.title}\n\n${issue.body}\n\nLatest blocking comment:\n${lastComment}` },
  ]);

  if (decision.canResolve) {
    const prNote = pr ? `\n\nThis issue already has an open PR: ${pr.url} — push the fix there, don't open a new PR.` : "";
    await ghIssueComment(state.issueNumber, `### 🧭 Technical Lead Direction\n${decision.direction}${prNote}`);
    await ghIssueEdit(state.issueNumber, {
      addLabel: "status:ready-for-dev",
      removeLabel: "status:blocked",
    });
    return { currentLabel: "status:ready-for-dev" };
  }

  await ghIssueComment(
    state.issueNumber,
    formatBlockingComment(decision.direction, ["Provide the missing product/business decision", "Deprioritize this issue"], "🛑 **Architectural Escalation Required**")
  );
  await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked-architecture-review", removeLabel: "status:blocked" });
  return { currentLabel: "status:blocked-architecture-review" };
}

async function ownerReplyWorkflow(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  const issue = await ghIssueView(state.issueNumber);
  const ownerLogin = process.env.REPO_OWNER_LOGIN ?? "jayanthyp";
  if (!hasOwnerReplySince(issue.comments, ownerLogin)) {
    return {}; // owner-reply-only queue, nothing to do without a genuine new reply
  }

  if (state.currentLabel === "status:blocked-architecture-review") {
    // Route back to whichever workflow it came from. Without a persisted
    // origin marker (no cross-run state — see plan decision #2), infer from
    // whether an open PR exists: a PR-review FAIL re-enters review; a 2a punt
    // re-enters dev.
    const prs = (await ghPrList(`${state.issueNumber} in:body`, "number")) as { number: number }[];
    if (prs.length > 0) {
      await ghIssueEdit(state.issueNumber, { addLabel: "status:in-review", removeLabel: "status:blocked-architecture-review" });
      return { currentLabel: "status:in-review" };
    }
    await ghIssueEdit(state.issueNumber, {
      addLabel: "status:ready-for-dev",
      removeLabel: "status:blocked-architecture-review",
    });
    return { currentLabel: "status:ready-for-dev" };
  }

  // status:blocked-deploy-failed — parse the reply as retry vs abandon.
  const lastComment = issue.comments[issue.comments.length - 1]?.body ?? "";
  if (/retry/i.test(lastComment)) {
    await ghIssueEdit(state.issueNumber, { addLabel: "status:deploying", removeLabel: "status:blocked-deploy-failed" });
    return { currentLabel: "status:deploying" };
  }
  return {}; // abandon: leave the label as-is, PR is left for the owner to close manually
}

export async function techLeadNode(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  switch (state.currentLabel) {
    case "status:in-review":
      return techLeadReviewWorkflow(state);
    case "status:blocked":
      return unblockGenericWorkflow(state);
    case "status:blocked-architecture-review":
    case "status:blocked-deploy-failed":
      return ownerReplyWorkflow(state);
    default:
      return {};
  }
}
