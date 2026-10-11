/**
 * Stages 4 + 5 — Coding with parallel subagents, unit tests, pull request.
 *
 * The orchestrator dispatches the locked spec's tasks (1-5) to subagents —
 * Sonnet, or Haiku for tasks the spec marks mechanical — in dependency
 * waves, all tasks of a wave concurrently. Each subagent runs under the
 * Ponytail (least code) and Caveman (terse notes) skills, may only edit the
 * files its task owns (enforced in the output schema), and returns
 * search/replace edits that are applied atomically per task.
 *
 * Then the deterministic gates: diff size, required tests present, the
 * reproduce-first check for bugs (the new test must FAIL with the fix
 * reverted), and the medusa + storefront unit suites. A failure goes to the
 * orchestrator's fix triage, which picks the tasks to re-run with precise
 * instructions — the same path Jev rejections and E2E failures re-enter
 * through. Success: commit, push, open (or update) the PR, hand to Jev.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { z } from "zod/v4";
import { LABEL, MAX_BUILD_ATTEMPTS, MAX_DIFF_LINES, REPO_OWNER_LOGIN, specDir } from "../config.js";
import { readE2eFailureContext, readFiles, readRepoContext, readSpecTemplateContext } from "../context.js";
import { E2E_SPEC_RE, TEST_FILE_RE, applyCodeChanges, discardChanges, isWorkflowOnlyChange, type CodeChange } from "../edits.js";
import { extractStructured } from "../llm.js";
import { isTrustedAuthor, latestMarker, readMarkers } from "../markers.js";
import { triageSystemPrompt, workerSystemPrompt } from "../prompts.js";
import { waves, type Spec, type SpecLock, type SpecTask } from "../spec.js";
import type { AgenticSdlcStateType, StateUpdate } from "../state.js";
import {
  findOpenPr,
  ghIssueView,
  ghPrComment,
  ghPrCreate,
  gitAdd,
  gitChangedPaths,
  gitCheckoutWorkBranch,
  gitCommit,
  gitDiffSummary,
  gitPush,
  gitRestoreFromHead,
  relabel,
  runNpmScript,
} from "../tools.js";
import { block, isBugIssue, loadLockedSpec, renderThread } from "./common.js";

type Task = SpecTask & { allowNewE2eSpec?: boolean };
interface PlannedRun {
  task: Task;
  fix: string | null;
}

/** QA's "UI change shipped without an E2E spec" hand-back — the only edit outside the spec's file list. */
const E2E_AUTHOR_TASK: Task = {
  id: "E2E",
  title: "Author the missing Playwright spec",
  domain: "e2e-tests",
  model: "sonnet",
  files: [],
  instructions:
    "Create ONE new Playwright spec under storefront/tests/e2e/ that exercises this PR's UI change. Reuse the existing fixtures, page objects and real getByTestId selectors; do not invent test ids. Do not modify any existing file — the change itself is already committed and correct.",
  dependsOn: [],
  allowNewE2eSpec: true,
};

const mayEdit = (task: Task, path: string) => task.files.includes(path) || (!!task.allowNewE2eSpec && E2E_SPEC_RE.test(path) && !existsSync(path));

const WorkerOutputSchema = z.object({
  changes: z.array(
    z.object({
      path: z.string(),
      search: z.string().describe('The exact existing snippet to replace, copied verbatim — or "" to create the file'),
      replace: z.string(),
    })
  ),
  notes: z.string().describe("Terse hand-off for the orchestrator: what you did, what you skipped, any risk"),
});

function workerSchemaFor(task: Task) {
  return WorkerOutputSchema.superRefine((out, ctx) => {
    if (out.changes.length === 0) ctx.addIssue({ code: "custom", path: ["changes"], message: "changes is empty — make the edits your task requires." });
    for (const c of out.changes) {
      if (!mayEdit(task, c.path)) {
        ctx.addIssue({ code: "custom", path: ["changes"], message: `${c.path} is not yours to edit. Your files: ${task.files.join(", ") || "one new storefront/tests/e2e/*.spec.ts"}.` });
      }
    }
  });
}

const TriageSchema = z.object({
  fixes: z.array(z.object({ taskId: z.string(), instructions: z.string() })).describe("Only the tasks that must re-run, each with precise fix instructions"),
});

async function runUnitTests(): Promise<{ passed: boolean; log: string }> {
  // Unit suites only: the integration suites need Postgres, which this runner
  // doesn't provision (test.yml covers them in CI).
  let log = "";
  for (const cwd of ["medusa", "storefront"] as const) {
    const r = await runNpmScript(cwd, "test:unit");
    log += `\n--- ${cwd}: npm run test:unit ---\n${r.stdout}\n${r.stderr}`;
    if (r.exitCode !== 0) return { passed: false, log };
  }
  return { passed: true, log };
}

