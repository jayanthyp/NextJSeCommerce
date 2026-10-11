/**
 * The locked spec (stage 3 output): its schema, the structural rules that
 * make parallel subagents safe, the spec.md rendering, and the hash lock.
 *
 * spec.json is the source of truth (Jev questions and subagent tasks are
 * derived from it); spec.md is rendered from it for humans. Both are
 * committed under docs/specs/issue-<n>/ on the feature branch, and the
 * sha256 of spec.json is recorded in a trusted `spec-lock` issue marker so a
 * later edit to the file — by a subagent or anyone with push access — is
 * detected before review.
 */
import { createHash } from "node:crypto";
import { z } from "zod/v4";
import { MAX_PARALLEL_WORKERS, PROTECTED_PATH_RE } from "./config.js";
import { E2E_SPEC_RE, UNIT_TEST_RE, isWorkflowOnlyChange } from "./edits.js";

export const SpecSchema = z.object({
  title: z.string().describe("Short title of the feature or fix"),
  objective: z.string().describe("What we are building and why, and who benefits"),
  rootCause: z.string().nullable().describe("Bug issues only: the mechanism behind the symptom. null for features."),
  assumptions: z.array(z.string()).describe("Assumptions carried over from Grill-me, stated explicitly"),
  techStack: z.string(),
  commands: z.object({ test: z.array(z.string()), build: z.array(z.string()) }),
  fileStructure: z
    .array(z.object({ path: z.string(), action: z.enum(["create", "modify"]), purpose: z.string() }))
    .describe("Every file the change creates or modifies — nothing else may be touched"),
  dataTypes: z
    .array(z.object({ name: z.string(), location: z.string(), definition: z.string().describe("The TypeScript declaration") }))
    .describe("Shared types and contracts parallel tasks code against"),
  codeStyle: z.string().describe("Conventions to follow, with a short example from the existing code"),
  testing: z.object({
    strategy: z.string(),
    requiredTests: z.array(z.object({ path: z.string(), verifies: z.string() })),
  }),
  ui: z
    .object({ desktop: z.string(), mobile: z.string(), designSystem: z.string(), breakpoints: z.string(), interactiveStates: z.string() })
    .nullable()
    .describe("UI-facing changes only; null otherwise"),
  boundaries: z.object({ always: z.array(z.string()), askFirst: z.array(z.string()), never: z.array(z.string()) }),
  acceptanceCriteria: z
    .array(z.object({ id: z.string().describe("AC1, AC2, …"), statement: z.string().describe("Binary, verifiable from the diff") }))
    .describe("Strict yes/no criteria; each becomes a Jev question"),
  errorHandling: z
    .array(z.object({ case: z.string(), expectedBehavior: z.string() }))
    .describe("Each failure case the code must handle, and exactly how; each becomes a Jev question"),
  tasks: z
    .array(
      z.object({
        id: z.string().describe("T1, T2, …"),
        title: z.string(),
        domain: z.string().describe("e.g. medusa-workflow, storefront-component, tests"),
        model: z.enum(["sonnet", "haiku"]),
        files: z.array(z.string()),
        instructions: z.string(),
        dependsOn: z.array(z.string()),
      })
    )
    .describe(`1-${MAX_PARALLEL_WORKERS} parallel subagent tasks with disjoint file ownership`),
  openQuestions: z.array(z.string()).describe("Decisions still needed from the owner; non-empty means the spec is not locked"),
});

export type Spec = z.infer<typeof SpecSchema>;
export type SpecTask = Spec["tasks"][number];

/** Structural rules a spec must satisfy before it can be locked. Empty array = valid. */
export function specProblems(spec: Spec, isBug: boolean): string[] {
  if (spec.openQuestions.length > 0) return []; // not going to be locked — no point policing structure
  const problems: string[] = [];
  const files = spec.fileStructure.map((f) => f.path);
  const fileSet = new Set(files);

  if (files.length === 0) problems.push("fileStructure is empty.");
  if (fileSet.size !== files.length) problems.push("fileStructure lists a path more than once.");
  for (const p of files) {
    if (p.startsWith("/") || p.includes("..") || p.includes("\\")) problems.push(`fileStructure path "${p}" must be a repo-relative POSIX path.`);
    if (PROTECTED_PATH_RE.test(p)) problems.push(`"${p}" is part of the pipeline's control plane or locked spec — that change needs a human, not a subagent.`);
  }

  if (spec.tasks.length < 1 || spec.tasks.length > MAX_PARALLEL_WORKERS) problems.push(`tasks must have 1-${MAX_PARALLEL_WORKERS} entries (has ${spec.tasks.length}).`);
  const ids = spec.tasks.map((t) => t.id);
  if (new Set(ids).size !== ids.length) problems.push("task ids must be unique.");
  const owner = new Map<string, string>();
  for (const t of spec.tasks) {
    if (t.files.length === 0) problems.push(`task ${t.id} owns no files.`);
    for (const f of t.files) {
      if (!fileSet.has(f)) problems.push(`task ${t.id} owns "${f}", which is not in fileStructure.`);
      const prev = owner.get(f);
      if (prev && prev !== t.id) problems.push(`"${f}" is owned by both ${prev} and ${t.id} — file ownership must be disjoint.`);
      owner.set(f, t.id);
    }
    for (const d of t.dependsOn) if (!ids.includes(d) || d === t.id) problems.push(`task ${t.id} depends on unknown task "${d}".`);
  }
  for (const f of files) if (!owner.has(f)) problems.push(`"${f}" in fileStructure is not owned by any task.`);
  if (problems.length === 0 && waves(spec) === null) problems.push("task dependsOn graph has a cycle.");

  if (spec.acceptanceCriteria.length === 0) problems.push("acceptanceCriteria is empty.");
  if (new Set(spec.acceptanceCriteria.map((a) => a.id)).size !== spec.acceptanceCriteria.length) problems.push("acceptance criterion ids must be unique.");
  for (const t of spec.testing.requiredTests) {
    if (!fileSet.has(t.path)) problems.push(`required test "${t.path}" is not in fileStructure.`);
    if (!UNIT_TEST_RE.test(t.path) && !E2E_SPEC_RE.test(t.path)) {
      problems.push(
        `required test "${t.path}" would never run. Name it storefront/src/**/*.test.ts(x) (Vitest), medusa/src/**/__tests__/**/*.unit.spec.ts (Jest unit), or storefront/tests/e2e/*.spec.ts (Playwright).`
      );
    }
  }

  if (isBug) {
    if (!spec.rootCause?.trim()) problems.push("Bug issues must set rootCause: the mechanism behind the symptom.");
    const hasUnitTest = spec.testing.requiredTests.some((t) => UNIT_TEST_RE.test(t.path));
    if (!hasUnitTest && !isWorkflowOnlyChange(files)) {
      problems.push(
        "Bug issues need a reproduction unit test in testing.requiredTests that fails on the current code, in the same layer as the root cause: storefront/src/**/*.test.ts(x) for UI, medusa/src/**/__tests__/**/*.unit.spec.ts for backend/config. Only infra-only fixes (.github/workflows, scripts/*.sh) are exempt."
      );
    }
  }
  return problems;
}

