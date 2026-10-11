/**
 * Escalation — what the old tech-lead role still owns now that Jev reviews
 * and the Ship stage merges: resolving blocked issues.
 *
 *   status:blocked                    → the orchestrator gives concrete fix
 *                                       direction (back to the build), or
 *                                       escalates to the owner
 *   status:blocked-architecture-review → owner-only: on a reply, back to Jev
 *                                       review (PR exists) or the build
 *   status:blocked-deploy-failed      → owner-only: "retry" ships again
 */
import { z } from "zod/v4";
import { LABEL } from "../config.js";
import { extractStructured } from "../llm.js";
import { hasOwnerReplySince } from "../markers.js";
import { escalationSystemPrompt } from "../prompts.js";
import type { AgenticSdlcStateType, StateUpdate } from "../state.js";
import { findOpenPr, ghIssueComment, ghIssueView, relabel, runHealthChecks } from "../tools.js";
import { block } from "./common.js";

async function unblock(state: AgenticSdlcStateType): Promise<StateUpdate> {
  const n = state.issueNumber;
  const issue = await ghIssueView(n);
  const lastComment = issue.comments.at(-1)?.body ?? "";

  // A size block means the subagents already retried and kept producing too
  // much code; direction can't fix that, and auto-unblocking would loop.
  if (lastComment.includes("-line ceiling")) {
    await block(n, LABEL.blocked, LABEL.blockedArchitecture, "The subagents repeatedly exceeded the diff-size ceiling. The issue's scope or the spec needs a human decision.", [
      "Split the issue",
      "Raise MAX_DIFF_LINES for this kind of change",
    ], "🛑 **Escalation**");
    return { currentLabel: LABEL.blockedArchitecture };
  }

  // Read-only probes of production's public health endpoints: turns "check
  // these 5 hypotheses" into evidence for ops-shaped bugs (#129).
  const health = await runHealthChecks();
  const healthContext = health.length
    ? `\n\nLive production health checks (read-only, just run):\n${health.map((h) => `- ${h.name} (${h.url}): ${h.error ? `ERROR — ${h.error}` : `HTTP ${h.statusCode}`}`).join("\n")}`
    : "";

  const decision = await extractStructured(z.object({ canResolve: z.boolean(), direction: z.string() }), {
    role: "orchestrator",
    name: `escalation #${n}`,
    system: escalationSystemPrompt(),
    user: `Issue #${n}: ${issue.title}\n\n${issue.body}\n\nLatest blocking comment:\n${lastComment}${healthContext}`,
  });

  if (decision.canResolve) {
    const pr = await findOpenPr(n);
    await ghIssueComment(n, `### 🧭 Technical Lead Direction\n${decision.direction}${pr ? `\n\nPush the fix to the open PR ${pr.url}.` : ""}`);
    await relabel(n, LABEL.blocked, LABEL.readyForDev);
    // The one autonomous hand-back that can recur within a run — counted for the circuit breaker (graph.ts).
    return { currentLabel: LABEL.readyForDev, handoverCount: 1 };
  }
  await block(n, LABEL.blocked, LABEL.blockedArchitecture, decision.direction, ["Provide the missing product/business decision", "Deprioritize this issue"], "🛑 **Escalation Required**");
  return { currentLabel: LABEL.blockedArchitecture };
}

async function ownerReply(state: AgenticSdlcStateType): Promise<StateUpdate> {
  const n = state.issueNumber;
  const issue = await ghIssueView(n);
  if (!hasOwnerReplySince(issue.comments)) return {}; // owner-only queue

  if (state.currentLabel === LABEL.blockedArchitecture) {
    const next = (await findOpenPr(n)) ? LABEL.inReview : LABEL.readyForDev;
    await relabel(n, LABEL.blockedArchitecture, next);
    return { currentLabel: next };
  }
  if (/retry/i.test(issue.comments.at(-1)?.body ?? "")) {
    await relabel(n, LABEL.blockedDeploy, LABEL.readyToShip);
    return { currentLabel: LABEL.readyToShip };
  }
  return {}; // anything else: the owner handles it (e.g. closes the PR)
}

export async function escalationNode(state: AgenticSdlcStateType): Promise<StateUpdate> {
  switch (state.currentLabel) {
    case LABEL.blocked:
      return unblock(state);
    case LABEL.blockedArchitecture:
    case LABEL.blockedDeploy:
      return ownerReply(state);
    default:
      return {};
  }
}

/**
 * Reached when escalation has handed the same issue back to the build
 * MAX_HANDOVERS times in one run without it resolving. Ends the run the way
 * every other block does — a label and a comment — instead of LangGraph's
 * recursion limit throwing an uncaught, GitHub-invisible crash.
 */
export async function circuitBreakerNode(state: AgenticSdlcStateType): Promise<StateUpdate> {
  console.warn(`[circuit-breaker] #${state.issueNumber}: handoverCount=${state.handoverCount} — halting the build↔escalation cycle`);
  await block(
    state.issueNumber,
    state.currentLabel,
    LABEL.blocked,
    `The build and escalation stages handed this issue back and forth ${state.handoverCount} times in one run without resolving it. Halting automatically.`,
    ["Give a more specific fix direction", "Confirm it needs a different approach (e.g. outside the spec's scope)", "Close or deprioritize this issue"],
    "🛑 **Circuit Breaker Tripped**"
  );
  return { currentLabel: LABEL.blocked };
}
