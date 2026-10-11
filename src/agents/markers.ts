/**
 * Durable cross-run state, stored where the rest of the state model already
 * lives (state.ts): hidden HTML-comment markers in GitHub issue comments,
 * e.g. `<!-- sdlc:jev-verdict {"sha":"…","pass":true} -->`.
 *
 * A marker gates real actions (a pass verdict lets Ship merge), and anyone
 * with repo access can post a comment — so only markers authored by the
 * pipeline's own identity or the repo owner are ever read back.
 */
import { REPO_OWNER_LOGIN } from "./config.js";

const TRUSTED_AUTHORS = new Set(
  ["github-actions", "github-actions[bot]", REPO_OWNER_LOGIN, ...(process.env.PIPELINE_BOT_LOGINS ?? "").split(",")]
    .map((s) => s.trim())
    .filter(Boolean)
);

export const isTrustedAuthor = (login: string): boolean => TRUSTED_AUTHORS.has(login);

export type MarkerName = "grill-round" | "grill-resolved" | "spec-lock" | "jev-verdict" | "qa-verdict";

interface Comment {
  author: { login: string };
  body: string;
  createdAt?: string;
}

export const marker = (name: MarkerName, data: object): string => `<!-- sdlc:${name} ${JSON.stringify(data)} -->`;

/** Trusted markers of `name`, oldest first, with the index of the comment carrying each. */
export function readMarkers<T>(comments: Comment[], name: MarkerName): { data: T; commentIndex: number }[] {
  const re = new RegExp(`<!-- sdlc:${name} (\\{.*?\\}) -->`);
  const found: { data: T; commentIndex: number }[] = [];
  comments.forEach((c, commentIndex) => {
    if (!TRUSTED_AUTHORS.has(c.author.login)) return;
    const m = c.body.match(re);
    if (!m?.[1]) return;
    try {
      found.push({ data: JSON.parse(m[1]) as T, commentIndex });
    } catch {
      // malformed marker — ignore
    }
  });
  return found;
}

export const latestMarker = <T>(comments: Comment[], name: MarkerName): T | null => readMarkers<T>(comments, name).at(-1)?.data ?? null;

/** Index of the owner's most recent comment, or -1. Budgets (e.g. Jev rounds) reset when the owner weighs in. */
export function lastOwnerCommentIndex(comments: Comment[]): number {
  for (let i = comments.length - 1; i >= 0; i--) {
    if (comments[i]?.author.login === REPO_OWNER_LOGIN && !comments[i]?.body.includes("<!-- sdlc:")) return i;
  }
  return -1;
}

/** Whether the most recent comment is a genuine reply from the owner (not a pipeline comment). */
export function hasOwnerReplySince(comments: Comment[]): boolean {
  const last = comments.at(-1);
  return !!last && last.author.login === REPO_OWNER_LOGIN && !last.body.includes("<!-- sdlc:");
}