/** Applies one subagent's edits all-or-nothing, so a bad edit never leaves its files half-changed. */
function applyAtomically(changes: CodeChange[], created: string[]): void {
  const before = new Map(changes.map((c) => [c.path, existsSync(c.path) ? readFileSync(c.path, "utf-8") : null]));
  const createdBefore = created.length;
  try {
    applyCodeChanges(changes, created);
  } catch (err) {
    for (const [p, content] of before) {
      if (content === null) rmSync(p, { force: true });
      else writeFileSync(p, content, "utf-8");
    }
    created.splice(createdBefore);
    throw err;
  }
}

/** Whether the bug's new test fails with the code fix reverted (proves it reproduces the bug). */
async function testReproducesBug(changed: string[], created: string[]): Promise<boolean> {
  const code = changed.filter((p) => !TEST_FILE_RE.test(p));
  const saved = new Map(code.map((p) => [p, readFileSync(p, "utf-8")]));
  for (const p of code) if (created.includes(p)) rmSync(p, { force: true });
  await gitRestoreFromHead(code.filter((p) => !created.includes(p)));
  try {
    return !(await runUnitTests()).passed;
  } finally {
    for (const [p, content] of saved) writeFileSync(p, content, "utf-8");
  }
}

function workerPrompt(n: number, task: Task, fix: string | null, spec: Spec, repoContext: string): string {
  const relevant = {
    objective: spec.objective,
    rootCause: spec.rootCause,
    dataTypes: spec.dataTypes,
    acceptanceCriteria: spec.acceptanceCriteria,
    errorHandling: spec.errorHandling,
    yourRequiredTests: spec.testing.requiredTests.filter((t) => task.files.includes(t.path)),
    codeStyle: spec.codeStyle,
    boundaries: spec.boundaries,
    ui: spec.ui,
  };
  return [
    `## Issue #${n} — your task ${task.id}: ${task.title} (domain: ${task.domain})`,
    task.instructions,
    fix ? `## Fix required this round\n${fix}` : "",
    task.allowNewE2eSpec ? "## Files\nCreate exactly one NEW file under storefront/tests/e2e/ (*.spec.ts). Modify nothing else." : `## Files you own — edit only these\n${task.files.map((f) => `- ${f}`).join("\n")}`,
    task.files.length ? `## Current content of your files\n${readFiles(task.files, 40_000)}` : "",
    `## Locked spec (the parts that concern you)\n${JSON.stringify(relevant, null, 2)}`,
    `## Repository\n${repoContext}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function buildNode(state: AgenticSdlcStateType): Promise<StateUpdate> {
  const n = state.issueNumber;
  const issue = await ghIssueView(n);
  await relabel(n, [state.currentLabel, LABEL.readyForDev, LABEL.readyForUiWork], LABEL.inProgress);

  const lock = state.specLock ?? latestMarker<SpecLock>(issue.comments, "spec-lock");
  if (!lock) {
    await block(n, LABEL.inProgress, LABEL.blocked, "Reached the build stage without a locked spec.", ["Relabel status:ready-for-dev to run Grill-me and Design first"]);
    return { currentLabel: LABEL.blocked };
  }
  await gitCheckoutWorkBranch(lock.branch);
  const loaded = await loadLockedSpec(n, lock);
  if ("error" in loaded) {
    await block(n, LABEL.inProgress, LABEL.blockedArchitecture, `The locked spec can't be used: ${loaded.error}`, [
      "Restore the spec files on the branch",
      "Delete the 📐 Spec locked comment and relabel status:ready-for-dev to re-run Grill-me and Design",
    ]);
    return { currentLabel: LABEL.blockedArchitecture };
  }
  const spec = loaded.spec;
  const isBug = isBugIssue(issue);
  const pr = await findOpenPr(n);
  const tasks: Task[] = spec.tasks;
  const repoContext = await readRepoContext(`${spec.title}\n${spec.objective}\n${spec.fileStructure.map((f) => f.path).join(" ")}`);

  // What sent the issue (back) here: Jev, E2E, or direction posted since the
  // spec was locked — tech-lead's 🧭 comments and the owner's own replies.
  const lockIdx = readMarkers(issue.comments, "spec-lock").at(-1)?.commentIndex ?? -1;
  const directions = issue.comments
    .slice(lockIdx + 1)
    .filter((c) => isTrustedAuthor(c.author.login) && (c.body.startsWith("### 🧭 Technical Lead Direction") || (c.author.login === REPO_OWNER_LOGIN && !c.body.includes("<!-- sdlc:"))))
    .slice(-3)
    .map((c) => c.body);
  const feedback = [
    state.jevFailures?.length ? `## Jev review rejected the PR on these checks\n${state.jevFailures.map((f) => `- ${f}`).join("\n")}` : "",
    state.qaHandoffMessage && !state.qaHandoffAuthorSpec ? `## QA hand-back\n${state.qaHandoffMessage}` : "",
    state.testResults && !state.testResults.passed ? readE2eFailureContext(state.testResults.log) : "",
    directions.length ? `## Direction since the spec was locked (follow it)\n${directions.join("\n\n---\n\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  /** No PR yet: every task runs. Otherwise this is a fix round on the existing PR. */
  const fresh = !pr;

  if (pr && !feedback && !state.qaHandoffAuthorSpec) {
    // E.g. a recovered run: nothing new to fix, so re-review what's on the PR.
    console.log(`[build] #${n}: PR #${pr.number} exists and there is no new feedback — handing back to review`);
    await relabel(n, LABEL.inProgress, LABEL.inReview);
    return { currentLabel: LABEL.inReview, prNumber: pr.number };
  }

  const triage = async (failure: string): Promise<PlannedRun[]> => {
    const ids = tasks.map((t) => t.id);
    const schema = TriageSchema.superRefine((t, ctx) => {
      if (t.fixes.length === 0) ctx.addIssue({ code: "custom", message: "fixes is empty — name at least one task to re-run." });
      for (const f of t.fixes) if (!ids.includes(f.taskId)) ctx.addIssue({ code: "custom", message: `unknown taskId "${f.taskId}" — use one of ${ids.join(", ")}.` });
    });
    const result = await extractStructured(schema, {
      role: "orchestrator",
      name: `triage #${n}`,
      system: triageSystemPrompt(),
      user: [
        `## Issue #${n}: ${spec.title}`,
        `## Spec tasks\n${tasks.map((t) => `- ${t.id} (${t.model}) ${t.title} — ${t.files.join(", ")}`).join("\n")}`,
        `## Acceptance criteria\n${spec.acceptanceCriteria.map((a) => `- ${a.id}: ${a.statement}`).join("\n")}`,
        `## Files changed on the branch\n${(await gitChangedPaths()).join("\n") || "(none uncommitted)"}`,
        `## Failure to fix\n${failure}`,
        `## Recent issue thread (owner / tech-lead direction wins)\n${renderThread(issue.comments.slice(-6), 8000)}`,
      ].join("\n\n"),
    });
    const byId = new Map(result.fixes.map((f) => [f.taskId, f.instructions]));
    return tasks.filter((t) => byId.has(t.id)).map((t) => ({ task: t, fix: byId.get(t.id) ?? null }));
  };

  let plan: PlannedRun[];
  if (state.qaHandoffAuthorSpec) plan = [{ task: E2E_AUTHOR_TASK, fix: `${state.qaHandoffMessage ?? ""}\n\n${await readSpecTemplateContext()}` }];
  else if (fresh) plan = tasks.map((task) => ({ task, fix: feedback || null }));
  else plan = await triage(feedback);

  const created: string[] = [];
  let lastFailure = "";
  let succeeded = false;

  for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS && !succeeded; attempt++) {
    console.log(`[build] #${n} attempt ${attempt}: ${plan.map((p) => p.task.id).join(", ")}`);
    const ids = new Set(plan.map((p) => p.task.id));
    const fixFor = new Map(plan.map((p) => [p.task.id, p.fix]));
    const grouped = waves({ tasks: plan.map((p) => ({ ...p.task, dependsOn: p.task.dependsOn.filter((d) => ids.has(d)) })) }) ?? [plan.map((p) => p.task)];
    const applyErrors = new Map<string, string>();

    for (const wave of grouped) {
      const outputs = await Promise.all(
        wave.map(async (task) => {
          const t = task as Task;
          try {
            const out = await extractStructured(workerSchemaFor(t), {
              role: t.model === "haiku" ? "workerLight" : "worker",
              name: `build #${n} ${t.id}`,
              system: workerSystemPrompt(),
              user: workerPrompt(n, t, fixFor.get(t.id) ?? null, spec, repoContext),
            });
            return { task: t, out };
          } catch (err) {
            return { task: t, error: err instanceof Error ? err.message : String(err) };
          }
        })
      );
      for (const o of outputs) {
        if ("error" in o) {
          applyErrors.set(o.task.id, o.error ?? "unknown error");
          continue;
        }
        console.log(`[build] #${n} ${o.task.id} notes: ${o.out.notes}`);
        try {
          applyAtomically(o.out.changes, created);
        } catch (err) {
          applyErrors.set(o.task.id, `${err instanceof Error ? err.message : String(err)}\n\nActual content now:\n${readFiles(o.task.files, 20_000)}`);
        }
      }
    }

    if (applyErrors.size > 0) {
      lastFailure = [...applyErrors].map(([id, e]) => `${id}: ${e}`).join("\n\n");
      plan = plan.filter((p) => applyErrors.has(p.task.id)).map((p) => ({ task: p.task, fix: `Your previous output could not be used:\n${applyErrors.get(p.task.id)}` }));
      continue;
    }

    const changed = await gitChangedPaths();
    const allTasks: Task[] = state.qaHandoffAuthorSpec ? [...tasks, E2E_AUTHOR_TASK] : tasks;
    const outOfScope = changed.filter((p) => !allTasks.some((t) => t.files.includes(p) || (t.allowNewE2eSpec && E2E_SPEC_RE.test(p))));
    const missingTests = spec.testing.requiredTests.filter((t) => !existsSync(t.path)).map((t) => t.path);
    const size = await gitDiffSummary();
    const workflowOnly = isWorkflowOnlyChange(spec.fileStructure.map((f) => f.path));

    let failure = "";
    if (changed.length === 0) failure = "No files changed — the re-run tasks must actually edit their files.";
    else if (outOfScope.length) failure = `Files changed outside the spec: ${outOfScope.join(", ")}. Revert them; only the spec's fileStructure may change.`;
    else if (size.lines > MAX_DIFF_LINES) failure = `The change is ${size.lines} lines across ${size.files} files — over the ${MAX_DIFF_LINES}-line ceiling. Cut it to the least code that meets the spec.`;
    else if (missingTests.length) failure = `Required tests from the spec are missing: ${missingTests.join(", ")}.`;
    else if (fresh && isBug && !workflowOnly && !(await testReproducesBug(changed, created))) {
      failure = "The reproduction test PASSES with the fix reverted, so it doesn't reproduce the bug. Rewrite it to assert the actual broken behaviour (real interaction for UI, the real config/service value for backend) so it fails on the unfixed code.";
    } else {
      const tests = await runUnitTests();
      if (tests.passed) succeeded = true;
      else failure = `Unit tests failed:\n${tests.log.slice(-6000)}`;
    }

    if (!succeeded) {
      lastFailure = failure;
      if (attempt < MAX_BUILD_ATTEMPTS) plan = await triage(failure);
    }
  }

  if (!succeeded) {
    await discardChanges(created);
    await block(
      n,
      LABEL.inProgress,
      LABEL.blocked,
      `The subagents could not satisfy the spec after ${MAX_BUILD_ATTEMPTS} attempts. Last failure:\n\`\`\`\n${lastFailure.slice(-2000)}\n\`\`\``,
      ["Give a more specific fix direction", "Confirm a flaky test can be skipped for now", "Close or deprioritize this issue"]
    );
    return { currentLabel: LABEL.blocked };
  }

  const changed = await gitChangedPaths();
  const reason = state.jevFailures?.length ? "Jev review" : state.qaHandoffAuthorSpec ? "missing E2E spec" : state.testResults && !state.testResults.passed ? "E2E failure" : "review feedback";
  await gitAdd(changed);
  await gitCommit((fresh ? `${isBug ? "fix" : "feat"}(#${n}): ${spec.title}` : `fix(#${n}): address ${reason}`).slice(0, 72));

  let prNumber: number;
  if (pr) {
    await gitPush(lock.branch);
    await ghPrComment(pr.number, `Pushed a fix round for ${reason} (tasks ${plan.map((p) => p.task.id).join(", ")}). Unit tests pass. Next: Jev re-review.`);
    prNumber = pr.number;
  } else {
    await gitPush(lock.branch, { setUpstream: true });
    const specLink = `https://github.com/jayanthyp/NextJSeCommerce/blob/${lock.branch}/${specDir(n)}/spec.md`;
    prNumber = await ghPrCreate(
      issue.title,
      [
        `Closes #${n}`,
        `## Summary\n${spec.objective}\n\n**Locked spec:** [spec.md](${specLink})`,
        `## Acceptance criteria\n${spec.acceptanceCriteria.map((a) => `- [ ] **${a.id}** ${a.statement}`).join("\n")}`,
        `## Built by parallel subagents\n| Task | Model | Files |\n| --- | --- | --- |\n${tasks.map((t) => `| ${t.id} ${t.title} | ${t.model} | ${t.files.map((f) => `\`${f}\``).join("<br>")} |`).join("\n")}`,
        `## Test plan\n- \`npm run test:unit\` (medusa + storefront) — passing\n- Next: Jev review against the locked spec → Playwright E2E → gated ship`,
      ].join("\n\n"),
      lock.branch
    );
  }

  await relabel(n, LABEL.inProgress, LABEL.inReview);
  return { currentLabel: LABEL.inReview, prNumber, jevFailures: null, testResults: null, qaHandoffMessage: null, qaHandoffAuthorSpec: false };
}
