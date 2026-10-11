/**
 * Stage 7 — Merge & deploy: agent-skills' shipping-and-launch protocol,
 * mapped onto checks this pipeline can actually prove, then the existing
 * gated deploy (CLAUDE.md's tech-lead exception), then a claude-mem update
 * so future issues know what shipped.
 *
 * Pre-launch checklist → gates (all pinned to the PR's current head SHA):
 *   code quality   — Jev passed the locked spec; unit tests (build stage); E2E passed; every CI check green
 *   security       — Jev's no-secrets / no-weakened-tests checks (part of its pass)
 *   infrastructure — health endpoints answer after the deploy (smoke test)
 *   rollback plan  — decided before deploying: pre-merge deploys redeploy main
 *                    on failure; infra-sensitive PRs merge first and revert
 *                    the merge commit on failure
 */
import { LABEL } from "../config.js";
import { latestMarker } from "../markers.js";
import { rememberEvent } from "../memory.js";
import type { AgenticSdlcStateType, StateUpdate } from "../state.js";
import {
  findOpenPr,
  ghIssueComment,
  ghIssueView,
  ghPrChecks,
  ghPrDiff,
  ghPrHeadSha,
  ghPrMergeCommit,
  ghRunListLatestIdOrNull,
  ghRunWaitForNewId,
  ghRunWatch,
  ghWorkflowRun,
  ghWorkflowRunAndGetId,
  runTechLeadApprove,
  relabel,
  runTechLeadMerge,
  runTechLeadRollback,
} from "../tools.js";
import { block } from "./common.js";
import type { QaVerdictMarker } from "./e2e.js";
import type { JevVerdictMarker } from "./review.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Infra-sensitive diffs merge first so the VPS's `git pull --ff-only` picks them up. */
const INFRA_RE = /diff --git a\/(docker-compose\.yml|Caddyfile|scripts\/deploy\.sh|\.github\/workflows\/deploy-vps\.yml)/;

/**
 * Probes the storefront's /api/health (the root redirects forever for a
 * cookie-less fetch — see middleware.ts) and the backend's /health. SMOKE_*,
 * not NEXT_PUBLIC_*: unit tests run as children of this process and assert
 * the localhost fallback of NEXT_PUBLIC_BASE_URL.
 */
async function smokeTest(): Promise<boolean> {
  const baseUrl = process.env.SMOKE_BASE_URL;
  const backendUrl = process.env.SMOKE_MEDUSA_BACKEND_URL;
  if (!baseUrl || !backendUrl) return false;
  for (let i = 0; i < 12; i++) {
    try {
      const [a, b] = await Promise.all([fetch(`${baseUrl}/api/health`), fetch(`${backendUrl}/health`)]);
      if (a.ok && b.ok) return true;
    } catch {
      // retry
    }
    await sleep(5000);
  }
  return false;
}

/** Deploys and merges; returns whether production ended up healthy with the change in. */
async function deployAndMerge(prNumber: number, headRefName: string, infra: boolean): Promise<{ ok: boolean; detail: string }> {
  if (!infra) {
    const runId = await ghWorkflowRunAndGetId("deploy-vps.yml", headRefName);
    if (!(await ghRunWatch(runId)) || !(await smokeTest())) {
      await ghWorkflowRun("deploy-vps.yml", "main"); // production back to known-good
      return { ok: false, detail: `Pre-merge deploy verification failed (run ${runId}). Production was redeployed from main and is unaffected.` };
    }
    await runTechLeadMerge(prNumber);
    return { ok: true, detail: `Deployed the branch (run ${runId}), smoke test passed, merged.` };
  }

  const beforeId = await ghRunListLatestIdOrNull("deploy-vps.yml", "main");
  await runTechLeadMerge(prNumber);
  const runId = await ghRunWaitForNewId("deploy-vps.yml", "main", beforeId);
  if (!(await ghRunWatch(runId)) || !(await smokeTest())) {
    // The PR's own merge commit — not GITHUB_SHA, which is whatever main
    // pointed at when this workflow was triggered.
    const mergeSha = await ghPrMergeCommit(prNumber);
    await runTechLeadRollback(mergeSha);
    return { ok: false, detail: `Post-merge deploy verification failed (run ${runId}). Reverted merge ${mergeSha.slice(0, 7)} and redeployed.` };
  }
  return { ok: true, detail: `Merged, deployed main (run ${runId}), smoke test passed.` };
}

