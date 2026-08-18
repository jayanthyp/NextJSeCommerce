/**
 * Tool-first execution layer: typed wrappers around `gh`, `git`, `npm`,
 * `docker compose`, and the existing tech-lead wrapper scripts, all via
 * child_process with an argv array (never shell string interpolation, so
 * issue/PR content can never inject extra flags — the same discipline
 * scripts/tech-lead-*.sh already follow).
 *
 * Every node in nodes.ts goes through these instead of calling execFile
 * directly, and instead of asking an LLM to write bash — per the Tool-First
 * principle, the LLM is only ever invoked for reasoning (see nodes.ts),
 * never for shelling out.
 */
import { execFile as execFileCb, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const REPO = "jayanthyp/NextJSeCommerce";

/**
 * Runs a command via argv (no shell), returning stdout/stderr/exitCode
 * regardless of exit status — callers decide what a non-zero exit means
 * (e.g. `gh pr checks` exits non-zero when a check merely hasn't finished
 * yet, which is not an error condition for quality-analyst/tech-lead).
 */
async function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {}
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", reject); // spawn itself failed (e.g. binary not found)
    child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode: exitCode ?? -1 }));

    if (opts.input !== undefined) {
      child.stdin.write(opts.input);
    }
    child.stdin.end();
  });
}

