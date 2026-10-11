/**
 * Stage 6 — Automated review by TypeSafe Jev (see jev.ts), run BEFORE the
 * Playwright stage: Jev answers in about a second for a fraction of a cent,
 * the E2E stack takes ~10 minutes, so a PR that misses its spec is bounced
 * before any E2E time is spent. Any later code change (E2E fix rounds)
 * re-enters here, because verdicts are pinned to the PR's head SHA.
 *
 * Order: the spec lock must still hold on the PR head → zero-cost
 * deterministic gates (no-op diff, files outside the spec, missing required
 * tests) → Jev's typed rubric. Pass → E2E. Fail → back to the subagents with
 * the failing checks, up to MAX_JEV_ROUNDS since the owner last commented,
 * then a human.
 */
import { JEV, LABEL, MAX_JEV_ROUNDS } from "../config.js";
import { E2E_SPEC_RE } from "../edits.js";
import {
  COMPLEXITY_QUESTION,
  JevConfigError,
  JevUnavailableError,
  buildJevState,
  buildRubric,
  decide,
  estimateTokens,
  filterDiff,
  jevEvaluate,
  type JevVerdict,
} from "../jev.js";
import { lastOwnerCommentIndex, latestMarker, marker, readMarkers } from "../markers.js";
import type { Spec, SpecLock } from "../spec.js";
import type { AgenticSdlcStateType, StateUpdate } from "../state.js";
import { findOpenPr, gitFetchBranch, ghIssueComment, ghIssueView, ghPrDiff, ghPrHeadSha, ghPrReviewComment, relabel } from "../tools.js";
import { block, loadLockedSpec } from "./common.js";

export interface JevVerdictMarker {
  sha: string;
  pass: boolean;
  passed: number;
  total: number;
  complexity: number | null;
}

/**
 * Deterministic no-op detector (zero LLM cost): an empty or whitespace-only
 * diff can't fix anything — the PR #120 failure mode.
 */
export function detectNoOpDiff(diff: string): string | null {
  const added: string[] = [];
  const removed: string[] = [];
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+") && !raw.startsWith("+++")) added.push(raw.slice(1));
    else if (raw.startsWith("-") && !raw.startsWith("---")) removed.push(raw.slice(1));
  }
  if (added.length === 0 && removed.length === 0) return "the diff is empty";
  const strip = (s: string) => s.replace(/\s+/g, "");
  return added.map(strip).join("") === removed.map(strip).join("") ? "only whitespace/line breaks changed" : null;
}

function verdictTable(v: JevVerdict): string {
  const icon = { pass: "🟢", fail: "🔴", uncertain: "🟡" } as const;
  const rows = v.items.map((i) => `| ${icon[i.status]} | ${i.label.replace(/\|/g, "\\|")} | ${i.passWhen} | ${i.pYes.toFixed(2)} |`);
  return [
    "| | Check | Want | P(yes) |",
    "| --- | --- | --- | --- |",
    ...rows,
    `| ${v.complexity.pass ? "🟢" : "🔴"} | Complexity score (0 minimal … 4 bloated) | ≤ ${v.complexity.max} | ${Number.isFinite(v.complexity.score) ? v.complexity.score.toFixed(2) : "n/a"} (confidence ${v.complexity.confidence.toFixed(2)}) |`,
  ].join("\n");
}

