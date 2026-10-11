/**
 * Stage 6b — Playwright E2E (the old quality-analyst role), after Jev has
 * passed the PR. Zero-LLM: stands up the isolated docker-compose stack on the
 * PR branch and runs the baseline smoke spec plus every spec the PR adds or
 * changes. Pass → Ship. A failure, or a UI change shipped with no spec,
 * hands back to the build (bounded by MAX_QA_ROUNDS) — and the fix then
 * goes back through Jev, since the head SHA changed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { LABEL, MAX_QA_ROUNDS } from "../config.js";
import { E2E_SPEC_RE } from "../edits.js";
import { marker } from "../markers.js";
import type { AgenticSdlcStateType, StateUpdate, TestResults } from "../state.js";
import {
  dockerComposeDown,
  dockerComposeGetPublishableKey,
  dockerComposeIsHealthy,
  dockerComposeLogs,
  dockerComposeRebuildStorefront,
  dockerComposeSeed,
  dockerComposeUp,
  findOpenPr,
  formatQaReport,
  ghIssueComment,
  ghIssueView,
  ghPrChecks,
  ghPrFiles,
  ghPrHeadSha,
  gitCheckout,
  gitFetchBranch,
  relabel,
  runPlaywright,
} from "../tools.js";
import { block } from "./common.js";

/** Always run: the "does the app build, render and sell" floor, even when the PR has no spec of its own. */
const BASELINE_SPECS = ["tests/e2e/smoke.spec.ts"];

