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
  runTechLeadApprove,
  runTechLeadMerge,
  runTechLeadRollback,
  runNpmScript,
  runPlaywright,
  dockerComposeUp,
  dockerComposeDown,
  dockerComposeSeed,
  dockerComposeIsHealthy,
  formatBlockingComment,
  formatQaReport,
} from "./tools.js";

const MAX_DEV_LOOP_ATTEMPTS = 3;

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
 *                       ANTHROPIC_MODEL    = deepseek-v4-pro[1m]
 *
 * DeepSeek exposes an Anthropic-compatible Messages endpoint, so
 * `@langchain/anthropic` talks to it unchanged — only the base URL, model
 * name, and key change, all three together (an Anthropic key sent to the
 * DeepSeek endpoint, or vice-versa, fails auth).
 */
function getLlm(temperature = 0) {
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  return new ChatAnthropic({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
    temperature,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    ...(baseURL ? { clientOptions: { baseURL } } : {}),
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
  const res = await llm.invoke(messages as never);
  const toolCall = res.tool_calls?.[0];
  if (!toolCall) {
    throw new Error(
      `LLM emitted no tool call for structured extraction (content: ${JSON.stringify(res.content)?.slice(0, 300)})`
    );
  }
  return schema.parse(toolCall.args);
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
  changes: z.array(z.object({ path: z.string(), content: z.string() })),
  summary: z.string().describe("One-paragraph summary of what changed and why, for the PR body"),
});

async function runDevLoopTests(): Promise<{ passed: boolean; log: string }> {
  const steps: { cwd: "medusa" | "storefront"; script: string }[] = [
    { cwd: "medusa", script: "test:unit" },
    { cwd: "medusa", script: "test:integration:modules" },
    { cwd: "medusa", script: "test:integration:http" },
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
    mkdirSync(dirname(change.path), { recursive: true });
    writeFileSync(change.path, change.content, "utf-8");
  }
}

export async function devLoopNode(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  const issue = await ghIssueView(state.issueNumber);
  await ghIssueEdit(state.issueNumber, {
    addLabel: "status:in-progress",
    removeLabel: "status:ready-for-dev",
    addAssignee: "@me",
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
          "You are implementing a GitHub issue for a Medusa v2 + Next.js e-commerce monorepo. Follow existing conventions (Medusa module structure, 'use server' data functions, Playwright/Vitest patterns). Do not scope-creep beyond the issue. Return the exact file paths (relative to repo root, e.g. storefront/src/... or medusa/src/...) and full new file contents for every file you change.",
      },
      {
        role: "user",
        content: lastError
          ? `Previous attempt failed tests/build with this output:\n${lastError}\n\nFix the code accordingly. Original issue #${state.issueNumber}: ${issue.title}\n\n${issue.body}\n\nComments:\n${commentsText}`
          : `Issue #${state.issueNumber}: ${issue.title}\n\n${issue.body}\n\nComments:\n${commentsText}`,
      },
    ]);

    changes = result.changes;
    summary = result.summary;
    applyCodeChanges(changes);

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
      `Closes #${state.issueNumber}\n\n${summary}\n\n## Test plan\nnpm run test:unit && test:integration:modules && test:integration:http (medusa), npm run test:unit (storefront) — all passing.\n\ne2e not run locally — awaiting quality-analyst verification.`,
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
    await gitCommit("Add mobile-chromium Playwright project for QA node");
    await gitPush(pr.headRefName);
  }

  let testResults: { passed: boolean; log: string };
  try {
    await dockerComposeUp();
    let healthy = false;
    for (let i = 0; i < 24 && !healthy; i++) {
      healthy = await dockerComposeIsHealthy("backend");
      if (!healthy) await sleep(5000);
    }
    if (!healthy) throw new Error("backend never became healthy within 120s");
    await dockerComposeSeed();

    const run = await runPlaywright("http://localhost:3000", ["chromium", "mobile-chromium"]);
    testResults = { passed: run.exitCode === 0, log: (run.stdout + run.stderr).slice(-8000) };
  } catch (err) {
    testResults = { passed: false, log: err instanceof Error ? err.message : String(err) };
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
      removeAssignee: "@me",
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
      removeAssignee: "@me",
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
