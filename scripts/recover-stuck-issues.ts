#!/usr/bin/env node
/**
 * Stuck-issue recovery. The event-driven graph leaves an issue in a transient
 * `status:*` label while a node runs; if the workflow run is cancelled or the
 * runner dies mid-node, the issue is orphaned there — no future event re-routes
 * it. Run on a cron (see the `schedule` trigger in
 * .github/workflows/langgraph-agent.yml), this finds issues stuck in a transient
 * label whose `updatedAt` has gone stale, hands each back to the correct entry
 * node, then re-invokes the graph in-process (GITHUB_TOKEN's own label events
 * don't re-trigger workflows, so a relabel alone would never re-fire the
 * pipeline).
 */
import { LABEL } from "../src/agents/config.js";
import { graph, RECURSION_LIMIT } from "../src/agents/graph.js";
import { ghIssueList, ghIssueView, ghIssueEdit, ghIssueComment } from "../src/agents/tools.js";

// How long an issue may sit in a transient label before we deem it orphaned.
// Must exceed the longest single no-update gap inside a legitimate run (QA's
// ~5m CI wait + ~3m docker build + E2E) with a comfortable margin.
const STUCK_MS = 45 * 60_000;

// transient label -> the entry label that re-routes it back into the graph.
// Every stage is safe to re-run from its entry label: Grill-me and Design
// re-read the thread, the build re-checks for a locked spec / open PR, and
// Ship re-verifies the head-SHA-pinned verdicts before deploying anything.
// This is also how a Jev outage (review left in jev-review-in-progress)
// gets retried.
const RECOVERY: Record<string, string> = {
  [LABEL.grilling]: LABEL.readyForDev,
  [LABEL.designing]: LABEL.readyForDev,
  [LABEL.inProgress]: LABEL.readyForDev,
  [LABEL.jevReview]: LABEL.inReview,
  [LABEL.qaInProgress]: LABEL.readyForQa,
  [LABEL.deploying]: LABEL.readyToShip,
  // pre-restructure transient labels still on old issues
  "status:tech-lead-review-in-progress": LABEL.inReview,
  "status:ui-requirement-refinement-in-progress": LABEL.readyForDev,
};

interface ListedIssue {
  number: number;
  updatedAt: string;
  labels: { name: string }[];
}

async function main(): Promise<void> {
  // Labels must be quoted (they contain ':') and joined with OR — a bare space
  // between `label:` qualifiers is ANDed by GitHub search, which would match
  // nothing.
  const search = Object.keys(RECOVERY).map((l) => `label:"${l}"`).join(" OR ");
  const issues = (await ghIssueList(`is:open ${search}`, "number,updatedAt,labels")) as ListedIssue[];
  console.log(`[recover] ${issues.length} open issue(s) currently in a transient label`);

  for (const issue of issues) {
    const transient = issue.labels.map((l) => l.name).find((n) => n in RECOVERY);
    if (!transient) continue;

    const ageMs = Date.now() - new Date(issue.updatedAt).getTime();
    if (ageMs < STUCK_MS) {
      console.log(`[recover] #${issue.number} in ${transient} for ${Math.round(ageMs / 60000)}m — within a run's window, skipping`);
      continue;
    }

    const to = RECOVERY[transient];
    try {
      console.log(`[recover] #${issue.number} stuck in ${transient} for ${Math.round(ageMs / 60000)}m → relabel ${to} + re-run`);
      await ghIssueComment(
        issue.number,
        `♻️ Stuck-issue recovery: this issue was left in \`${transient}\` for ${Math.round(ageMs / 60000)}m (a workflow run was cancelled/crashed mid-node). Relabeling to \`${to}\` and re-running the graph.`
      );
      await ghIssueEdit(issue.number, { addLabel: to, removeLabel: transient });

      // Re-derive the live label (GitHub is the source of truth — see
      // trigger.ts) and re-invoke the graph in this same process.
      const live = await ghIssueView(issue.number);
      const statusLabel = live.labels.map((l) => l.name).find((n) => n.startsWith("status:"));
      if (!statusLabel) continue;
      console.log(`[recover] re-running graph for #${issue.number} (label=${statusLabel})`);
      await graph.invoke(
        { issueNumber: issue.number, currentLabel: statusLabel },
        { configurable: { thread_id: String(issue.number) }, recursionLimit: RECURSION_LIMIT }
      );
    } catch (err) {
      console.error(`[recover] failed to recover #${issue.number}:`, err);
      // Continue to the next stuck issue; a later cron tick retries this one.
    }
  }
}

main().catch((err) => {
  console.error("[recover] unhandled error:", err);
  process.exitCode = 1;
});