/** Throws with stderr context if the command failed — for calls where a non-zero exit is always a real error. */
function assertOk(result: RunResult, context: string): RunResult {
  if (result.exitCode !== 0) {
    // Capture BOTH streams — a command may print the real error to stdout while
    // npm/CLI notices go to stderr (e.g. `npm run seed` failing with only a
    // version notice on stderr).
    const detail = [result.stderr, result.stdout].filter((s) => s && s.trim()).join("\n");
    throw new Error(`${context} failed (exit ${result.exitCode}):\n${detail}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// gh: issues
// ---------------------------------------------------------------------------

export interface GhIssue {
  number: number;
  title: string;
  body: string;
  labels: { name: string }[];
  comments: { author: { login: string }; body: string; createdAt: string }[];
  assignees: { login: string }[];
}

export async function ghIssueView(issueNumber: number): Promise<GhIssue> {
  const r = await run("gh", [
    "issue",
    "view",
    String(issueNumber),
    "--repo",
    REPO,
    "--json",
    "number,title,body,labels,comments,assignees",
  ]);
  assertOk(r, `gh issue view #${issueNumber}`);
  return JSON.parse(r.stdout) as GhIssue;
}

export async function ghIssueList(search: string, fields: string): Promise<unknown[]> {
  const r = await run("gh", ["issue", "list", "--repo", REPO, "--search", search, "--json", fields]);
  assertOk(r, `gh issue list --search "${search}"`);
  return JSON.parse(r.stdout) as unknown[];
}

export async function ghIssueEdit(
  issueNumber: number,
  opts: { addLabel?: string; removeLabel?: string; addAssignee?: string; removeAssignee?: string }
): Promise<void> {
  const args = ["issue", "edit", String(issueNumber), "--repo", REPO];
  if (opts.addLabel) args.push("--add-label", opts.addLabel);
  if (opts.removeLabel) args.push("--remove-label", opts.removeLabel);
  if (opts.addAssignee) args.push("--add-assignee", opts.addAssignee);
  if (opts.removeAssignee) args.push("--remove-assignee", opts.removeAssignee);
  assertOk(await run("gh", args), `gh issue edit #${issueNumber}`);
}

export async function ghIssueComment(issueNumber: number, body: string): Promise<void> {
  assertOk(
    await run("gh", ["issue", "comment", String(issueNumber), "--repo", REPO, "--body", body]),
    `gh issue comment #${issueNumber}`
  );
}

export async function ghIssueCreate(title: string, body: string, label: string): Promise<number> {
  const r = await run("gh", ["issue", "create", "--repo", REPO, "--title", title, "--body", body, "--label", label]);
  assertOk(r, "gh issue create");
  // gh prints the new issue URL; the trailing path segment is the number.
  const match = r.stdout.trim().match(/\/(\d+)\s*$/);
  if (!match) throw new Error(`Could not parse issue number from: ${r.stdout}`);
  return Number(match[1]);
}

// ---------------------------------------------------------------------------
// gh: pull requests / checks / runs
// ---------------------------------------------------------------------------

export async function ghPrList(search: string, fields: string, state: "open" | "all" = "open"): Promise<unknown[]> {
  const r = await run("gh", ["pr", "list", "--repo", REPO, "--search", search, "--state", state, "--json", fields]);
  assertOk(r, `gh pr list --search "${search}"`);
  return JSON.parse(r.stdout) as unknown[];
}

export async function ghPrDiff(prNumber: number): Promise<string> {
  const r = await run("gh", ["pr", "diff", String(prNumber), "--repo", REPO]);
  assertOk(r, `gh pr diff #${prNumber}`);
  return r.stdout;
}

/** Lists the file paths a PR changes (added/modified), for change-scoped QA. */
export async function ghPrFiles(prNumber: number): Promise<string[]> {
  const r = await run("gh", ["pr", "view", String(prNumber), "--repo", REPO, "--json", "files"]);
  assertOk(r, `gh pr view #${prNumber} --json files`);
  const parsed = JSON.parse(r.stdout) as { files: { path: string }[] };
  return parsed.files.map((f) => f.path);
}

export interface GhCheck {
  name: string;
  bucket: "pass" | "fail" | "pending" | "skipping" | "cancel";
}

/** Never throws on a non-zero exit — `gh pr checks` exits non-zero whenever any check isn't green, which callers must branch on, not treat as a tool failure. */
export async function ghPrChecks(prNumber: number): Promise<GhCheck[]> {
  const r = await run("gh", ["pr", "checks", String(prNumber), "--repo", REPO, "--json", "name,bucket"]);
  if (!r.stdout.trim()) return [];
  return JSON.parse(r.stdout) as GhCheck[];
}

export async function ghPrCreate(title: string, body: string, headBranch: string): Promise<number> {
  const r = await run("gh", [
    "pr",
    "create",
    "--repo",
    REPO,
    "--title",
    title,
    "--body",
    body,
    "--head",
    headBranch,
  ]);
  assertOk(r, "gh pr create");
  const match = r.stdout.trim().match(/\/(\d+)\s*$/);
  if (!match) throw new Error(`Could not parse PR number from: ${r.stdout}`);
  return Number(match[1]);
}

export async function ghPrComment(prNumber: number, body: string): Promise<void> {
  assertOk(await run("gh", ["pr", "comment", String(prNumber), "--repo", REPO, "--body", body]), `gh pr comment #${prNumber}`);
}

/** Closes a PR without merging it (e.g. its target issue was already resolved elsewhere) — never used to abandon unreviewed work silently, always paired with an explanatory comment. */
export async function ghPrClose(prNumber: number, comment: string): Promise<void> {
  assertOk(
    await run("gh", ["pr", "close", String(prNumber), "--repo", REPO, "--comment", comment]),
    `gh pr close #${prNumber}`
  );
}

/** Unapproved (non-tech-lead) review comment — never `--approve` from here; that's exclusively runTechLeadApprove below. */
export async function ghPrReviewComment(prNumber: number, body: string): Promise<void> {
  assertOk(
    await run("gh", ["pr", "review", String(prNumber), "--repo", REPO, "--comment", "--body", body]),
    `gh pr review --comment #${prNumber}`
  );
}

export async function ghRunViewLogFailed(runId: string): Promise<string> {
  const r = await run("gh", ["run", "view", runId, "--repo", REPO, "--log-failed"]);
  return r.stdout; // don't assertOk: a failed run's log-failed call legitimately has diagnostic content on stderr too
}

export async function ghRunRerunFailed(runId: string): Promise<void> {
  assertOk(await run("gh", ["run", "rerun", runId, "--repo", REPO, "--failed"]), `gh run rerun ${runId}`);
}

export async function ghRunWatch(runId: string): Promise<boolean> {
  // Poll to a terminal state rather than `gh run watch --exit-status`: a run
  // that's still queued (pending behind the deploy-vps concurrency group) makes
  // `gh run watch` exit non-zero immediately, which the deploy path misreads as
  // a failed deploy and rolls back. Poll `gh run view` until the run completes.
  for (let i = 0; i < 180; i++) {
    const r = await run("gh", ["run", "view", runId, "--repo", REPO, "--json", "status,conclusion"]);
    if (r.exitCode === 0 && r.stdout.trim()) {
      const parsed = JSON.parse(r.stdout) as { status: string; conclusion: string | null };
      if (parsed.status === "completed") {
        return parsed.conclusion === "success";
      }
    }
    await new Promise((res) => setTimeout(res, 10_000));
  }
  return false; // ~30 minutes without a terminal state
}

export async function ghWorkflowRun(workflow: string, ref: string): Promise<void> {
  assertOk(await run("gh", ["workflow", "run", workflow, "--repo", REPO, "--ref", ref]), `gh workflow run ${workflow}`);
}

export async function ghRunListLatestIdOrNull(workflow: string, branch: string): Promise<string | null> {
  const r = await run("gh", [
    "run",
    "list",
    "--repo",
    REPO,
    `--workflow=${workflow}`,
    "--branch",
    branch,
    "-L",
    "1",
    "--json",
    "databaseId",
  ]);
  if (r.exitCode === 0 && r.stdout.trim()) {
    const rows = JSON.parse(r.stdout) as { databaseId: number }[];
    const first = rows[0];
    if (first) return String(first.databaseId);
  }
  return null;
}

/**
 * Wait for a run whose id differs from `beforeId` to appear on `branch`.
 *
 * A freshly-dispatched `gh workflow run` (and likewise a push-triggered run
 * from `gh pr merge`) isn't immediately indexed by `gh run list`; for a beat it
 * still returns the *previous* run on that ref. Taking that stale id and
 * handing it to `ghRunWatch` is a real failure: the previous run is already
 * terminal (often "cancelled"), so the watch reports "failed" instantly and the
 * deploy path dispatches a rollback that then cancels the genuine queued run.
 * Diffing against `beforeId` (the latest id *before* the action) means we only
 * ever return a run that did not exist yet.
 */
export async function ghRunWaitForNewId(workflow: string, branch: string, beforeId: string | null): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = await ghRunListLatestIdOrNull(workflow, branch);
    if (id && id !== beforeId) return id;
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error(`No new run for workflow ${workflow} on branch ${branch} after ~60s`);
}

/** Dispatch `workflow` on `ref` and return the id of the NEW run it creates (never a stale prior one). */
export async function ghWorkflowRunAndGetId(workflow: string, ref: string): Promise<string> {
  const beforeId = await ghRunListLatestIdOrNull(workflow, ref);
  await ghWorkflowRun(workflow, ref);
  return ghRunWaitForNewId(workflow, ref, beforeId);
}

// ---------------------------------------------------------------------------
// git (never --force; the wrapper doesn't even accept the option)
// ---------------------------------------------------------------------------

export async function gitCheckout(branch: string, opts: { create?: boolean; startPoint?: string } = {}): Promise<void> {
  const args = ["checkout"];
  // -B (create-or-reset), not -b: on a genuinely fresh runner workspace a
  // same-named local branch can only exist from earlier in this same process
  // (e.g. a node revisited via an in-process graph chain), never from a prior
  // run — so there's nothing worth preserving to justify -b's hard failure.
  // This is a local branch-pointer reset, not the remote-history-rewriting
  // kind of force this file's "never --force" rule is about (that's git push).
  if (opts.create) args.push("-B");
  args.push(branch);
  if (opts.startPoint) args.push(opts.startPoint);
  assertOk(await run("git", args), `git checkout ${branch}`);
}

export async function gitAdd(paths: string[]): Promise<void> {
  assertOk(await run("git", ["add", ...paths]), "git add");
}

export async function gitCommit(message: string): Promise<void> {
  assertOk(await run("git", ["commit", "-m", message]), "git commit");
}

export async function gitPush(branch: string, opts: { setUpstream?: boolean } = {}): Promise<void> {
  const args = ["push"];
  if (opts.setUpstream) args.push("-u");
  args.push("origin", branch);
  assertOk(await run("git", args), `git push origin ${branch}`);
}

/** Lists tracked source files under the given paths (e.g. ["storefront/src", "medusa/src"]). */
export async function gitListFiles(paths: string[]): Promise<string[]> {
  const r = await run("git", ["ls-files", ...paths]);
  assertOk(r, "git ls-files");
  return r.stdout.split("\n").filter((line) => line.trim().length > 0);
}

/** Whether there are staged changes (for idempotent "commit only if changed" flows). */
export async function gitHasStagedChanges(): Promise<boolean> {
  const r = await run("git", ["diff", "--cached", "--quiet"]);
  return r.exitCode !== 0; // --quiet exits 1 when there are differences, 0 when clean
}

/** Working-tree diff size (tracked files) — used to reject scope-creep. */
export async function gitDiffSummary(): Promise<{ files: number; lines: number }> {
  const r = await run("git", ["diff", "--numstat"]);
  let files = 0;
  let lines = 0;
  for (const line of r.stdout.split("\n")) {
    const p = line.split("\t");
    if (p.length < 3) continue;
    const [added = "", removed = ""] = p;
    if (added === "-") continue;
    files += 1;
    lines += (parseInt(added, 10) || 0) + (parseInt(removed, 10) || 0);
  }
  // New (untracked) files — e.g. an E2E spec dev-loop just authored — aren't in
  // `git diff --numstat`. Count them separately so a file-creation edit isn't
  // misread as a no-op by devLoopNode's scope guard.
  const untracked = await run("git", ["ls-files", "--others", "--exclude-standard"]);
  for (const path of untracked.stdout.split("\n").map((s) => s.trim()).filter(Boolean)) {
    try {
      lines += readFileSync(path, "utf-8").split("\n").length;
      files += 1;
    } catch {
      // path is a directory or vanished mid-read — skip
    }
  }
  return { files, lines };
}

/** Discard tracked working-tree changes (so a retry starts from a clean tree). */
export async function gitDiscardChanges(): Promise<void> {
  await run("git", ["checkout", "--", "."]);
}

// ---------------------------------------------------------------------------
// tech-lead wrapper scripts (reused as-is, not reimplemented — see CLAUDE.md
// and the plan's decision #4)
// ---------------------------------------------------------------------------

function requireTechLeadToken(): string {
  const token = process.env.TECH_LEAD_GH_TOKEN;
  if (!token) {
    throw new Error(
      "TECH_LEAD_GH_TOKEN is not set — see CLAUDE.md's tech-lead bot identity setup / .env.example"
    );
  }
  return token;
}

export async function runTechLeadApprove(prNumber: number, reviewBody: string): Promise<void> {
  requireTechLeadToken();
  assertOk(
    await run("bash", ["scripts/tech-lead-approve.sh", String(prNumber)], { input: reviewBody }),
    `scripts/tech-lead-approve.sh ${prNumber}`
  );
}

export async function runTechLeadMerge(prNumber: number): Promise<void> {
  requireTechLeadToken();
  assertOk(await run("bash", ["scripts/tech-lead-merge.sh", String(prNumber)]), `scripts/tech-lead-merge.sh ${prNumber}`);
}

export async function runTechLeadRollback(mergeSha: string): Promise<void> {
  requireTechLeadToken();
  assertOk(
    await run("bash", ["scripts/tech-lead-rollback-revert.sh", mergeSha]),
    `scripts/tech-lead-rollback-revert.sh ${mergeSha}`
  );
}

// ---------------------------------------------------------------------------
// npm / build / test (medusa, storefront)
// ---------------------------------------------------------------------------

export async function runNpmScript(cwd: "medusa" | "storefront", script: string): Promise<RunResult> {
  // Not assertOk'd — devLoopNode needs the failure output to feed back to the LLM,
  // not just an exception.
  return run("npm", ["run", script], { cwd });
}

// ---------------------------------------------------------------------------
// Playwright (quality-analyst's zero-LLM native execution)
// ---------------------------------------------------------------------------

export async function runPlaywright(baseUrl: string, projects: string[], specs?: string[]): Promise<RunResult> {
  // `--project=<name>` (equals form), not `--project <name>`: Playwright's
  // `--project` flag collects every following non-flag argument, so the space
  // form swallows the spec paths appended below as extra "project" names and
  // fails with `Project(s) "tests/e2e/..." not found`.
  const args = ["playwright", "test", ...projects.flatMap((p) => [`--project=${p}`])];
  // Restrict to an explicit spec list (e.g. the QA node's baseline + change-
  // scoped delta) when given; otherwise Playwright runs the whole testDir.
  if (specs && specs.length > 0) args.push(...specs);
  return run("npx", args, {
    cwd: "storefront",
    env: { ...process.env, PLAYWRIGHT_BASE_URL: baseUrl },
  });
}

// ---------------------------------------------------------------------------
// docker compose (quality-analyst's isolated stack — default ports; the
// worktree + port-offset scheme in quality-analyst.md exists to avoid
// colliding with a human's locally-running stack, which doesn't apply on a
// fresh single-purpose GitHub-hosted runner)
// ---------------------------------------------------------------------------

const COMPOSE_ARGS = ["-f", "docker-compose.yml", "-f", "docker-compose.local.yml"];

export async function dockerComposeUp(): Promise<void> {
  assertOk(
    await run("docker", ["compose", ...COMPOSE_ARGS, "up", "-d", "--build"]),
    "docker compose up"
  );
}

export async function dockerComposeSeed(): Promise<void> {
  // Seed the COMPILED scripts (./src/scripts/*.js), not `npm run seed` — the
  // production image ships only the built `.medusa/server` tree, so the `.ts`
  // source referenced by the `seed` npm script doesn't exist in the container
  // (mirrors scripts/bootstrap.sh).
  //
  // Two scripts, in order: seed.js creates products + the publishable key but
  // only the EUROPE region (gb/de/dk/se/fr/es/it); add-global-regions.js adds
  // India/Australia/etc. The storefront's SELECTABLE_COUNTRY_CODES (issue #15)
  // restrict the country dropdown to India/Australia only, so without the
  // second script there is no "au" region and every /au/... URL 404s — leaving
  // the catalog empty and failing every E2E spec (root-caused on #33/#28, and
  // mirrored in .github/workflows/test.yml's seed steps).
  assertOk(
    await run("docker", ["compose", ...COMPOSE_ARGS, "exec", "-T", "backend", "npx", "medusa", "exec", "./src/scripts/seed.js"]),
    "docker compose exec backend npx medusa exec ./src/scripts/seed.js"
  );
  assertOk(
    await run("docker", ["compose", ...COMPOSE_ARGS, "exec", "-T", "backend", "npx", "medusa", "exec", "./src/scripts/add-global-regions.js"]),
    "docker compose exec backend npx medusa exec ./src/scripts/add-global-regions.js"
  );
}

export async function dockerComposeDown(): Promise<void> {
  // Best-effort: teardown must never itself throw and mask the real test
  // result — callers invoke this in a `finally` block.
  await run("docker", ["compose", ...COMPOSE_ARGS, "down", "-v"]);
}

export async function dockerComposeIsHealthy(service: string): Promise<boolean> {
  const r = await run("docker", ["compose", ...COMPOSE_ARGS, "ps", service, "--format", "{{.Status}}"]);
  return r.stdout.toLowerCase().includes("healthy");
}

/** Tail a service's logs — used by the QA node's diagnostic probe to surface runtime errors. */
export async function dockerComposeLogs(service: string, tail = 100): Promise<string> {
  const r = await run("docker", ["compose", ...COMPOSE_ARGS, "logs", "--tail", String(tail), service]);
  return `${r.stdout}\n${r.stderr}`.slice(-4000);
}

/** Reads the storefront's publishable API key (seeded into Postgres) — mirrors scripts/get-publishable-key.sh. */
export async function dockerComposeGetPublishableKey(): Promise<string> {
  const r = await run("docker", [
    "compose",
    ...COMPOSE_ARGS,
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "medusa",
    "-d",
    "medusa",
    "-tAc",
    "select token from api_key where type = 'publishable' and revoked_at is null order by created_at limit 1;",
  ]);
  if (r.exitCode !== 0 || !r.stdout.trim()) throw new Error(`publishable key not found: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

/** Rebuilds + restarts the storefront so the publishable key (inlined at build time) takes effect. */
export async function dockerComposeRebuildStorefront(): Promise<void> {
  assertOk(
    await run("docker", ["compose", ...COMPOSE_ARGS, "build", "--no-cache", "storefront"]),
    "docker compose build storefront"
  );
  assertOk(await run("docker", ["compose", ...COMPOSE_ARGS, "up", "-d", "storefront"]), "docker compose up storefront");
}

// ---------------------------------------------------------------------------
// Shared comment/report formatters (canonical schemas, defined once)
// ---------------------------------------------------------------------------

/** The 📌/🔘/✍️ blocking-comment schema, defined verbatim in dev-loop.md and reused as-is by quality-analyst.md and tech-lead.md. */
export function formatBlockingComment(reason: string, options: string[], header?: string): string {
  const optionLines = options.map((opt, i) => `🔘 **Option ${i + 1}:** ${opt}`).join("\n\n");
  const body = [
    `📌 **Blocking Reason:** ${reason}`,
    "",
    optionLines,
    "",
    "✍️ **Custom Direction:** Reply with any of the options above, or describe what you'd like instead.",
  ].join("\n");
  return header ? `${header}\n\n${body}` : body;
}

export interface QaReportInput {
  featureTitle: string;
  passed: boolean;
  prUrl: string;
  desktopScreenshotUrl?: string;
  mobileScreenshotUrl?: string;
  executionSummary: string[];
  acceptanceCriteria: { scenario: string; passed: boolean }[];
  failureDetails?: string;
}

/** quality-analyst.md's QA report template, ported verbatim. */
export function formatQaReport(input: QaReportInput): string {
  const status = input.passed ? "PASS 🟢" : "FAIL 🔴";
  const lines = [
    "### 🧪 QA Automated Test Report",
    "",
    `**Target Feature:** ${input.featureTitle}`,
    `**Test Status:** ${status}`,
    `**PR:** ${input.prUrl}`,
    "",
    "---",
    "",
    "#### 📱 Visual Verification Evidence",
    "",
    "| Desktop (1280x720, chromium) | Mobile (Pixel 5, mobile-chromium) |",
    "| :--- | :--- |",
    `| ${input.desktopScreenshotUrl ? `![Desktop](${input.desktopScreenshotUrl})` : "n/a"} | ${
      input.mobileScreenshotUrl ? `![Mobile](${input.mobileScreenshotUrl})` : "n/a"
    } |`,
    "",
    "---",
    "",
    "#### 📋 Execution Summary",
    ...input.executionSummary.map((s) => `- [x] ${s}`),
    "- **Acceptance Criteria Check:**",
    ...input.acceptanceCriteria.map((c, i) => `  - Scenario ${i + 1}: ${c.passed ? "Passed" : "Failed"} — ${c.scenario}`),
  ];
  if (!input.passed && input.failureDetails) {
    lines.push("", "---", "", "#### 🔍 Failure Details", input.failureDetails);
  }
  return lines.join("\n");
}
