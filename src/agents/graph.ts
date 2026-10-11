/**
 * The 7-stage agentic SDLC as a LangGraph state machine:
 *
 *   1 ingest ─▶ 2 grill ─▶ 3 design ─▶ 4+5 build ─▶ 6 jev_review ─▶ e2e ─▶ 7 ship
 *                  ▲ owner answers         ▲    │ reject      │ fail
 *                  └ (awaiting-answers)     └────┴─────────────┘
 *               escalation ◀── any block ──▶ build / jev_review / ship / human
 *
 * A fresh run enters at the node matching the issue's live status:* label.
 * Every hand-off between stages is chained IN-PROCESS: relabels made with
 * GITHUB_TOKEN don't trigger workflows (GitHub's recursion guard), so a
 * stage that only relabeled would leave the issue idle until the 30-minute
 * sweep. Waits on humans (Grill-me answers, escalations) and on CI end the
 * run; the next webhook re-enters from the label.
 *
 * Compiled with MemorySaver — per-process only; GitHub is the durable state
 * (see state.ts).
 */
import { END, MemorySaver, StateGraph } from "@langchain/langgraph";
import { LABEL, MAX_HANDOVERS } from "./config.js";
import { AgenticSdlcState, type AgenticSdlcStateType } from "./state.js";
import { buildNode } from "./stages/build.js";
import { designNode } from "./stages/design.js";
import { e2eNode } from "./stages/e2e.js";
import { circuitBreakerNode, escalationNode } from "./stages/escalation.js";
import { grillNode } from "./stages/grill.js";
import { ingestNode } from "./stages/ingest.js";
import { jevReviewNode } from "./stages/review.js";
import { shipNode } from "./stages/ship.js";

type Node = "ingest" | "grill" | "design" | "build" | "jev_review" | "e2e" | "ship" | "escalation" | "circuit_breaker";

/** Entry label → first node. Transient "stage running" labels aren't listed: someone else is already on it. */
const ENTRY: Record<string, Node> = {
  [LABEL.readyForDev]: "ingest",
  [LABEL.readyForUiWork]: "ingest",
  [LABEL.awaitingAnswers]: "ingest",
  [LABEL.legacyUiClarity]: "ingest",
  [LABEL.inReview]: "jev_review",
  [LABEL.readyForQa]: "e2e",
  [LABEL.readyToShip]: "ship",
  [LABEL.blocked]: "escalation",
  [LABEL.blockedArchitecture]: "escalation",
  [LABEL.blockedDeploy]: "escalation",
};

/**
 * Per-stage exits: the label a stage leaves decides the next hop. Anything
 * not listed — notably a stage that is WAITING (owner answers, CI still
 * pending, Jev unavailable) and so left its label as it was — ends the run.
 * Explicit per stage on purpose: a global label→node map would route a
 * waiting stage straight back into itself.
 */
const EXITS: Record<Exclude<Node, "circuit_breaker">, Record<string, Node>> = {
  ingest: {}, // see routeAfterIngest
  grill: { [LABEL.designing]: "design" },
  design: { [LABEL.inProgress]: "build" },
  build: { [LABEL.inReview]: "jev_review", [LABEL.blocked]: "escalation" },
  jev_review: { [LABEL.readyForQa]: "e2e", [LABEL.readyForDev]: "build", [LABEL.blocked]: "escalation" },
  e2e: { [LABEL.readyToShip]: "ship", [LABEL.readyForDev]: "build", [LABEL.blocked]: "escalation" },
  ship: { [LABEL.inReview]: "jev_review", [LABEL.readyForQa]: "e2e", [LABEL.blocked]: "escalation" },
  escalation: { [LABEL.readyForDev]: "ingest", [LABEL.inReview]: "jev_review", [LABEL.readyToShip]: "ship" },
};

export const exitFrom = (stage: keyof typeof EXITS) => (s: Pick<AgenticSdlcStateType, "currentLabel">): Node | typeof END => EXITS[stage][s.currentLabel] ?? END;

const routeFromEntry = (s: AgenticSdlcStateType): Node | typeof END => ENTRY[s.currentLabel] ?? END;

/** A locked spec at ready-for-dev skips straight to the build (ingest.ts). */
const routeAfterIngest = (s: AgenticSdlcStateType): Node =>
  s.specLock && s.currentLabel === LABEL.readyForDev ? "build" : "grill";

/** Escalation's autonomous hand-back to the build is the one cycle with no human in it — bounded here. */
function routeAfterEscalation(s: AgenticSdlcStateType): Node | typeof END {
  if (s.currentLabel === LABEL.readyForDev && s.handoverCount >= MAX_HANDOVERS) return "circuit_breaker";
  return exitFrom("escalation")(s); // ready-for-dev → ingest re-derives the spec lock: build if locked, Grill-me otherwise
}

const builder = new StateGraph(AgenticSdlcState)
  .addNode("ingest", ingestNode)
  .addNode("grill", grillNode)
  .addNode("design", designNode)
  .addNode("build", buildNode)
  .addNode("jev_review", jevReviewNode)
  .addNode("e2e", e2eNode)
  .addNode("ship", shipNode)
  .addNode("escalation", escalationNode)
  .addNode("circuit_breaker", circuitBreakerNode)
  .addConditionalEdges("__start__", routeFromEntry, ["ingest", "jev_review", "e2e", "ship", "escalation", END])
  .addConditionalEdges("ingest", routeAfterIngest, ["grill", "build"])
  .addConditionalEdges("grill", exitFrom("grill"), ["design", END])
  .addConditionalEdges("design", exitFrom("design"), ["build", END])
  .addConditionalEdges("build", exitFrom("build"), ["jev_review", "escalation", END])
  .addConditionalEdges("jev_review", exitFrom("jev_review"), ["build", "e2e", "escalation", END])
  .addConditionalEdges("e2e", exitFrom("e2e"), ["build", "ship", "escalation", END])
  .addConditionalEdges("ship", exitFrom("ship"), ["jev_review", "e2e", "escalation", END])
  .addConditionalEdges("escalation", routeAfterEscalation, ["ingest", "jev_review", "ship", "circuit_breaker", END])
  .addEdge("circuit_breaker", END);

export const graph = builder.compile({ checkpointer: new MemorySaver() });

/** Enough steps for the longest legitimate in-process chain (several build↔review↔E2E rounds). */
export const RECURSION_LIMIT = 100;
