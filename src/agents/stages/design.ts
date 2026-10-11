/**
 * Stage 3 — Design: the orchestrator applies agent-skills'
 * spec-driven-development + planning-and-task-breakdown to the issue and
 * Grill-me's resolved requirements, producing the locked spec: file-by-file
 * blueprint, data types, testing requirements, binary acceptance criteria,
 * and a 1-5 task plan with disjoint file ownership for parallel subagents.
 *
 * Folds in the old ui-designer role: UI-facing changes get desktop/mobile/
 * breakpoint/interactive-state sections from the design-system context.
 *
 * If the designer still has open questions, they go back to the owner as a
 * Grill-me round instead of being locked in as guesses.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { LABEL, specDir } from "../config.js";
import { readDesignContext, readRepoContext } from "../context.js";
import { extractStructured } from "../llm.js";
import { marker, readMarkers } from "../markers.js";
import { designSystemPrompt } from "../prompts.js";
import { renderSpecMarkdown, serializeSpec, sha256, specSchemaFor, type SpecLock } from "../spec.js";
import type { AgenticSdlcStateType, StateUpdate } from "../state.js";
import { findOpenPr, ghIssueComment, ghIssueView, gitAdd, gitCheckoutWorkBranch, gitCommit, gitHasStagedChanges, gitPush, relabel } from "../tools.js";
import { isBugIssue } from "./common.js";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");

export async function designNode(state: AgenticSdlcStateType): Promise<StateUpdate> {
  const n = state.issueNumber;
  const issue = await ghIssueView(n);
  const isBug = isBugIssue(issue);
  const resolvedAt = readMarkers(issue.comments, "grill-resolved").at(-1)?.commentIndex;
  const resolved = resolvedAt === undefined ? "(Grill-me found nothing open — the issue text is the requirement.)" : (issue.comments[resolvedAt]?.body ?? "");

  const spec = await extractStructured(specSchemaFor(isBug), {
    role: "orchestrator",
    name: `design #${n}`,
    system: designSystemPrompt(),
    user: [
      `## Issue #${n}${isBug ? " (BUG)" : ""}: ${issue.title}`,
      issue.body || "(no description)",
      `## Resolved requirements (Grill-me)`,
      resolved,
      `## Project memory (claude-mem)`,
      state.memoryContext || "(none recalled)",
      `## Design system context (for UI-facing changes)`,
      readDesignContext() || "(none found)",
      `## Repository`,
      await readRepoContext(`${issue.title}\n${issue.body}\n${resolved}`),
    ].join("\n\n"),
  });

  if (spec.openQuestions.length > 0) {
    const round = readMarkers(issue.comments, "grill-round").length + 1;
    const questions = spec.openQuestions.map((q, i) => `❓ **Q${i + 1}**: ${q}`).join("\n\n---\n\n");
    await ghIssueComment(
      n,
      `### 🔥 Grill-me — round ${round} (raised while writing the spec)\n\nThe spec can't be locked until these are decided. Reply on this issue.\n\n${questions}\n\n${marker("grill-round", { round })}`
    );
    await relabel(n, LABEL.designing, LABEL.awaitingAnswers);
    return { currentLabel: LABEL.awaitingAnswers };
  }

  // A pre-restructure issue may already have a PR — keep building on its branch.
  const branch = (await findOpenPr(n))?.headRefName ?? `feature/issue-${n}-${slug(spec.title) || "spec"}`;
  await gitCheckoutWorkBranch(branch);
  const dir = specDir(n);
  const json = serializeSpec(spec);
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/spec.json`, json, "utf-8");
  writeFileSync(`${dir}/spec.md`, renderSpecMarkdown(spec, n), "utf-8");
  await gitAdd([`${dir}/spec.json`, `${dir}/spec.md`]);
  if (await gitHasStagedChanges()) await gitCommit(`docs(spec): lock spec for #${n}`); // a re-run can produce an identical spec
  await gitPush(branch, { setUpstream: true });

  const lock: SpecLock = { branch, sha256: sha256(json) };
  const blob = `https://github.com/jayanthyp/NextJSeCommerce/blob/${branch}/${dir}`;
  await ghIssueComment(
    n,
    [
      `### 📐 Spec locked`,
      spec.objective,
      `- **Spec:** [spec.md](${blob}/spec.md) · [spec.json](${blob}/spec.json) on \`${branch}\``,
      `- **Acceptance criteria:** ${spec.acceptanceCriteria.length} · **error cases:** ${spec.errorHandling.length} · **required tests:** ${spec.testing.requiredTests.length}`,
      `- **Subagents:** ${spec.tasks.map((t) => `${t.id} (${t.model}, ${t.files.length} file${t.files.length === 1 ? "" : "s"})`).join(", ")}`,
      `To change requirements after this point, delete this comment and relabel the issue \`${LABEL.readyForDev}\` — the next run starts a new Grill-me + spec.`,
      marker("spec-lock", lock),
    ].join("\n\n")
  );
  await relabel(n, LABEL.designing, LABEL.inProgress);
  return { currentLabel: LABEL.inProgress, specLock: lock };
}
