#!/usr/bin/env node
/**
 * Closed-issue reconciliation. Run on the same cron tick as
 * recover-stuck-issues.ts (see .github/workflows/langgraph-agent.yml).
 *
 * An issue can be closed by a path this pipeline doesn't own — a human
 * closing it as a duplicate, or dev-loop opening a second PR for an issue an
 * earlier, differently-worded PR already resolved (see #64/#61/#59/#17,
 * closed with "superseded by ..." while PRs #67/#62/#60/#58 stayed open
 * indefinitely). Nothing previously told an orphaned open PR that its target
 * issue was already done, and nothing stripped the transient `status:*`
 * label the issue was wearing at the moment it got closed (e.g. #142/#143/
 * #148 sitting closed with `status:deploying` still attached) — both are
 * pure noise for anyone reading the tracker afterwards.
 */
import { ghIssueList, ghIssueEdit, ghPrListClosingIssue, ghPrClose } from "../src/agents/tools.js";

interface ListedIssue {
  number: number;
  labels: { name: string }[];
}

interface ListedPr {
  number: number;
  body: string;
}

// How far back to look for closed issues — anything older than this has
// already been reconciled by a previous cron tick (or predates this script).
const LOOKBACK_DAYS = 14;

async function main(): Promise<void> {
  const closed = (await ghIssueList(
    `is:closed closed:>=${lookbackDate()}`,
    "number,labels"
  )) as ListedIssue[];
  console.log(`[reconcile] ${closed.length} issue(s) closed in the last ${LOOKBACK_DAYS}d`);

  for (const issue of closed) {
    await reconcileOrphanedPrs(issue.number);
    await stripStaleLabels(issue.number, issue.labels);
  }
}

async function reconcileOrphanedPrs(issueNumber: number): Promise<void> {
  // GitHub's search API is best-effort even with a quoted phrase — this
  // action is destructive (closes a PR), so re-verify the literal substring
  // in code rather than trusting the search match alone. A PR #32/#51/#53
  // incident (issue #154 follow-up) got closed against the wrong issue
  // number purely from a search false-positive; never repeat that.
  const closesRe = new RegExp(`closes\\s+#${issueNumber}\\b`, "i");
  const candidates = (await ghPrListClosingIssue(issueNumber, "number,body", "open")) as ListedPr[];
  const prs = candidates.filter((pr) => closesRe.test(pr.body));
  for (const pr of prs) {
    console.log(`[reconcile] issue #${issueNumber} is closed but PR #${pr.number} is still open — closing as superseded`);
    await ghPrClose(
      pr.number,
      `Closing — issue #${issueNumber} this PR targets is already closed (resolved by different work). If that's wrong, reopen and relink.`
    );
  }
}

async function stripStaleLabels(issueNumber: number, labels: { name: string }[]): Promise<void> {
  const transient = labels.map((l) => l.name).filter((n) => n.startsWith("status:"));
  for (const label of transient) {
    console.log(`[reconcile] issue #${issueNumber} is closed but still wears ${label} — removing`);
    await ghIssueEdit(issueNumber, { removeLabel: label });
  }
}

function lookbackDate(): string {
  const d = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60_000);
  return d.toISOString().slice(0, 10);
}

main().catch((err) => {
  console.error("[reconcile] unhandled error:", err);
  process.exitCode = 1;
});
