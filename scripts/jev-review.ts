#!/usr/bin/env node
/**
 * Dry-run of Stage 6 for one issue: `npm run jev-review -- --issue <n>`.
 * Loads the locked spec from the open PR's branch, asks Jev the same rubric
 * the pipeline would, and prints the verdict — without touching labels or
 * comments. Useful for checking the TypeSafe setup and tuning
 * JEV_PASS_THRESHOLD / JEV_MAX_COMPLEXITY.
 */
import { COMPLEXITY_QUESTION, buildJevState, buildRubric, decide, estimateTokens, filterDiff, jevEvaluate } from "../src/agents/jev.js";
import { latestMarker } from "../src/agents/markers.js";
import type { SpecLock } from "../src/agents/spec.js";
import { loadLockedSpec } from "../src/agents/stages/common.js";
import { findOpenPr, ghIssueView, ghPrDiff, gitFetchBranch } from "../src/agents/tools.js";

const i = process.argv.indexOf("--issue");
const n = Number(process.argv[i + 1]);
if (i === -1 || !Number.isInteger(n)) throw new Error("Usage: npm run jev-review -- --issue <n>");

const issue = await ghIssueView(n);
const lock = latestMarker<SpecLock>(issue.comments, "spec-lock");
const pr = await findOpenPr(n);
if (!lock || !pr) throw new Error(`#${n} needs both a locked spec and an open PR (lock: ${!!lock}, PR: ${!!pr}).`);

await gitFetchBranch(pr.headRefName);
const loaded = await loadLockedSpec(n, lock, `origin/${pr.headRefName}`);
if ("error" in loaded) throw new Error(loaded.error);

const { kept, files } = filterDiff(await ghPrDiff(pr.number));
const rubric = buildRubric(loaded.spec, files);
const state = buildJevState(loaded.spec, kept);
console.log(`PR #${pr.number}: ${files.length} files, ~${estimateTokens(state)} state tokens, ${rubric.length + 1} questions`);

const verdict = decide(rubric, await jevEvaluate(state, { ...Object.fromEntries(rubric.map((r) => [r.id, r.question])), complexity: COMPLEXITY_QUESTION }));
for (const item of verdict.items) console.log(`${item.status.padEnd(9)} P(yes)=${item.pYes.toFixed(2)} want=${item.passWhen.padEnd(3)} ${item.label}`);
console.log(`complexity ${verdict.complexity.score.toFixed(2)} (max ${verdict.complexity.max}, confidence ${verdict.complexity.confidence.toFixed(2)})`);
console.log(verdict.pass ? "PASS" : "FAIL");