export function specSchemaFor(isBug: boolean) {
  return SpecSchema.superRefine((spec, ctx) => {
    for (const message of specProblems(spec, isBug)) ctx.addIssue({ code: "custom", message });
  });
}

/** Tasks grouped into dependency waves (each wave runs in parallel); null on a cycle. */
export function waves(spec: Pick<Spec, "tasks">): SpecTask[][] | null {
  const remaining = new Map(spec.tasks.map((t) => [t.id, t]));
  const done = new Set<string>();
  const result: SpecTask[][] = [];
  while (remaining.size > 0) {
    const wave = [...remaining.values()].filter((t) => t.dependsOn.every((d) => done.has(d)));
    if (wave.length === 0) return null;
    for (const t of wave) {
      remaining.delete(t.id);
      done.add(t.id);
    }
    result.push(wave);
  }
  return result;
}

/** spec.json exactly as committed — the bytes the lock hash covers. */
export const serializeSpec = (spec: Spec): string => `${JSON.stringify(spec, null, 2)}\n`;

export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

export interface SpecLock {
  branch: string;
  sha256: string;
}

const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- (none)");

/** Human-readable spec.md, following agent-skills' spec template sections. */
export function renderSpecMarkdown(spec: Spec, issueNumber: number): string {
  const lines = [
    `# Spec: ${spec.title}`,
    "",
    `> Locked spec for #${issueNumber}. Generated from \`spec.json\` (the hashed source of truth) — edit neither by hand; a change means a new spec.`,
    "",
    "## Objective",
    spec.objective,
    ...(spec.rootCause ? ["", `**Root cause:** ${spec.rootCause}`] : []),
    "",
    "## Assumptions",
    list(spec.assumptions),
    "",
    "## Tech Stack",
    spec.techStack,
    "",
    "## Commands",
    "```",
    ...spec.commands.build.map((c) => `Build: ${c}`),
    ...spec.commands.test.map((c) => `Test: ${c}`),
    "```",
    "",
    "## Project Structure",
    "| File | Action | Purpose |",
    "| --- | --- | --- |",
    ...spec.fileStructure.map((f) => `| \`${f.path}\` | ${f.action} | ${f.purpose} |`),
    "",
    "## Data Types",
    ...(spec.dataTypes.length
      ? spec.dataTypes.flatMap((d) => [`### ${d.name} — \`${d.location}\``, "```ts", d.definition, "```"])
      : ["(none)"]),
    "",
    "## Code Style",
    spec.codeStyle,
    "",
    "## Testing Strategy",
    spec.testing.strategy,
    "",
    ...spec.testing.requiredTests.map((t) => `- \`${t.path}\` — ${t.verifies}`),
    ...(spec.ui
      ? [
          "",
          "## UI",
          `**Desktop (>1024px):** ${spec.ui.desktop}`,
          "",
          `**Mobile (<768px):** ${spec.ui.mobile}`,
          "",
          `**Design system:** ${spec.ui.designSystem}`,
          "",
          `**Breakpoints:** ${spec.ui.breakpoints}`,
          "",
          `**Interactive states:** ${spec.ui.interactiveStates}`,
        ]
      : []),
    "",
    "## Boundaries",
    `- **Always:** ${spec.boundaries.always.join("; ") || "—"}`,
    `- **Ask first:** ${spec.boundaries.askFirst.join("; ") || "—"}`,
    `- **Never:** ${spec.boundaries.never.join("; ") || "—"}`,
    "",
    "## Success Criteria",
    ...spec.acceptanceCriteria.map((a) => `- [ ] **${a.id}** ${a.statement}`),
    "",
    "### Error handling",
    ...(spec.errorHandling.length ? spec.errorHandling.map((e) => `- **${e.case}:** ${e.expectedBehavior}`) : ["- (none)"]),
    "",
    "## Tasks (parallel subagents)",
    "| Task | Model | Files | Depends on |",
    "| --- | --- | --- | --- |",
    ...spec.tasks.map((t) => `| **${t.id}** ${t.title} | ${t.model} | ${t.files.map((f) => `\`${f}\``).join("<br>")} | ${t.dependsOn.join(", ") || "—"} |`),
    "",
  ];
  return lines.join("\n");
}
