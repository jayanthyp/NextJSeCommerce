/**
 * Stage 1 — Ingestion & memory retrieval.
 *
 * Pulls relevant project history from claude-mem for the stages that reason
 * about requirements, and spots re-entry: an issue that already has a locked
 * spec and is back at ready-for-dev (escalation resolved, run crashed and was
 * recovered) skips Grill-me/Design and goes straight to the build.
 */
import { LABEL } from "../config.js";
import { latestMarker } from "../markers.js";
import { recallMemory } from "../memory.js";
import type { SpecLock } from "../spec.js";
import type { AgenticSdlcStateType, StateUpdate } from "../state.js";
import { ghIssueView } from "../tools.js";

export async function ingestNode(state: AgenticSdlcStateType): Promise<StateUpdate> {
  const issue = await ghIssueView(state.issueNumber);
  const specLock = latestMarker<SpecLock>(issue.comments, "spec-lock");
  if (specLock && state.currentLabel === LABEL.readyForDev) {
    console.log(`[ingest] #${state.issueNumber} already has a locked spec on ${specLock.branch} — resuming at the build`);
    return { specLock };
  }
  return { specLock, memoryContext: await recallMemory(`${issue.title}\n${issue.body}`) };
}