export async function shipNode(state: AgenticSdlcStateType): Promise<StateUpdate> {
  const n = state.issueNumber;
  const issue = await ghIssueView(n);
  const pr = await findOpenPr(n);
  if (!pr) {
    await block(n, state.currentLabel, LABEL.blocked, "No open PR found to ship.", ["Relabel status:ready-for-dev to rebuild it"]);
    return { currentLabel: LABEL.blocked };
  }

  // Verdicts are pinned to a commit: anything pushed since must be re-reviewed.
  const headSha = await ghPrHeadSha(pr.number);
  const jev = latestMarker<JevVerdictMarker>(issue.comments, "jev-verdict");
  const qa = latestMarker<QaVerdictMarker>(issue.comments, "qa-verdict");
  if (!jev?.pass || jev.sha !== headSha) {
    await relabel(n, state.currentLabel, LABEL.inReview);
    return { currentLabel: LABEL.inReview };
  }
  if (!qa?.pass || qa.sha !== headSha) {
    await relabel(n, state.currentLabel, LABEL.readyForQa);
    return { currentLabel: LABEL.readyForQa };
  }

  await relabel(n, state.currentLabel, LABEL.deploying);
  let checks = await ghPrChecks(pr.number);
  for (let waited = 0; waited < 10 * 60_000 && checks.some((c) => c.bucket === "pending"); waited += 15_000) {
    await sleep(15_000);
    checks = await ghPrChecks(pr.number);
  }
  if (checks.some((c) => c.bucket === "pending")) {
    await relabel(n, LABEL.deploying, LABEL.readyToShip); // CI completion re-fires the workflow
    return {};
  }
  const red = checks.filter((c) => c.bucket === "fail");
  if (red.length) {
    await block(n, LABEL.deploying, LABEL.blocked, `CI is red on ${red.map((c) => c.name).join(", ")} — can't ship.`, ["Fix the failing check", "Confirm the check is flaky and re-run it"]);
    return { currentLabel: LABEL.blocked };
  }

  const infra = INFRA_RE.test(await ghPrDiff(pr.number));
  await runTechLeadApprove(
    pr.number,
    [
      "### 🚀 Ship — pre-launch checklist (agent-skills `shipping-and-launch`)",
      `**Code quality** — commit \`${headSha.slice(0, 7)}\``,
      `- [x] Jev review passed against the locked spec: ${jev.passed}/${jev.total} checks${jev.complexity === null ? "" : `, complexity ${jev.complexity}/4`}`,
      "- [x] Unit tests pass (medusa + storefront)",
      "- [x] Playwright E2E passed",
      `- [x] CI checks green (${checks.length})`,
      "**Security**",
      "- [x] Jev: no hardcoded secrets, no weakened tests, no unhandled async",
      "**Infrastructure & rollback plan**",
      infra
        ? "- Infra-sensitive: merge → deploy main → smoke test; on failure `git revert -m 1 <merge>` and redeploy"
        : "- Deploy the branch → smoke test → merge; on failure redeploy main (production untouched)",
    ].join("\n")
  );

  const result = await deployAndMerge(pr.number, pr.headRefName, infra);
  if (!result.ok) {
    await block(n, LABEL.deploying, LABEL.blockedDeploy, result.detail, ["Reply \"retry\" to ship again", "Investigate the deploy logs first"]);
    return { currentLabel: LABEL.blockedDeploy };
  }

  await ghIssueComment(n, `🚀 **Shipped.** ${result.detail}`);
  await rememberEvent({
    issueNumber: n,
    title: issue.title,
    kind: "ship",
    input: { issue: n, pr: pr.number, branch: pr.headRefName },
    output: { result: result.detail, jev, headSha },
    summary: `Shipped #${n} "${issue.title}" via PR #${pr.number}. ${result.detail}`,
  });
  return { currentLabel: LABEL.deploying, prNumber: pr.number };
}
