/**
 * Graph state for the agentic SDLC.
 *
 * State model (confirmed in the migration plan): GitHub issue labels/comments
 * are the durable, cross-run source of truth — not this state object. Every
 * triggered run (see scripts/trigger.ts) re-derives `currentLabel` from a live
 * `gh issue view` call rather than trusting the webhook payload, and the graph
 * is compiled with a `MemorySaver` (see graph.ts) that only lives as long as
 * this one process. Nothing here is expected to survive past the GitHub
 * Actions job exiting.
 *
 * `thread_id` for the checkpointer is `String(issueNumber)` — set at
 * `graph.invoke(state, { configurable: { thread_id } })` in scripts/trigger.ts,
 * not part of this schema itself.
 *
 * If this ever moves to a self-hosted runner with persistent disk, this is
 * the point where a `SqliteSaver` would replace `MemorySaver` in graph.ts to
 * get genuine cross-run `interrupt()`/`Command({ resume })` semantics instead
 * of the "post a comment, end the run, let the next webhook re-enter the
 * right node" pattern used today (see techLeadNode in nodes.ts).
 */
import { Annotation } from "@langchain/langgraph";

/** A single file edit produced by devLoopNode's LLM call, and later applied via a search/replace. */
export interface CodeChange {
  path: string;
  search: string;
  replace: string;
}

/** Outcome of qualityAnalystNode's native (zero-LLM) Playwright run. */
export interface TestResults {
  passed: boolean;
  log: string;
  screenshotPaths?: string[];
}

export const AgenticSdlcState = Annotation.Root({
  /** The GitHub issue number driving this run. Set once at trigger time, never mutated. */
  issueNumber: Annotation<number>,

  /**
   * The issue's current status:* label, re-fetched from GitHub at the start
   * of every run (scripts/trigger.ts) — this is what conditional edges in
   * graph.ts route on, not the label named in the triggering webhook event.
   */
  currentLabel: Annotation<string>,

  /** dev-loop's pending/applied file edits — both the LLM's structured output and the record used by the build-failure retry loop. */
  codeChanges: Annotation<CodeChange[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  /** quality-analyst's native Playwright result. Absent until qualityAnalystNode runs. */
  testResults: Annotation<TestResults | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  /** tech-lead's SOLID/VPS-resource audit findings when it decides to block rather than approve. Empty on a clean PASS. */
  architecturalBlockers: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  /** The PR number linked to this issue, once dev-loop has opened (or found) one. Null before that. */
  prNumber: Annotation<number | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  /** Bounded retry counter for devLoopNode's build/test-failure -> LLM-fix loop. See MAX_DEV_LOOP_ATTEMPTS in nodes.ts. */
  devLoopAttempts: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),

  /**
   * How many times qualityAnalystNode has run this graph run — drives the
   * dev↔QA autonomous-retry bound (see MAX_QA_ROUNDS in nodes.ts). In-run only,
   * like everything else here: the dev→QA→dev→… loop is chained in a single
   * process, so a plain counter in state is enough; it does not need to survive
   * across runs.
   */
  qaAttemptCount: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
});

export type AgenticSdlcStateType = typeof AgenticSdlcState.State;