export interface QaVerdictMarker {
  sha: string;
  pass: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Throwaway .env for the ephemeral stack (the real one is gitignored and absent in CI). Fixed test values, no secrets. */
function writeLocalEnv(): void {
  writeFileSync(
    ".env",
    [
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
    ].join("\n"),
    "utf-8"
  );
}

function setLocalEnvPublishableKey(key: string): void {
  const env = readFileSync(".env", "utf-8");
  writeFileSync(".env", env.replace(/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=.*$/m, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${key}`), "utf-8");
}

async function waitHealthy(service: string): Promise<void> {
  for (let i = 0; i < 24; i++) {
    if (await dockerComposeIsHealthy(service)) return;
    await sleep(5000);
  }
  throw new Error(`${service} never became healthy within 120s`);
}

/** Bring-up → seed → rebuild storefront with the seeded key → Playwright → teardown (always). */
async function runE2e(specs: string[]): Promise<TestResults> {
  try {
    writeLocalEnv();
    await dockerComposeUp();
    await waitHealthy("backend");
    await dockerComposeSeed();
    // The publishable key is created by the seed and inlined into the storefront at build time.
    const key = await dockerComposeGetPublishableKey();
    setLocalEnvPublishableKey(key);
    await dockerComposeRebuildStorefront();
    await waitHealthy("storefront");
    try {
      const res = await fetch("http://localhost:9000/store/products?limit=3", { headers: { "x-publishable-api-key": key } });
      console.log(`[e2e] backend /store/products: ${res.status} ${(await res.text()).slice(0, 300)}`);
    } catch (e) {
      console.log(`[e2e] backend probe failed: ${e}`);
    }
    console.log(`[e2e] storefront logs (tail):\n${await dockerComposeLogs("storefront", 80)}`);
    const run = await runPlaywright("http://localhost:3000", ["chromium"], specs);
    console.log(`[e2e] Playwright exit ${run.exitCode}:\n${run.stdout}\n${run.stderr}`);
    return { passed: run.exitCode === 0, log: (run.stdout + run.stderr).slice(-8000) };
  } catch (err) {
    return { passed: false, log: err instanceof Error ? err.message : String(err) };
  } finally {
    await dockerComposeDown();
  }
}

export async function e2eNode(state: AgenticSdlcStateType): Promise<StateUpdate> {
  const n = state.issueNumber;
  const issue = await ghIssueView(n);
  const qaAttemptCount = state.qaAttemptCount + 1;
  const pr = await findOpenPr(n);
  if (!pr) {
    await block(n, state.currentLabel, LABEL.blocked, "No open PR found for this issue — nothing to run E2E against.", ["A PR was expected but never opened", "The label was set in error"]);
    return { currentLabel: LABEL.blocked };
  }
  await relabel(n, state.currentLabel, LABEL.qaInProgress);

  // Gate on the PR's own CI when it has any. A PR opened with GITHUB_TOKEN
  // triggers no workflows, so "no checks" is normal; unit tests already ran
  // in the build stage of this same run.
  let checks = await ghPrChecks(pr.number);
  for (let waited = 0; waited < 5 * 60_000 && checks.some((c) => c.bucket === "pending"); waited += 15_000) {
    await sleep(15_000);
    checks = await ghPrChecks(pr.number);
  }
  if (checks.some((c) => c.bucket === "pending")) {
    await relabel(n, LABEL.qaInProgress, LABEL.readyForQa); // CI completion re-fires the workflow
    return {};
  }
  const red = checks.filter((c) => c.bucket === "fail" && c.name !== "storefront-e2e");
  if (red.length) {
    await ghIssueComment(n, formatQaReport({ featureTitle: issue.title, passed: false, prUrl: pr.url, executionSummary: [`PR CI is red (${red.map((c) => c.name).join(", ")}) — E2E not attempted`], acceptanceCriteria: [] }));
    await relabel(n, LABEL.qaInProgress, LABEL.blocked);
    return { currentLabel: LABEL.blocked, testResults: { passed: false, log: "CI red" } };
  }

  const headSha = await ghPrHeadSha(pr.number);
  await gitFetchBranch(pr.headRefName);
  await gitCheckout(pr.headRefName, { create: true, startPoint: `origin/${pr.headRefName}` });

  const changed = await ghPrFiles(pr.number);
  const specDelta = changed.filter((p) => E2E_SPEC_RE.test(p)).map((p) => p.replace(/^storefront\//, ""));
  const uiChanged = changed.some((p) => p.startsWith("storefront/") && !p.startsWith("storefront/tests/"));
  const baseline = BASELINE_SPECS.filter((p) => {
    try {
      readFileSync(`storefront/${p}`);
      return true;
    } catch {
      return false;
    }
  });
  const specs = [...new Set([...baseline, ...specDelta])];
  console.log(`[e2e] PR #${pr.number}: running [${specs.join(", ") || "nothing"}]`);
  const testResults: TestResults = specs.length ? await runE2e(specs) : { passed: true, log: "no E2E specs on this branch" };

  const needsSpec = testResults.passed && uiChanged && specDelta.length === 0;
  const pass = testResults.passed && !needsSpec;
  await ghIssueComment(
    n,
    `${formatQaReport({
      featureTitle: issue.title,
      passed: testResults.passed,
      prUrl: pr.url,
      executionSummary: [`Change-scoped Playwright run (${specs.join(", ") || "none"}) on ${headSha.slice(0, 7)}: ${testResults.passed ? "Passed" : "Failed"}`],
      acceptanceCriteria: [],
      failureDetails: testResults.passed ? undefined : testResults.log.slice(-2000),
    })}\n\n${marker("qa-verdict", { sha: headSha, pass } satisfies QaVerdictMarker)}`
  );

  if (pass) {
    await relabel(n, LABEL.qaInProgress, LABEL.readyToShip);
    return { currentLabel: LABEL.readyToShip, testResults, prNumber: pr.number, qaAttemptCount };
  }
  if (qaAttemptCount > MAX_QA_ROUNDS) {
    await relabel(n, LABEL.qaInProgress, LABEL.blocked);
    return { currentLabel: LABEL.blocked, testResults, prNumber: pr.number, qaAttemptCount };
  }
  if (needsSpec) {
    await ghIssueComment(n, "🧪 Baseline smoke passed, but this PR changes storefront UI without adding or changing an E2E spec. Handing back to author one.");
  }
  await relabel(n, LABEL.qaInProgress, LABEL.readyForDev);
  return {
    currentLabel: LABEL.readyForDev,
    testResults,
    prNumber: pr.number,
    qaAttemptCount,
    qaHandoffAuthorSpec: needsSpec,
    qaHandoffMessage: needsSpec
      ? "This UI change has no E2E coverage: author a NEW Playwright spec under storefront/tests/e2e/ that exercises it."
      : "A change-scoped E2E test failed. Fix the underlying code (or the test, if the test itself is wrong) — the failure log shows what broke.",
  };
}
