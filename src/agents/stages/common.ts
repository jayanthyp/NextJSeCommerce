/** Helpers shared by more than one stage. */
import { readFileSync } from "node:fs";
import { specDir } from "../config.js";
import { SpecSchema, sha256, type Spec, type SpecLock } from "../spec.js";
import { formatBlockingComment, ghIssueComment, gitShowFile, relabel, type GhIssue } from "../tools.js";

/** Bug issues get the reproduce-first rules (rootCause + a failing test before the fix). */
export function isBugIssue(issue: Pick<GhIssue, "labels" | "title">): boolean {
  return issue.labels.some((l) => l.name === "bug") || /^bug\s*:/i.test(issue.title);
}

/**
 * The locked spec, verified against its lock hash. Reads the working tree by
 * default, or a ref (e.g. a PR head) when given. Returns an error string
 * instead of throwing — a missing or edited spec is a routing decision.
 */
export async function loadLockedSpec(issueNumber: number, lock: SpecLock, ref?: string): Promise<{ spec: Spec } | { error: string }> {
  const path = `${specDir(issueNumber)}/spec.json`;
  let text: string | null;
  if (ref) {
    text = await gitShowFile(ref, path);
  } else {
    try {
      text = readFileSync(path, "utf-8");
    } catch {
      text = null;
    }
  }
  if (text === null) return { error: `${path} is missing on ${ref ?? lock.branch}.` };
  if (sha256(text) !== lock.sha256) return { error: `${path} no longer matches the hash locked on the issue — it was edited after locking.` };
  const parsed = SpecSchema.safeParse(JSON.parse(text));
  return parsed.success ? { spec: parsed.data } : { error: `${path} does not match the spec schema: ${parsed.error.message}` };
}

/** The issue thread as prompt context, newest kept when it must be cut. */
export function renderThread(comments: GhIssue["comments"], maxChars = 30_000): string {
  const text = comments.map((c) => `--- ${c.author.login} (${c.createdAt}) ---\n${c.body}`).join("\n\n");
  return text.length > maxChars ? `…(earlier comments omitted)\n${text.slice(-maxChars)}` : text;
}

/** Posts the standard 📌/🔘/✍️ blocking comment and moves the issue to `to`. */
export async function block(issueNumber: number, from: string, to: string, reason: string, options: string[], header?: string): Promise<void> {
  await ghIssueComment(issueNumber, formatBlockingComment(reason, options, header));
  await relabel(issueNumber, from, to);
}
