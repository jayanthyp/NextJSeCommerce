/**
 * Stage 2 — Requirements via the Grill-me skill (mattpocock/skills
 * `grilling`), run against the GitHub issue.
 *
 * Each run computes the current *frontier* of open decisions. Facts are the
 * orchestrator's job: it answers them from the repo index, memory and any
 * files it asks to read (up to two lookups — the pipeline's stand-in for the
 * skill's fact-finding sub-agent). Decisions are the owner's: they are posted
 * as a numbered round with recommended answers, and the issue waits in
 * status:awaiting-answers until the owner replies ("yes" accepts them all).
 * Rounds are human-paced, so there is no round cap.
 *
 * When the frontier is empty, the resolved edge cases / assumptions /
 * parameters are appended to the issue as a comment — the input to Stage 3.
 */
import { z } from "zod/v4";
import { LABEL } from "../config.js";
import { readFiles, readRepoContext } from "../context.js";
import { extractStructured } from "../llm.js";
import { hasOwnerReplySince, marker, readMarkers } from "../markers.js";
import { rememberEvent } from "../memory.js";
import { grillSystemPrompt } from "../prompts.js";
import type { AgenticSdlcStateType, StateUpdate } from "../state.js";
import { ghIssueComment, ghIssueView, gitListFiles, relabel } from "../tools.js";
import { renderThread } from "./common.js";

const GrillSchema = z.object({
  fileRequests: z.array(z.string()).describe("Exact repository paths to read before deciding what is a fact vs a decision. Empty when nothing more is needed."),
  facts: z.array(z.object({ question: z.string(), answer: z.string(), source: z.string() })).describe("Facts you established yourself, with where they came from"),
  frontier: z
    .array(z.object({ title: z.string(), question: z.string(), recommendation: z.string() }))
    .describe("Open DECISIONS for the owner this round, each worded so 'yes' accepts the recommendation. Empty when nothing is left open."),
  resolved: z.object({
    decisions: z.array(z.string()),
    edgeCases: z.array(z.string()),
    assumptions: z.array(z.string()),
    parameters: z.array(z.string()),
  }),
});

const MAX_LOOKUPS = 2;

export async function grillNode(state: AgenticSdlcStateType): Promise<StateUpdate> {
  const n = state.issueNumber;
  const issue = await ghIssueView(n);
  const resuming = state.currentLabel === LABEL.awaitingAnswers || state.currentLabel === LABEL.legacyUiClarity;
  if (resuming && !hasOwnerReplySince(issue.comments)) {
    console.log(`[grill] #${n} is waiting on the owner's answers — nothing to do`);
    return {};
  }
  await relabel(n, state.currentLabel, LABEL.grilling);

  const round = readMarkers(issue.comments, "grill-round").length + 1;
  const tracked = new Set(await gitListFiles([]));
  const read = new Set<string>();
  let lookedUp = "";
  const baseUser = [
    `## Issue #${n}: ${issue.title}`,
    issue.body || "(no description)",
    `## Thread so far (earlier Grill-me rounds and the owner's answers)`,
    renderThread(issue.comments) || "(no comments yet)",
    `## Project memory (claude-mem — past issues, decisions, shipped changes)`,
    state.memoryContext || "(none recalled)",
    `## Repository`,
    await readRepoContext(`${issue.title}\n${issue.body}`),
  ].join("\n\n");

  let result: z.infer<typeof GrillSchema> | null = null;
  for (let lookup = 0; lookup <= MAX_LOOKUPS; lookup++) {
    result = await extractStructured(GrillSchema, {
      role: "orchestrator",
      name: `grill #${n} round ${round}`,
      system: grillSystemPrompt(),
      user: lookedUp ? `${baseUser}\n\n## Files you asked to read\n${lookedUp}` : baseUser,
    });
    const wanted = result.fileRequests.filter((p) => tracked.has(p) && !read.has(p)).slice(0, 8);
    if (wanted.length === 0 || lookup === MAX_LOOKUPS) break;
    wanted.forEach((p) => read.add(p));
    lookedUp += `\n\n${readFiles(wanted)}`;
    console.log(`[grill] #${n} reading ${wanted.length} file(s) for facts: ${wanted.join(", ")}`);
  }
  if (!result) throw new Error("grill produced no result");

  const factsBlock = result.facts.length
    ? `\n\n<details><summary>Facts I checked myself (${result.facts.length})</summary>\n\n${result.facts.map((f) => `- **${f.question}** ${f.answer} _(${f.source})_`).join("\n")}\n</details>`
    : "";

  if (result.frontier.length > 0) {
    const questions = result.frontier.map((q, i) => `❓ **Q${i + 1}** - **${q.title}**: ${q.question}\n\n➡️ ${q.recommendation}`).join("\n\n---\n\n");
    await ghIssueComment(
      n,
      `### 🔥 Grill-me — round ${round}\n\nBefore the spec is written I need your decisions on these. Reply on this issue: **"yes"** accepts every recommendation, or answer by number.\n\n${questions}${factsBlock}\n\n${marker("grill-round", { round })}`
    );
    await relabel(n, LABEL.grilling, LABEL.awaitingAnswers);
    return { currentLabel: LABEL.awaitingAnswers };
  }

  const section = (title: string, items: string[]) => `**${title}**\n${items.length ? items.map((i) => `- ${i}`).join("\n") : "- (none)"}`;
  const { decisions, edgeCases, assumptions, parameters } = result.resolved;
  await ghIssueComment(
    n,
    [
      "### ✅ Grill-me complete — resolved requirements",
      section("Decisions", decisions),
      section("Edge cases", edgeCases),
      section("Assumptions", assumptions),
      section("Parameters", parameters),
      `Next: writing and locking the spec.${factsBlock}`,
      marker("grill-resolved", { round }),
    ].join("\n\n")
  );
  await rememberEvent({
    issueNumber: n,
    title: issue.title,
    kind: "requirements",
    input: { issue: issue.title, rounds: round - 1 },
    output: result.resolved,
    summary: `Requirements for #${n} "${issue.title}" resolved: ${decisions.slice(0, 5).join("; ")}`,
  });
  await relabel(n, LABEL.grilling, LABEL.designing);
  return { currentLabel: LABEL.designing };
}