export async function jevReviewNode(state: AgenticSdlcStateType): Promise<StateUpdate> {
  const n = state.issueNumber;
  await relabel(n, state.currentLabel, LABEL.jevReview);
  const issue = await ghIssueView(n);

  const pr = await findOpenPr(n);
  if (!pr) {
    await block(n, LABEL.jevReview, LABEL.blocked, "No open PR found to review.", ["Relabel status:ready-for-dev to rebuild it"]);
    return { currentLabel: LABEL.blocked };
  }
  const lock = state.specLock ?? latestMarker<SpecLock>(issue.comments, "spec-lock");
  if (!lock) {
    await block(n, LABEL.jevReview, LABEL.blockedArchitecture, "This PR has no locked spec — it predates the spec-driven pipeline, so Jev has nothing to review it against.", [
      "Relabel status:ready-for-dev to run it through Grill-me → spec → build",
      "Review and merge it by hand",
    ]);
    return { currentLabel: LABEL.blockedArchitecture };
  }

  const headSha = await ghPrHeadSha(pr.number);
  await gitFetchBranch(pr.headRefName);
  const loaded = await loadLockedSpec(n, lock, `origin/${pr.headRefName}`);
  if ("error" in loaded) {
    await block(n, LABEL.jevReview, LABEL.blockedArchitecture, `Spec lock check failed: ${loaded.error}`, [
      "Restore the locked spec files on the branch",
      "Delete the 📐 Spec locked comment and relabel status:ready-for-dev to re-spec",
    ]);
    return { currentLabel: LABEL.blockedArchitecture };
  }
  const spec: Spec = loaded.spec;

  const { kept, files } = filterDiff(await ghPrDiff(pr.number));
  const allowed = new Set(spec.fileStructure.map((f) => f.path));
  const deterministic: string[] = [];
  const noOp = detectNoOpDiff(kept);
  if (noOp) deterministic.push(`No-op diff: ${noOp}.`);
  const outOfSpec = files.filter((p) => !p.startsWith("docs/specs/") && !allowed.has(p) && !E2E_SPEC_RE.test(p));
  if (outOfSpec.length) deterministic.push(`Files changed outside the spec: ${outOfSpec.join(", ")}.`);
  const missingTests = spec.testing.requiredTests.filter((t) => !files.includes(t.path)).map((t) => t.path);
  if (missingTests.length) deterministic.push(`Required tests missing from the PR: ${missingTests.join(", ")}.`);

  let verdict: JevVerdict | null = null;
  let failures = deterministic;
  if (deterministic.length === 0) {
    const rubric = buildRubric(spec, files);
    const questions = { ...Object.fromEntries(rubric.map((r) => [r.id, r.question])), complexity: COMPLEXITY_QUESTION };
    const jevState = buildJevState(spec, kept);
    const tokens = estimateTokens(jevState);
    if (tokens > JEV.stateTokenBudget) {
      await block(n, LABEL.jevReview, LABEL.blockedArchitecture, `This PR is too large for Jev's 32K-token window (~${tokens} tokens of spec + diff). It is not truncated, because a partial review could pass code nobody checked.`, [
        "Split the issue into smaller issues",
        "Review and merge it by hand",
      ]);
      return { currentLabel: LABEL.blockedArchitecture };
    }
    try {
      verdict = decide(rubric, await jevEvaluate(jevState, questions));
    } catch (err) {
      if (err instanceof JevUnavailableError) {
        // Leave the transient label: recover-stuck-issues.ts re-runs this review after its stale window.
        await ghIssueComment(n, `⏳ Jev is unavailable (${err.message}). The stuck-issue sweep will retry this review automatically.`);
        return {};
      }
      if (err instanceof JevConfigError) {
        await block(n, LABEL.jevReview, LABEL.blockedArchitecture, `Jev review can't run: ${err.message}`, ["Fix the TypeSafe configuration, then reply here to re-run the review"]);
        return { currentLabel: LABEL.blockedArchitecture };
      }
      throw err;
    }
    failures = [
      ...verdict.items.filter((i) => i.status !== "pass").map((i) => `${i.label} — wanted "${i.passWhen}", P(yes)=${i.pYes.toFixed(2)}${i.status === "uncertain" ? " (uncertain)" : ""}`),
      ...(verdict.complexity.pass ? [] : [`Complexity ${verdict.complexity.score.toFixed(2)} exceeds ${verdict.complexity.max} on the 0-4 scale — remove abstraction or code the spec doesn't need.`]),
    ];
  }

  const pass = failures.length === 0;
  const data: JevVerdictMarker = {
    sha: headSha,
    pass,
    passed: verdict ? verdict.items.filter((i) => i.status === "pass").length : 0,
    total: verdict ? verdict.items.length : 0,
    complexity: verdict && Number.isFinite(verdict.complexity.score) ? Number(verdict.complexity.score.toFixed(2)) : null,
  };
  const report = [
    `### ${pass ? "🟢 Jev review passed" : "🔴 Jev review rejected"} — ${headSha.slice(0, 7)}`,
    verdict ? verdictTable(verdict) : `Rejected before calling Jev:\n${deterministic.map((d) => `- ${d}`).join("\n")}`,
    pass ? "Next: Playwright E2E." : `Failing:\n${failures.map((f) => `- ${f}`).join("\n")}`,
  ].join("\n\n");
  await ghPrReviewComment(pr.number, report);
  await ghIssueComment(n, `${report}\n\n${marker("jev-verdict", data)}`);

  if (pass) {
    await relabel(n, LABEL.jevReview, LABEL.readyForQa);
    return { currentLabel: LABEL.readyForQa, prNumber: pr.number, jevFailures: null };
  }

  // The verdict just posted isn't in `issue.comments` yet — count it with +1.
  const since = lastOwnerCommentIndex(issue.comments);
  const rounds = readMarkers<JevVerdictMarker>(issue.comments, "jev-verdict").filter((m) => m.commentIndex > since && !m.data.pass).length + 1;
  if (rounds <= MAX_JEV_ROUNDS) {
    await relabel(n, LABEL.jevReview, LABEL.readyForDev);
    return { currentLabel: LABEL.readyForDev, prNumber: pr.number, jevFailures: failures };
  }
  await block(n, LABEL.jevReview, LABEL.blockedArchitecture, `Jev rejected this PR ${rounds} times in a row without the subagents converging.`, [
    "Reply with fix direction (this resets the round budget)",
    "Relax the spec: delete the 📐 Spec locked comment and relabel status:ready-for-dev",
    "Review and merge it by hand",
  ], "🛑 **Escalation: Jev rounds exhausted**");
  return { currentLabel: LABEL.blockedArchitecture };
}
