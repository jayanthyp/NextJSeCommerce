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
import { uiDesignerNode, devLoopNode, qualityAnalystNode, techLeadNode, circuitBreakerEscalationNode } from "./nodes.js";

/** dev_loop<->tech_lead in-process hand-back limit — see handoverCount in state.ts. */
const MAX_HANDOVERS = 3;

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
  // QA's own relabeling decides the next hop: status:ready-for-dev means "hand
  // back to dev-loop" — whether to FIX a failing test (testResults.passed=false)
  // or to AUTHOR a missing spec (testResults.passed=true, baseline green) — and
  // anything else (status:in-review on pass, status:blocked on escalation) goes
  // to tech_lead. Routing on the label rather than testResults.passed is what
  // lets the "author a missing spec" hand-back still reach dev_loop.
  return state.currentLabel === "status:ready-for-dev" ? "dev_loop" : "tech_lead";
}

function routeAfterDevLoop(state: AgenticSdlcStateType): "quality_analyst" | "tech_lead" | typeof END {
  // Chain straight into QA on success. dev-loop relabels via GITHUB_TOKEN,
  // whose label events do NOT re-trigger this workflow (GitHub's recursive-
  // trigger guard), so both the dev->QA handoff AND the dev->tech-lead
  // handoff on a block must happen in-process, not event-driven — otherwise a
  // status:blocked issue sits idle until the next schedule sweep (up to 30
  // min) instead of getting tech-lead's review immediately.
  if (state.currentLabel === "status:ready-for-qa") return "quality_analyst";
  if (state.currentLabel === "status:blocked") return "tech_lead";
  return END;
}

function routeAfterUiDesigner(state: AgenticSdlcStateType): "dev_loop" | typeof END {
  // Same in-process handoff as dev->QA above: ui-designer promotes to
  // status:ready-for-dev via GITHUB_TOKEN, whose label events don't re-trigger
  // the workflow, so without this chain a UI issue stalls at ready-for-dev
  // waiting on the external /loop dev-loop poller. Chain into dev_loop in the
  // same run. On a clarity block (status:blocked-ui-work-need-clarity) end here
  // for the owner's reply.
  return state.currentLabel === "status:ready-for-dev" ? "dev_loop" : END;
}

function routeAfterTechLead(state: AgenticSdlcStateType): "dev_loop" | "escalation" | typeof END {
  // Same in-process handoff as above: when tech-lead resolves a status:blocked
  // or status:blocked-architecture-review escalation, it relabels straight back
  // to status:ready-for-dev via GITHUB_TOKEN, whose label events don't
  // re-trigger the workflow. Without this chain, recover-stuck-issues.ts can't
  // save it either — its RECOVERY map only covers transient mid-work labels,
  // not the stable ready-for-dev label — so the issue would be stranded
  // permanently rather than just delayed. Every other tech-lead outcome
  // (approve+merge, escalate, deploy-fail) has no further in-graph node, so
  // this is the only currentLabel value worth chaining on.
  if (state.currentLabel !== "status:ready-for-dev") return END;

  // Circuit breaker: this in-process chain, paired with dev_loop's own
  // block->tech_lead handoff (routeAfterDevLoop), forms a cycle tech-lead's
  // autonomous unblockGenericWorkflow can re-enter with no human involved —
  // observed hitting LangGraph's internal recursion limit on issue #129
  // (GraphRecursionError, an uncaught crash invisible on GitHub). Checked
  // here rather than unconditionally at the top of the function so a
  // same-run approve+deploy (which never reaches this branch — see above)
  // can't be short-circuited by a handoverCount left over from earlier
  // dev_loop<->tech_lead cycling in the same run.
  if (state.handoverCount >= MAX_HANDOVERS) {
    console.warn(`[circuit-breaker] handoverCount=${state.handoverCount} >= ${MAX_HANDOVERS} — routing to escalation instead of dev_loop`);
    return "escalation";
  }

  return "dev_loop";
}

const builder = new StateGraph(AgenticSdlcState)
  .addNode("ui_designer", uiDesignerNode)
  .addNode("dev_loop", devLoopNode)
  .addNode("quality_analyst", qualityAnalystNode)
  .addNode("tech_lead", techLeadNode)
  .addNode("escalation", circuitBreakerEscalationNode)
  .addConditionalEdges("__start__", routeFromEntry, {
    ui_designer: "ui_designer",
    dev_loop: "dev_loop",
    quality_analyst: "quality_analyst",
    tech_lead: "tech_lead",
    [END]: END,
  })
  .addConditionalEdges("ui_designer", routeAfterUiDesigner, {
    dev_loop: "dev_loop",
    [END]: END,
  })
  .addConditionalEdges("dev_loop", routeAfterDevLoop, {
    quality_analyst: "quality_analyst",
    tech_lead: "tech_lead",
    [END]: END,
  })
  .addConditionalEdges("quality_analyst", routeAfterQualityAnalyst, {
    dev_loop: "dev_loop",
    tech_lead: "tech_lead",
    [END]: END,
  })
  .addConditionalEdges("tech_lead", routeAfterTechLead, {
    dev_loop: "dev_loop",
    escalation: "escalation",
    [END]: END,
  })
  .addEdge("escalation", END);

const checkpointer = new MemorySaver();

export const graph = builder.compile({ checkpointer });
