/**
 * Wires the four label-routable nodes together with conditional edges keyed
 * on `currentLabel` (routing a fresh run to the right entry node) and
 * `testResults` (quality-analyst's pass -> tech-lead / fail -> dev-loop
 * branch). Compiled with MemorySaver — per-process only, see state.ts's
 * doc comment for why that's the correct choice under the "GitHub is the
 * source of truth" state model.
 *
 * businessAnalystNode is intentionally not wired here — see nodes.ts's
 * comment on it; it has no natural entry point in an issue/label/comment
 * event graph.
 */
import { StateGraph, END, MemorySaver } from "@langchain/langgraph";
import { AgenticSdlcState, type AgenticSdlcStateType } from "./state.js";
import { uiDesignerNode, devLoopNode, qualityAnalystNode, techLeadNode } from "./nodes.js";

/** Label -> entry node, per the five .md files' label state machine. Anything not listed is a transient "someone else is already on it" state this event graph doesn't act on. */
const LABEL_TO_NODE: Record<string, "ui_designer" | "dev_loop" | "quality_analyst" | "tech_lead"> = {
  "status:ready-for-ui-work": "ui_designer",
  "status:blocked-ui-work-need-clarity": "ui_designer",
  "status:ready-for-dev": "dev_loop",
  "status:ready-for-qa": "quality_analyst",
  "status:in-review": "tech_lead",
  "status:blocked": "tech_lead",
  "status:blocked-architecture-review": "tech_lead",
  "status:blocked-deploy-failed": "tech_lead",
};

function routeFromEntry(state: AgenticSdlcStateType): "ui_designer" | "dev_loop" | "quality_analyst" | "tech_lead" | typeof END {
  return LABEL_TO_NODE[state.currentLabel] ?? END;
}

function routeAfterQualityAnalyst(state: AgenticSdlcStateType): "dev_loop" | "tech_lead" | typeof END {
  if (!state.testResults) return END;
  if (state.testResults.passed) return "tech_lead";
  // E2E failed. quality-analyst chooses the next hop by how it relabels the
  // issue: within the dev↔QA round budget it leaves the issue at
  // status:ready-for-dev (route back through dev_loop, carrying the failure
  // log in state), and past the budget — or on a CI-red, not-E2E failure — it
  // relabels status:blocked and we escalate to tech_lead for human-in-the-loop
  // direction instead of looping forever.
  return state.currentLabel === "status:ready-for-dev" ? "dev_loop" : "tech_lead";
}

function routeAfterDevLoop(state: AgenticSdlcStateType): "quality_analyst" | typeof END {
  // Chain straight into QA on success. dev-loop relabels to ready-for-qa via
  // GITHUB_TOKEN, whose label events do NOT re-trigger this workflow (GitHub's
  // recursive-trigger guard), so the dev->QA handoff must happen in-process,
  // not event-driven. On a block (status:blocked) end here for a human.
  return state.currentLabel === "status:ready-for-qa" ? "quality_analyst" : END;
}

const builder = new StateGraph(AgenticSdlcState)
  .addNode("ui_designer", uiDesignerNode)
  .addNode("dev_loop", devLoopNode)
  .addNode("quality_analyst", qualityAnalystNode)
  .addNode("tech_lead", techLeadNode)
  .addConditionalEdges("__start__", routeFromEntry, {
    ui_designer: "ui_designer",
    dev_loop: "dev_loop",
    quality_analyst: "quality_analyst",
    tech_lead: "tech_lead",
    [END]: END,
  })
  .addEdge("ui_designer", END)
  .addConditionalEdges("dev_loop", routeAfterDevLoop, {
    quality_analyst: "quality_analyst",
    [END]: END,
  })
  .addConditionalEdges("quality_analyst", routeAfterQualityAnalyst, {
    dev_loop: "dev_loop",
    tech_lead: "tech_lead",
    [END]: END,
  })
  .addEdge("tech_lead", END);

const checkpointer = new MemorySaver();

export const graph = builder.compile({ checkpointer });
