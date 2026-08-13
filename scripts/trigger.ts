#!/usr/bin/env node
/**
 * Entry point invoked by .github/workflows/langgraph-agent.yml on every
 * issues/issue_comment webhook: `npx tsx scripts/trigger.ts --issue <n>
 * --event <event_name> --action <action>`.
 *
 * Deliberately does NOT trust the triggering event's label/comment payload
 * for routing — it re-fetches the issue's live labels via `gh issue view`
 * and lets graph.ts's conditional edges route from that, per the "GitHub is
 * the source of truth" state model (see state.ts / the migration plan).
 * --event/--action are accepted for logging only.
 */
import { graph } from "../src/agents/graph.js";
import { ghIssueView } from "../src/agents/tools.js";

function parseArgs(argv: string[]): { issue: number; event: string; action: string } {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const issueRaw = get("--issue");
  if (!issueRaw) throw new Error("Usage: trigger.ts --issue <n> [--event <name>] [--action <action>]");
  return {
    issue: Number(issueRaw),
    event: get("--event") ?? "unknown",
    action: get("--action") ?? "unknown",
  };
}

async function main(): Promise<void> {
  const { issue, event, action } = parseArgs(process.argv.slice(2));
  console.log(`[trigger] issue=#${issue} event=${event} action=${action} — fetching live label state`);

  const ghIssue = await ghIssueView(issue);
  const statusLabel = ghIssue.labels.map((l) => l.name).find((n) => n.startsWith("status:"));
  if (!statusLabel) {
    console.log(`[trigger] issue #${issue} has no status:* label — nothing to route, exiting cleanly`);
    return;
  }

  console.log(`[trigger] routing on currentLabel=${statusLabel}`);
  const result = await graph.invoke(
    { issueNumber: issue, currentLabel: statusLabel },
    { configurable: { thread_id: String(issue) } }
  );
  console.log(`[trigger] run complete. Final currentLabel=${result.currentLabel}`);
}

main().catch((err) => {
  console.error("[trigger] unhandled error:", err);
  process.exitCode = 1;
});
