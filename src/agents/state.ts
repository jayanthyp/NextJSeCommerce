/**
 * Graph state for the 7-stage agentic SDLC.
 *
 * State model: GitHub is the durable, cross-run source of truth — issue
 * `status:*` labels for where an issue is, and trusted `<!-- sdlc:… -->`
 * comment markers (markers.ts) for stage results (spec lock, Jev verdict, QA
 * verdict). Every triggered run (scripts/trigger.ts) re-derives
 * `currentLabel` from a live `gh issue view`; this object only carries
 * hand-offs between stages chained inside one process, and is compiled with
 * a per-process MemorySaver (graph.ts) that dies with the Actions job.
 *
 * `thread_id` for the checkpointer is `String(issueNumber)`, set at
 * `graph.invoke(state, { configurable: { thread_id } })`.
 */
import { Annotation } from "@langchain/langgraph";
import type { SpecLock } from "./spec.js";

/** Outcome of the E2E stage's Playwright run. */
export interface TestResults {
  passed: boolean;
  log: string;
}

const replace = <T>(fallback: () => T) => Annotation<T>({ reducer: (_prev, next) => next, default: fallback });

export const AgenticSdlcState = Annotation.Root({
  /** The GitHub issue driving this run. Set once at trigger time. */
  issueNumber: Annotation<number>,

  /** The issue's current status:* label — what graph.ts routes on. Re-fetched from GitHub at the start of every run. */
  currentLabel: Annotation<string>,

  /** Stage 1 → 2/3: relevant claude-mem entries, rendered as prompt context. */
  memoryContext: replace<string>(() => ""),

  /** Stage 3 → 4+: the locked spec's branch and hash. Also recovered from the issue's spec-lock marker on later runs. */
  specLock: replace<SpecLock | null>(() => null),

  /** The PR linked to this issue once the build stage opened (or found) one. */
  prNumber: replace<number | null>(() => null),

  /** Stage 6 → 4: Jev's failing criteria, fed to the orchestrator's fix triage. */
  jevFailures: replace<string[] | null>(() => null),

  /** E2E stage → 4: Playwright result, so a failure log reaches the fix triage. */
  testResults: replace<TestResults | null>(() => null),

  /** E2E runs this process — bounds the build↔E2E loop (MAX_QA_ROUNDS). */
  qaAttemptCount: replace<number>(() => 0),

  /** E2E → 4: why QA handed back (a failing spec, or a UI change shipped with no spec). */
  qaHandoffMessage: replace<string | null>(() => null),

  /** E2E → 4: the hand-back asks for a NEW Playwright spec rather than a fix. */
  qaHandoffAuthorSpec: replace<boolean>(() => false),

  /**
   * Circuit breaker for the build↔escalation in-process cycle: escalation's
   * autonomous unblock can hand an issue back to build, whose own block hands
   * it to escalation again — with no human in the loop that can spin until
   * LangGraph's recursion limit throws (observed on #129). Additive reducer:
   * each hand-back returns a delta of 1.
   */
  handoverCount: Annotation<number>({
    reducer: (current: number, update: number) => current + update,
    default: () => 0,
  }),
});

export type AgenticSdlcStateType = typeof AgenticSdlcState.State;
export type StateUpdate = Partial<AgenticSdlcStateType>;
