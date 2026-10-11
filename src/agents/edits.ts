/**
 * Applying subagent edits to the working tree, and the path classes the
 * build/review gates reason about. Moved out of the old nodes.ts unchanged
 * in behaviour.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { gitDiscardChanges } from "./tools.js";

/** One search/replace edit produced by a subagent. An empty `search` creates the file. */
export interface CodeChange {
  path: string;
  search: string;
  replace: string;
}

/** A unit-test file path (Vitest/Jest), as opposed to source. */
export const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;

/** A storefront Playwright spec. */
export const E2E_SPEC_RE = /^storefront\/tests\/e2e\/.*\.spec\.(ts|tsx)$/;

/**
 * A test `npm run test:unit` actually runs: storefront Vitest includes only
 * `src/**\/*.test.{ts,tsx}`; medusa's Jest (TEST_TYPE=unit) matches only
 * `src/**\/__tests__/**\/*.unit.spec.[jt]s`. A test named any other way is
 * silently never executed — so it can't prove a fix, or reproduce a bug.
 */
export const UNIT_TEST_RE = /^(storefront\/src\/.*\.test\.tsx?|medusa\/src\/(.*\/)?__tests__\/.*\.unit\.spec\.[jt]s)$/;

/**
 * Infra/CI-only surfaces with no meaningful test path under storefront/src or
 * medusa/src — a fix here can't produce a test that fails on unfixed code
 * (issues #141/#142 tripped the circuit breaker for exactly this reason).
 */
export const WORKFLOW_ONLY_RE = /^(\.github\/workflows\/.*\.ya?ml|scripts\/.*\.sh)$/;

export const isWorkflowOnlyChange = (paths: string[]): boolean => paths.length > 0 && paths.every((p) => WORKFLOW_ONLY_RE.test(p));

/**
 * Applies edits in order. Throws (with a message meant for the model) on a
 * search that doesn't match, a create over existing content, or a no-op.
 * Genuinely new paths are appended to `created` so a discard can remove them.
 */
export function applyCodeChanges(changes: CodeChange[], created: string[]): void {
  for (const change of changes) {
    const isCreate = change.search.trim() === "";
    let content: string | null;
    try {
      content = readFileSync(change.path, "utf-8");
    } catch {
      content = null; // file doesn't exist yet
    }

    if (isCreate) {
      // An empty "search" means "write the whole file" — valid for a new path
      // OR an existing-but-empty stub (issue #35's 0-byte quick-add-button.tsx
      // deadlocked when that was rejected). Only refuse to clobber real content.
      if (content !== null && content.trim() !== "") {
        throw new Error(
          `Cannot create ${change.path}: the file already exists with content. Use a search/replace edit (non-empty "search") to modify it.`
        );
      }
      mkdirSync(dirname(change.path), { recursive: true });
      writeFileSync(change.path, change.replace, "utf-8");
      // An existing empty file is tracked by git, so a discard restores it on
      // its own; deleting it on discard would remove a real file.
      if (content === null) created.push(change.path);
      continue;
    }

    if (content === null) {
      throw new Error(`Cannot edit ${change.path}: the file does not exist. To create it, leave "search" empty and put the whole file in "replace".`);
    }
    if (!content.includes(change.search)) {
      throw new Error(`Search text not found in ${change.path} — copy "search" verbatim from the current content.\nSearch: ${change.search.slice(0, 200)}`);
    }
    const next = content.replace(change.search, change.replace);
    if (next === content) {
      throw new Error(`No-op edit in ${change.path}: "replace" is identical to "search". Make the actual change.`);
    }
    writeFileSync(change.path, next, "utf-8");
  }
}

/** Reverts tracked changes and deletes files this build created (`git checkout -- .` leaves untracked files behind). */
export async function discardChanges(created: string[]): Promise<void> {
  await gitDiscardChanges();
  for (const p of created) rmSync(p, { force: true });
  created.length = 0;
}
