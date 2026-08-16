/**
 * The five SDLC roles as LangGraph nodes. Each is a faithful port of its
 * source-of-truth .md file (see the migration plan's "Decisions already
 * made" section) — not a reinvention. Tool-First: every gh/git/npm/docker
 * call goes through tools.ts via child_process; the LLM (ChatAnthropic) is
 * invoked only for reasoning — formatting a spec, generating/fixing code,
 * and the SOLID/VPS-resource audit — never for arbitrary bash scripting.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { interrupt } from "@langchain/langgraph";
import { ChatAnthropic } from "@langchain/anthropic";
import { tool as makeTool } from "@langchain/core/tools";
import { z } from "zod";
import * as ts from "typescript";
import type { AgenticSdlcStateType, CodeChange } from "./state.js";
import {
  ghIssueView,
  ghIssueEdit,
  ghIssueComment,
  ghIssueCreate,
  ghPrList,
  ghPrDiff,
  ghPrFiles,
  ghPrChecks,
  ghPrCreate,
  ghPrComment,
  ghPrReviewComment,
  ghRunWatch,
  ghWorkflowRun,
  ghRunListLatestIdOrNull,
  ghRunWaitForNewId,
  ghWorkflowRunAndGetId,
  gitCheckout,
  gitAdd,
  gitCommit,
  gitPush,
  gitListFiles,
  gitDiffSummary,
  gitDiscardChanges,
  runTechLeadApprove,
  runTechLeadMerge,
  runTechLeadRollback,
  runNpmScript,
  runPlaywright,
  dockerComposeUp,
  dockerComposeDown,
  dockerComposeSeed,
  dockerComposeIsHealthy,
  dockerComposeLogs,
  dockerComposeGetPublishableKey,
  dockerComposeRebuildStorefront,
  formatBlockingComment,
  formatQaReport,
} from "./tools.js";

const MAX_DEV_LOOP_ATTEMPTS = 5;

// Dev↔QA round-trips allowed before a persistent E2E failure is escalated to
// tech-lead instead of looping back through dev-loop. Satisfies the autonomy
// requirement of "at least thrice on each side": quality-analyst hands back to
// dev-loop for MAX_QA_ROUNDS consecutive E2E failures, then the next failure
// escalates to tech-lead (status:blocked).
const MAX_QA_ROUNDS = 3;

/**
 * Single place every node instantiates its LLM from. Provider is chosen by
 * env vars, so switching between Claude and DeepSeek (the repo's fallback
 * provider when Anthropic credit is exhausted) is a pure environment flip —
 * no code change, mirroring the `~/.claude/settings.json` convention:
 *
 *   Claude  (default):  ANTHROPIC_API_KEY = real Anthropic Console key
 *                       (leave ANTHROPIC_BASE_URL unset)
 *   DeepSeek:            ANTHROPIC_API_KEY = DeepSeek key
 *                       ANTHROPIC_BASE_URL = https://api.deepseek.com/anthropic
 *                       ANTHROPIC_MODEL    = deepseek-v4-pro
 *
 * DeepSeek exposes an Anthropic-compatible Messages endpoint, so
 * `@langchain/anthropic` talks to it unchanged — only the base URL, model
 * name, and key change, all three together (an Anthropic key sent to the
 * DeepSeek endpoint, or vice-versa, fails auth).
 *
 * Use `deepseek-v4-pro` (not `deepseek-v4-pro[1m]`) and let getLlm() disable
 * thinking: DeepSeek's endpoint emits `thinking` blocks by default (adaptive
 * thinking), which leaves `res.tool_calls` empty and breaks structured
 * extraction — see getLlm()'s `thinking: { type: "disabled" }`.
 */
function getLlm(temperature = 0) {
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  return new ChatAnthropic({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
    temperature,
    // ChatAnthropic defaults maxTokens to 1024. Under DeepSeek's endpoint, a
    // large context (the dev-loop prompt carries ~17K input tokens of repo
    // source) makes the model "hedge": with only 1024 output tokens budgeted
    // it emits plain text and ends the turn (`stop_reason: end_turn`) instead
    // of committing to the `tool_use` block `extractStructured` needs, so
    // `res.tool_calls` comes back empty. A larger budget (4096) lets it emit
    // the tool call reliably (~86 output tokens for a one-line edit).
    maxTokens: 4096,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    // DeepSeek's Anthropic-compatible endpoint defaults to adaptive thinking:
    // the model emits `thinking` blocks that crowd out the `tool_use` block
    // LangChain needs, so `res.tool_calls` comes back empty and structured
    // extraction throws. Disable thinking explicitly on the DeepSeek path.
    // Claude doesn't think unless `thinking` is enabled, so leave it unset.
    ...(baseURL ? { thinking: { type: "disabled" as const }, clientOptions: { baseURL } } : {}),
  });
}

/**
 * Structured extraction that works against both Claude and DeepSeek.
 *
 * `ChatAnthropic.withStructuredOutput()` is unusable on DeepSeek's
 * Anthropic-compatible endpoint: it forces
 * `tool_choice: { type: "tool", name: "extract" }`, and DeepSeek's proxy
 * routes any *forced-tool* request to its thinking/reasoner model, which
 * rejects it (`"Thinking mode does not support this tool_choice"`). Binding
 * the tool with `tool_choice: "any"` instead sidesteps that path and is
 * accepted by both providers; we parse the emitted tool call's args ourselves.
 */
async function extractStructured<S extends z.ZodTypeAny>(
  schema: S,
  messages: unknown[],
  temperature = 0
): Promise<z.infer<S>> {
  const llm = getLlm(temperature).bindTools(
    [
      makeTool(
        async (_input: z.infer<S>) => "",
        {
          name: "extract",
          description: schema.description ?? "Return the requested structured data.",
          schema,
        } as never
      ),
    ],
    { tool_choice: "any" }
  );

  // DeepSeek occasionally emits an empty `tool_use` (no `input`) under
  // `tool_choice: "any"` — especially for large outputs like full file
  // contents — and other times emits a valid one for the identical prompt.
  // Retry with a corrective nudge up to a bounded number of times instead of
  // failing the whole graph run on a transient empty call.
  const MAX_ATTEMPTS = 3;
  let history = messages as object[];
  let lastError = "no tool call";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await llm.invoke(history as never);
    const toolCall = res.tool_calls?.[0];
    if (!toolCall) {
      lastError = "no tool call";
      history = [...history, { role: "user", content: "You did not call the extract tool. Call it with the full structured arguments." }];
      continue;
    }
    try {
      return schema.parse(toolCall.args);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      history = [
        ...history,
        {
          role: "user",
          content: `Your extract tool call was missing required fields and failed validation. Re-read the request and return the COMPLETE structured output (do not emit an empty tool call). Validation error: ${lastError}`,
        },
      ];
    }
  }
  throw new Error(`extractStructured failed after ${MAX_ATTEMPTS} attempts (${lastError})`);
}

/** Whether the most recent comment is a genuine new reply from the repo owner, not the agent's own prior comment. Mirrors tech-lead.md's / ui-designer.md's reply-detection pattern. */
function hasOwnerReplySince(comments: { author: { login: string }; body: string }[], ownerLogin: string): boolean {
  const last = comments[comments.length - 1];
  if (!last) return false;
  return last.author.login === ownerLogin;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// 1. Business Analyst Node
//
// Not wired into the label-routing table in graph.ts — see the plan's Step 4
// note. business-analyst.md is a daily-cadence, cron-driven research role
// (already covered by the existing copilot-ba-agent/ service), not something
// an issue/label/comment webhook naturally triggers. Kept here for structural
// parity with the user's 5-node spec.
// =============================================================================

const FeatureSpecSchema = z.object({
  title: z.string(),
  body: z.string().describe("Full issue body in the Feature Summary / Value Proposition / Acceptance Criteria (Gherkin) format"),
  label: z.enum(["status:ready-for-ui-work", "status:ready-for-dev"]),
});

export async function businessAnalystNode(input: { rawFeatureNotes: string }): Promise<{ issueNumber: number }> {
  const spec = await extractStructured(FeatureSpecSchema, [
    {
      role: "system",
      content:
        "You are a Senior Technical Business Analyst. Format the given raw feature notes into a BDD/Gherkin GitHub issue, and classify it status:ready-for-ui-work (visual/layout/component/animation/responsiveness changes) or status:ready-for-dev (backend/logic/integration/data/API changes).",
    },
    { role: "user", content: input.rawFeatureNotes },
  ]);
  const issueNumber = await ghIssueCreate(spec.title, spec.body, spec.label);
  return { issueNumber };
}

// =============================================================================
// 2. UI Designer Node
// =============================================================================

function readDesignContext(): string {
  const candidates = ["storefront/DESIGN.md", "storefront/tailwind.config.ts", "storefront/src/app/globals.css"];
  const parts: string[] = [];
  for (const path of candidates) {
    try {
      parts.push(`--- ${path} ---\n${readFileSync(path, "utf-8")}`);
    } catch {
      // File absent — ui-designer.md itself treats "e.g., DESIGN.md" as an
      // example, not a guarantee, so a missing file here is expected, not an error.
    }
  }
  return parts.join("\n\n");
}

const UiSpecSchema = z.object({
  needsClarity: z.boolean(),
  refinedBody: z.string().describe("Full refined issue body with Desktop/Mobile/Design-System/Breakpoint/Interactive-state sections, if needsClarity is false"),
  clarityTopic: z.string().optional(),
  clarityOptions: z
    .array(z.object({ label: z.string(), description: z.string(), pros: z.string(), cons: z.string() }))
    .optional(),
  recommendation: z.string().optional(),
});

export async function uiDesignerNode(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  const issue = await ghIssueView(state.issueNumber);
  const resuming = state.currentLabel === "status:blocked-ui-work-need-clarity";

  if (resuming) {
    const ownerLogin = process.env.REPO_OWNER_LOGIN ?? "jayanthyp";
    if (!hasOwnerReplySince(issue.comments, ownerLogin)) {
      return {}; // no genuine reply yet — leave alone, matching Workflow C step 1
    }
    await ghIssueEdit(state.issueNumber, {
      addLabel: "status:ui-requirement-refinement-in-progress",
      removeLabel: "status:blocked-ui-work-need-clarity",
    });
  } else {
    await ghIssueEdit(state.issueNumber, { addLabel: "status:ui-requirement-refinement-in-progress" });
  }

  const designContext = readDesignContext();
  const result = await extractStructured(UiSpecSchema, [
    {
      role: "system",
      content:
        "You are a Senior Lead UI Designer & Technical UX Architect. Refine this issue into an explicit UI technical spec covering Desktop (>1024px), Mobile (<768px), Design System Alignment, Responsive Breakpoints, and Interactive States. If genuinely ambiguous (missing visual direction, conflicting UX logic, missing content hierarchy), set needsClarity=true and provide up to 3 options with pros/cons and a recommendation instead.",
    },
    { role: "user", content: `Design system context:\n${designContext}\n\nIssue #${state.issueNumber}: ${issue.title}\n\n${issue.body}` },
  ]);

  if (result.needsClarity) {
    const comment = formatBlockingComment(
      `Need clarification on **${result.clarityTopic}** to ensure responsive integrity and theme consistency.`,
      (result.clarityOptions ?? []).map((o) => `**${o.label}:** ${o.description} — *Pros:* ${o.pros} | *Cons:* ${o.cons}`),
      "### 🎨 UI Design Clarity Required"
    );
    await ghIssueComment(state.issueNumber, comment);
    await ghIssueEdit(state.issueNumber, {
      addLabel: "status:blocked-ui-work-need-clarity",
      removeLabel: "status:ui-requirement-refinement-in-progress",
    });
    return { currentLabel: "status:blocked-ui-work-need-clarity" };
  }

  if (resuming) {
    await ghIssueComment(state.issueNumber, `✅ Applied refined spec per your reply. Promoting to status:ready-for-dev.`);
  }
  await ghIssueEdit(state.issueNumber, {
    addLabel: "status:ready-for-dev",
    removeLabel: resuming
      ? "status:blocked-ui-work-need-clarity,status:ui-requirement-refinement-in-progress"
      : "status:ready-for-ui-work,status:ui-requirement-refinement-in-progress",
  });
  return { currentLabel: "status:ready-for-dev" };
}

// =============================================================================
// 3. Dev Loop Node
// =============================================================================

const CodeChangesSchema = z.object({
  changes: z
    .array(
      z.object({
        path: z.string().describe("Exact file path (relative to repo root)"),
        search: z.string().describe("The exact existing code snippet to find (copy it verbatim, including whitespace)"),
        replace: z.string().describe("The replacement snippet — the minimal change, nothing else"),
      })
    )
    .min(1),
  summary: z.string().describe("One-paragraph summary of what changed and why, for the PR body"),
  // Bug fixes only (the reproduce-first gate). Naming the mechanism BEFORE
  // writing the fix is what prevents a no-op "fix" that reformats a line
  // without touching the actual cause (issue #121 / PR #120). Empty for
  // non-bug issues.
  rootCause: z
    .string()
    .optional()
    .describe("Bug fixes only: one sentence naming the root cause the fix addresses (e.g. \"the controlled input's `value` never updates because `onChange` does not set local state\"). Leave empty for non-bug issues."),
});

async function runDevLoopTests(): Promise<{ passed: boolean; log: string }> {
  // Unit tests only — the integration suites (test:integration:modules/http)
  // need a running Postgres, which the event-driven CI runner does not
  // provision; the repo's own test.yml CI covers them on PR open.
  const steps: { cwd: "medusa" | "storefront"; script: string }[] = [
    { cwd: "medusa", script: "test:unit" },
    { cwd: "storefront", script: "test:unit" },
  ];
  let log = "";
  for (const step of steps) {
    const r = await runNpmScript(step.cwd, step.script);
    log += `\n--- ${step.cwd}: npm run ${step.script} ---\n${r.stdout}\n${r.stderr}`;
    if (r.exitCode !== 0) return { passed: false, log };
  }
  return { passed: true, log };
}

function applyCodeChanges(changes: CodeChange[], created: string[]): void {
  for (const change of changes) {
    const isCreate = change.search.trim() === "";
    let content: string | null = null;
    try {
      content = readFileSync(change.path, "utf-8");
    } catch {
      content = null; // file doesn't exist yet
    }

    if (content === null) {
      if (!isCreate) {
        throw new Error(
          `Cannot edit ${change.path}: the file does not exist. To create a NEW file, leave "search" empty and put the entire file content in "replace".`
        );
      }
      mkdirSync(dirname(change.path), { recursive: true });
      writeFileSync(change.path, change.replace, "utf-8");
      created.push(change.path);
      continue;
    }

    if (isCreate) {
      throw new Error(
        `Cannot create ${change.path}: the file already exists. Use a search/replace edit (non-empty "search") to modify it, not an empty "search".`
      );
    }
    if (!content.includes(change.search)) {
      throw new Error(
        `Search text not found in ${change.path}. The LLM's "search" didn't match the file — retry with a verbatim copy.\nSearch: ${change.search.slice(0, 200)}`
      );
    }
    const newContent = content.replace(change.search, change.replace);
    // Guard against the model emitting an edit whose "replace" is byte-for-byte
    // the same as its "search" (a no-op that leaves the tree clean and then
    // fails at `git commit` with "nothing to commit").
    if (newContent === content) {
      throw new Error(
        `No-op edit in ${change.path}: "replace" is identical to "search", so nothing changed. Make a real edit — apply the actual change the issue asks for.`
      );
    }
    writeFileSync(change.path, newContent, "utf-8");
  }
}

/**
 * Words that carry no signal for locating a file, dropped when deriving grep
 * terms from the issue title/body.
 */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "into", "onto", "your",
  "you", "are", "was", "were", "add", "adds", "should", "when", "where",
  "which", "what", "have", "has", "will", "would", "could", "page", "pages",
  "issue", "able", "will", "not", "all", "any", "but",
]);

/** Pulls candidate grep terms out of free text, keeping the first ~10 meaningful words. */
function deriveSearchTerms(issueText: string): string[] {
  const words = issueText
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 10);
}

/**
 * Builds the repo context the dev-loop LLM reasons over, via a runtime AST
 * index (TypeScript compiler API — already a devDependency) instead of a raw
 * text dump. The old approach shipped ~40KB of full file content plus ~400
 * grep lines just to locate a single edit — that blew out the token window and
 * still mislocated the target. The AST index gives two compact halves instead:
 *
 * 1. A FULL path index (every tracked source file) — unchanged, the
 *    anti-hallucination guarantee that the model can never invent a path.
 * 2. A hybrid symbol map + targeted-node dump: parse each file, collect its
 *    declared symbols (components/hooks/classes/types with line numbers) for
 *    navigation, and extract the specific AST nodes whose JSX tag/attribute
 *    text matches the issue's terms — verbatim, with line numbers — so the
 *    model's `search` string is anchored to a real node, not a guess.
 *
 * Locating the target stays a deterministic scan (never left to the LLM); the
 * LLM's only job is the minimal search/replace against the exact text shown.
 */

/** Maps a file extension to the TS compiler's ScriptKind for parsing. */
function scriptKindFor(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (path.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** A "where things live" symbol — one top-level declared name, for navigation only. */
interface SymbolRef {
  kind: string;
  name: string;
  line: number;
}

/** Collects a file's top-level declarations into a compact symbol map. */
function collectSymbols(sf: ts.SourceFile): SymbolRef[] {
  const refs: SymbolRef[] = [];
  const classify = (name: string) => (/^use[A-Z]/.test(name) ? "hook" : /^[A-Z]/.test(name) ? "component" : "fn");
  const line = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  for (const node of sf.statements) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      refs.push({ kind: classify(node.name.text), name: node.name.text, line: line(node) });
    } else if (ts.isClassDeclaration(node) && node.name) {
      refs.push({ kind: "class", name: node.name.text, line: line(node) });
    } else if (ts.isInterfaceDeclaration(node)) {
      refs.push({ kind: "interface", name: node.name.text, line: line(node) });
    } else if (ts.isTypeAliasDeclaration(node)) {
      refs.push({ kind: "type", name: node.name.text, line: line(node) });
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const isFn = !!decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer));
        refs.push({ kind: isFn ? classify(decl.name.text) : "const", name: decl.name.text, line: line(node) });
      }
    }
  }
  return refs;
}

/** A verbatim AST node whose text matches the issue's terms, for the targeted-node dump. */
interface NodeMatch {
  file: string;
  line: number;
  text: string;
  score: number;
}

/**
 * Walks a file's AST for JSX nodes whose tag / attribute text matches the
 * issue's terms, emitting their verbatim source text + line number. Matching on
 * tag names (not raw text) is what fixes the old "img" → role="img"
 * false-positive: a <svg role="img"> icon has tag "svg", so it no longer
 * outranks the real <Image> elements in the product thumbnail.
 */
function collectMatchingNodes(sf: ts.SourceFile, file: string, terms: string[], out: NodeMatch[]): void {
  const lowerTerms = terms.map((t) => t.toLowerCase());
  const matchesTerm = (s: string) => {
    const l = s.toLowerCase();
    return lowerTerms.some((t) => l.includes(t) || t.includes(l));
  };

  const emit = (node: ts.Node, score: number) => {
    const text = sf.text.slice(node.getStart(sf), node.getEnd()).trim();
    if (!text || text.length > 2000) return; // skip whole-component-body spans
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    out.push({ file, line, text, score });
  };

  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      // JsxElement nests tagName/attributes under `openingElement`; the
      // self-closing form flattens them onto the node itself.
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (ts.isIdentifier(opening.tagName)) {
        if (matchesTerm(opening.tagName.text)) {
          emit(node, 3);
        } else {
          for (const a of opening.attributes.properties) {
            if (ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && matchesTerm(a.name.text)) {
              emit(node, 2);
              break;
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

async function readRepoContext(issueText: string): Promise<string> {
  // Root-level config files (medusa-config.ts, instrumentation.ts) live
  // OUTSIDE medusa/src, so "medusa/src" alone never surfaces them — a bug
  // whose root cause is in medusa-config.ts (e.g. #129's MeiliSearch
  // searchableAttributes) was never shown that file's actual content, only
  // referenced in comments, so the model couldn't produce a verbatim
  // search/replace edit or a real assertion test against it.
  const files = await gitListFiles(["storefront/src", "medusa/src", "medusa/*.ts"]);
  const source = files.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
  const terms = deriveSearchTerms(issueText);

  const pathIndex = source.map((f) => `- ${f}`).join("\n");

  // Parse every file once, collecting symbols + term-matching nodes. Parsing
  // ~337 files takes a couple of seconds — negligible next to the docker-build
  // dominated run, and always fresh (no committed index to drift).
  const symbolByFile = new Map<string, SymbolRef[]>();
  const nodeMatches: NodeMatch[] = [];
  for (const file of source) {
    let text: string;
    try {
      text = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, scriptKindFor(file));
    symbolByFile.set(file, collectSymbols(sf));
    collectMatchingNodes(sf, file, terms, nodeMatches);
  }

  // Rank files by matching-node density + component-dir boost + path-term
  // boost. A file with many matching JSX nodes (a real product-image component)
  // ranks above one with a lone incidental match.
  const CODE_DIR = /\/(components|templates|models|services|api|jobs|scripts|lib)\//;
  const score = new Map<string, number>();
  for (const m of nodeMatches) score.set(m.file, (score.get(m.file) ?? 0) + m.score);
  const rank = (file: string) =>
    (score.get(file) ?? 0) + (CODE_DIR.test(file) ? 5 : 0) + (terms.some((t) => file.toLowerCase().includes(t)) ? 3 : 0);
  const relevantFiles = new Set<string>(score.keys());
  for (const file of source) {
    if (terms.some((t) => file.toLowerCase().includes(t))) relevantFiles.add(file);
  }
  const ranked = [...relevantFiles].sort((a, b) => rank(b) - rank(a) || a.localeCompare(b));

  // Symbol map: declarations from the top-ranked files — navigation aid only.
  const MAX_SYMBOL_FILES = 20;
  const symbolLines: string[] = [];
  for (const file of ranked.slice(0, MAX_SYMBOL_FILES)) {
    const syms = symbolByFile.get(file) ?? [];
    if (!syms.length) continue;
    symbolLines.push(`### ${file}`);
    for (const s of syms.slice(0, 25)) symbolLines.push(`  L${s.line} ${s.kind} ${s.name}`);
  }

  // Targeted node dump: the top matching nodes, verbatim, with file + line.
  const MAX_NODES = 12;
  nodeMatches.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line);
  const seen = new Set<string>();
  const nodeLines: string[] = [];
  for (const m of nodeMatches) {
    const key = `${m.file}:${m.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    nodeLines.push(`### ${m.file}:${m.line}\n${m.text}`);
    if (nodeLines.length >= MAX_NODES) break;
  }

  return [
    "## File path index (every tracked source file — use an exact path from this list, never invent one):",
    pathIndex,
    "",
    "## Symbol map (declarations in the files most relevant to this issue):",
    symbolLines.join("\n") || "(none matched)",
    "",
    "## Targeted nodes (verbatim code matching the issue — copy your `search` from one of these exactly):",
    nodeLines.join("\n\n") || "(none matched)",
  ].join("\n");
}

/**
 * Writes a throwaway local `.env` so the QA node's docker-compose stack has the
 * env vars it references (the real `.env` is gitignored and absent in CI).
 * Values are fixed test placeholders — the stack is ephemeral and torn down
 * after the run, so no real secrets are involved.
 */
async function writeLocalEnv(): Promise<void> {
  const env = [
    "STORE_DOMAIN=localhost",
    "API_DOMAIN=localhost",
    "ACME_EMAIL=dev@localhost",
    "POSTGRES_USER=medusa",
    "POSTGRES_PASSWORD=medusa",
    "POSTGRES_DB=medusa",
    "REDIS_URL=redis://redis:6379",
    "MEILI_MASTER_KEY=0123456789abcdef0123456789abcdef",
    "JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "COOKIE_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "MEDUSA_WORKER_MODE=shared",
    "MEDUSA_BACKEND_URL=http://localhost:9000",
    "STORE_CORS=http://localhost:3000",
    "ADMIN_CORS=http://localhost:9000",
    "AUTH_CORS=http://localhost:3000",
    "NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000",
    "NEXT_PUBLIC_BASE_URL=http://localhost:3000",
    "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_test_placeholder",
    "REVALIDATE_SECRET=test-revalidate",
    "",
  ].join("\n");
  writeFileSync(".env", env, "utf-8");
}

/** Updates the .env with the real publishable key fetched after seeding. */
function updateLocalEnvPublishableKey(key: string): void {
  let env = readFileSync(".env", "utf-8");
  if (/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=/m.test(env)) {
    env = env.replace(/^NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=.*$/m, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${key}`);
  } else {
    env += `\nNEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=${key}\n`;
  }
  writeFileSync(".env", env, "utf-8");
}

/**
 * Builds the context dev-loop reasons over when it re-enters after a QA E2E
 * failure: the failure log itself, plus the content of every e2e spec file the
 * log names. Without the spec content the model can't see what the failing test
 * actually asserts, so it would just guess at the source (the same hallucination
 * class that broke the path-index case earlier).
 */
async function readE2eFailureContext(log: string): Promise<string> {
  const specPaths = [...new Set((log.match(/[a-zA-Z0-9_/\-]+\.spec\.(ts|tsx)/g) ?? []))];
  const parts: string[] = [`\n\n## Quality-analyst E2E failure (fix this):\nThe issue's change is already committed — do NOT remove or revert it. Only make a NEW edit if the failure below is demonstrably caused by your change; otherwise leave the code as-is.\n\`\`\`\n${log.slice(-4000)}\n\`\`\``];
  for (const p of specPaths) {
    const full = p.startsWith("storefront/") ? p : `storefront/${p}`;
    try {
      parts.push(`\n=== ${full} ===\n${readFileSync(full, "utf-8")}`);
    } catch {
      // A spec path taken from the log may not exist verbatim on disk — skip.
    }
  }
  return parts.join("\n");
}

/**
 * Templates the dev-loop LLM reasons over when QA hands back "author a spec":
 * a representative spec + the page objects/fixtures it imports, plus the list
 * of existing spec filenames so the model follows the repo's naming/coverage
 * convention and reuses real testids instead of inventing new ones.
 */
async function readSpecTemplateContext(): Promise<string> {
  const parts: string[] = [];
  const templates = [
    "storefront/tests/e2e/frequently-bought-together.spec.ts",
    "storefront/tests/e2e/pages/product-page.ts",
    "storefront/tests/e2e/pages/cart-page.ts",
    "storefront/tests/e2e/fixtures/test-data.ts",
  ];
  for (const p of templates) {
    try {
      parts.push(`--- ${p} ---\n${readFileSync(p, "utf-8")}`);
    } catch {
      // An absent template is non-fatal — the model can still infer structure.
    }
  }
  try {
    const existing = (await gitListFiles(["storefront/tests/e2e"])).filter((f) => /\.spec\.(ts|tsx)$/.test(f));
    parts.push(`--- existing spec files (follow this naming, avoid duplicating a test) ---\n${existing.join("\n")}`);
  } catch {
    // ignore
  }
  return parts.join("\n\n");
}

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx)$/;

/** True when the issue is a bug — the reproduce-first gate applies, unlike a feature. */
function isBugIssue(issue: { labels: { name: string }[]; title: string }): boolean {
  return issue.labels.some((l) => l.name === "bug") || /^bug\s*:/i.test(issue.title);
}

export async function devLoopNode(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  const issue = await ghIssueView(state.issueNumber);
  await ghIssueEdit(state.issueNumber, {
    addLabel: "status:in-progress",
    removeLabel: "status:ready-for-dev",
  });

  // Re-entry check (dev-loop.md step 2): an existing open PR means this is a
  // resumed/re-entered issue (e.g. tech-lead handed a resolved status:blocked
  // issue back), not fresh work.
  const existingPrs = (await ghPrList(`Closes #${state.issueNumber} in:body`, "number,headRefName")) as {
    number: number;
    headRefName: string;
  }[];
  const existingPr = existingPrs[0];
  const branch = existingPr?.headRefName ?? `feature/issue-${state.issueNumber}-langgraph`;

  if (existingPr) {
    await gitCheckout(branch);
  } else {
    await gitCheckout(branch, { create: true });
  }

  const commentsText = issue.comments.map((c) => `${c.author.login}: ${c.body}`).join("\n\n");
  const repoContext = await readRepoContext(`${issue.title}\n${issue.body}`);
  // QA-failure re-entry: quality-analyst hands back here with the E2E failure
  // log in state (see routeAfterQualityAnalyst). Surface it — plus the failing
  // spec file — so the model targets the actual E2E failure, not just the issue.
  const authorSpec = state.qaHandoffAuthorSpec === true;
  const isBug = !authorSpec && isBugIssue(issue);
  const qaFailureLog = state.testResults && !state.testResults.passed ? state.testResults.log : null;
  let qaContext = "";
  if (state.qaHandoffMessage) {
    qaContext = `\n\n## Quality-analyst hand-off:\n${state.qaHandoffMessage}\n`;
  }
  if (authorSpec) {
    qaContext += `\n\n## Author a spec — use these existing specs/page objects as templates (reuse imports, fixtures, and real getByTestId selectors; do NOT invent new testids):\n${await readSpecTemplateContext()}\n`;
  }
  if (qaFailureLog && qaFailureLog.trim()) {
    qaContext += await readE2eFailureContext(qaFailureLog);
  }
  let attempts = 0;
  let lastError = "";
  let changes: CodeChange[] = [];
  let summary = "";
  // Paths applyCodeChanges created this attempt, so a discard on retry can
  // remove them (gitDiscardChanges' `git checkout -- .` only reverts tracked
  // files, never untracked new files).
  const created: string[] = [];
  const discard = async () => {
    await gitDiscardChanges();
    for (const p of created) {
      try {
        rmSync(p, { force: true });
      } catch {
        // already gone
      }
    }
    created.length = 0;
  };

  // The system prompt differs by mode: normal mode implements the issue's code
  // change; author-spec mode (QA handed back because the change shipped with no
  // test) must NOT touch the source — its only job is to create a spec that
  // verifies the already-committed change. Without this, the model re-edits the
  // source file and reverts the very change it's supposed to test (observed on
  // #95: dev-loop removed loading="lazy" while authoring its spec).
  const systemContent = authorSpec
    ? "You are authoring a MISSING E2E test for a change that is ALREADY committed and correct. Do NOT modify, remove, or revert ANY existing source file — the code change is already in place. Your ONLY task is to create ONE new Playwright spec file under storefront/tests/e2e/ that verifies the change.\n\nFor the new file, provide:\n- `path`: the new file path under storefront/tests/e2e/ (e.g. storefront/tests/e2e/<feature>.spec.ts).\n- `search`: the empty string \"\" (this signals a NEW file).\n- `replace`: the ENTIRE file content.\n\nThe existing specs/page objects (in the hand-off below) are your templates — reuse their imports, fixtures, and real getByTestId selectors; do NOT invent new testids.\n\nThe repository source files (current contents) are below (read-only reference — do NOT edit them):\n\n" +
      repoContext
    : "You are implementing a GitHub issue by making the SMALLEST possible code change, expressed as a search/replace edit.\n\nRules (non-negotiable):\n1. MINIMAL DIFF — change only the exact line(s) needed. Adding one attribute (e.g. loading=\"lazy\") is a one-line change.\n2. RIGHT FILE — locate the single file that actually contains the element the issue targets. If the issue is about an image, find the file with the <img>/<Image> tag and edit THAT file, not its parent wrapper.\n3. NO REFACTORING — do not rename props/imports, do not change logic, do not reformat, do not touch unrelated files.\n\nFor each edit, provide:\n- `path`: the exact file path.\n- `search`: the exact existing snippet, copied VERBATIM from the file below (including whitespace/indentation).\n- `replace`: that same snippet with ONLY the minimal change applied.\n\nThe repository source files (current contents) are below:\n\n" +
      repoContext;

  // Reproduce-first instructions for bug issues — the gate that catches a
  // "fix" which is a no-op (or which the unit suite can't see) by demanding a
  // root cause AND a test that FAILS on the current code before any code is
  // changed. PREPENDED (not appended after the ~17K-token repo dump): appending
  // it last buried the requirement and made the model return an empty `changes`
  // array — the #121 regression.
  const bugInstruction = isBug
    ? `BUG-FIX REQUIREMENTS (this issue is a bug):
- ROOT CAUSE FIRST — set \`rootCause\` to the actual mechanism behind the symptom (e.g. a controlled input whose \`value\` never updates, an overlay intercepting pointer events). Name it before writing the fix.
- REPRODUCTION TEST — the \`changes\` array MUST contain BOTH: (a) a NEW unit test file (\`*.test.tsx\`/\`*.test.ts\`/\`*.spec.ts\`) that reproduces the bug, and (b) the minimal code change that makes that test pass. Put the test in the SAME LAYER as the root cause, not always the frontend: if \`rootCause\` points at storefront UI code, add a \`*.test.tsx\` under \`storefront/src/\` next to the component using real interaction (\`userEvent.type\`/\`click\`, never Playwright \`fill()\`), importing \`@testing-library/react\`, \`@testing-library/user-event\`, and \`@testing-library/jest-dom\`. If \`rootCause\` points at Medusa backend/config code (e.g. \`medusa-config.ts\`, a service, a workflow), add a \`*.test.ts\`/\`*.spec.ts\` under \`medusa/src/\` that imports and asserts on that backend code directly — do NOT write a frontend component test for a backend bug; it cannot fail on unfixed backend code and will not reproduce anything.

`
    : "";

  const effectiveSystem = isBug ? bugInstruction + systemContent : systemContent;

  while (attempts < MAX_DEV_LOOP_ATTEMPTS) {
    attempts += 1;
    let result: z.infer<typeof CodeChangesSchema>;
    try {
      result = await extractStructured(CodeChangesSchema, [
        {
          role: "system",
          content: effectiveSystem,
        },
        {
          role: "user",
          content: lastError
            ? `Previous attempt was rejected or failed:\n${lastError}\n\nFix the code accordingly. Original issue #${state.issueNumber}: ${issue.title}\n\n${issue.body}${qaContext}\n\nComments:\n${commentsText}`
            : `Issue #${state.issueNumber}: ${issue.title}\n\n${issue.body}${qaContext}\n\nComments:\n${commentsText}`,
        },
      ]);
    } catch (err) {
      // The LLM failed to emit a valid structured edit (e.g. an empty `changes`
      // array) even after extractStructured's internal retries. Fall through to
      // the blocking path instead of throwing — otherwise the whole graph run
      // crashes and the issue is left orphaned in status:in-progress.
      lastError = err instanceof Error ? err.message : String(err);
      break;
    }

    changes = result.changes;
    summary = result.summary;
    const rootCause = result.rootCause ?? "";
    // Split test change(s) from code change(s) so the reproduce-first gate can
    // apply the test in isolation (proving it FAILS pre-fix).
    const testChanges = changes.filter((c) => TEST_FILE_RE.test(c.path));
    const codeChanges = changes.filter((c) => !TEST_FILE_RE.test(c.path));

    // Reproduce-first gate (bug issues only): a bug fix must name the root
    // cause AND ship a unit test that reproduces the symptom — before any code
    // is changed. This is the front-line defense against a no-op "fix".
    if (isBug && (testChanges.length === 0 || !rootCause.trim())) {
      lastError =
        `Bug fix is missing ${testChanges.length === 0 ? "a REPRODUCTION TEST" : "a ROOT CAUSE"}. ` +
        `Provide both: (1) \`rootCause\` naming the mechanism, and (2) a unit test (\`*.test.tsx\` under \`storefront/src/\`, or \`*.test.ts\`/\`*.spec.ts\` under \`medusa/src/\`) that reproduces the symptom and FAILS on the current code.`;
      // The gate's own message collapses every non-compliant response into one
      // of two generic strings — with no visibility into what the model
      // actually returned, a repeat failure is undiagnosable from CI logs
      // alone (this is what happened chasing issue #129: the same "missing
      // REPRODUCTION TEST" message came back 5/5 attempts with no way to tell
      // whether the model omitted the test, named it wrong, or something else).
      console.warn(
        `[dev-loop] reproduce-first gate rejected attempt ${attempts}: rootCause=${JSON.stringify(rootCause)} paths=${JSON.stringify(changes.map((c) => c.path))}`
      );
      await discard();
      continue;
    }

    try {
      created.length = 0;
      if (isBug) {
        // Phase 1 — REPRODUCE: apply ONLY the test, run the suite, and expect
        // FAILURE. A test that passes on the unfixed code does not reproduce
        // the bug (the false-PASS that let PR #120 ship).
        applyCodeChanges(testChanges, created);
        const repro = await runDevLoopTests();
        if (repro.passed) {
          // Layer-aware, like the bugInstruction prompt above: a false-PASS on
          // a backend/medusa test is almost always "asserting against the
          // wrong thing" (e.g. UI copy) rather than "needs userEvent" — that
          // frontend-specific advice was previously given unconditionally
          // here regardless of which layer the test was in, which repeatedly
          // steered a backend config bug (#129) back toward a frontend
          // rewrite even after the model had already produced a backend test.
          const isBackendTest = testChanges.some((c) => c.path.startsWith("medusa/"));
          lastError = isBackendTest
            ? "Reproduction test passed on the CURRENT (unfixed) code — it does not reproduce the bug. Rewrite it so it FAILS on the current code by asserting directly on the actual backend value/behavior the bug affects (e.g. import and check the real config object, service method, or workflow output — not a stand-in that the current bug doesn't touch), and make sure it lives under `medusa/src/` with a `.test.ts`/`.spec.ts` name so `npm run test:unit` runs it."
            : "Reproduction test passed on the CURRENT (unfixed) code — it does not reproduce the bug. Rewrite it so it FAILS on the current code using real interaction (`userEvent.type`/`userEvent.click`, not Playwright `fill()`), and make sure it lives under `src/` with a `.test.ts(x)` name so `npm run test:unit` runs it.";
          await discard();
          continue;
        }
        // Phase 2 — FIX: apply the code change on top of the reproducing test.
        applyCodeChanges(codeChanges, created);
      } else {
        applyCodeChanges(changes, created);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Feed the actual on-disk content of the targeted paths back so the next
      // attempt's `search` is a verbatim copy, not another hallucinated guess.
      const real = changes
        .map((c) => {
          try {
            return `=== ${c.path} ===\n${readFileSync(c.path, "utf-8")}`;
          } catch {
            return `(path does not exist: ${c.path})`;
          }
        })
        .join("\n\n");
      lastError += `\n\nActual file content on disk (copy ` + "`search`" + ` verbatim from this):\n${real}`;
      await discard();
      continue;
    }

    // Reject scope-creep: a broad rewrite instead of a minimal edit.
    const diff = await gitDiffSummary();
    if (diff.files === 0) {
      lastError = `No-op edit: the working tree is unchanged after applying the search/replace. Make a real change (e.g. actually add the attribute/line the issue asks for), not an identical copy.`;
      await discard();
      continue;
    }
    const maxFiles = authorSpec ? 3 : isBug ? 3 : 2;
    const maxLines = authorSpec ? 150 : isBug ? 100 : 40;
    if (diff.files > maxFiles || diff.lines > maxLines) {
      lastError = `Scope-creep detected: ${diff.files} file(s) / ${diff.lines} lines changed. Make a MINIMAL edit — modify only the one file that contains the target element, ideally a single line.${authorSpec ? " (Authoring a spec allows up to one new test file.)" : isBug ? " (A bug fix may add one reproduction test file alongside the code change.)" : ""}`;
      await discard();
      continue;
    }

    const testRun = await runDevLoopTests();
    if (testRun.passed) {
      lastError = "";
      break;
    }
    lastError = testRun.log.slice(-8000); // bound what we feed back
  }

  if (lastError) {
    const comment = formatBlockingComment(
      `Could not complete the change after ${attempts} attempt${attempts === 1 ? "" : "s"}. Last failure:\n\`\`\`\n${lastError.slice(-2000)}\n\`\`\``,
      ["Provide a more specific fix direction", "Confirm this is a known flaky test to skip for now", "Close/deprioritize this issue"]
    );
    await ghIssueComment(state.issueNumber, comment);
    await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked", removeLabel: "status:in-progress" });
    return { currentLabel: "status:blocked", devLoopAttempts: attempts, codeChanges: changes };
  }

  await gitAdd(changes.map((c) => c.path));
  await gitCommit(summary.slice(0, 72));

  let prNumber: number;
  if (existingPr) {
    await gitPush(branch);
    await ghPrComment(existingPr.number, `Pushed a fix for issue #${state.issueNumber}. Ran: unit + integration tests — all passing.`);
    prNumber = existingPr.number;
  } else {
    await gitPush(branch, { setUpstream: true });
    prNumber = await ghPrCreate(
      issue.title,
      `Closes #${state.issueNumber}\n\n${summary}\n\n## Test plan\nnpm run test:unit (medusa + storefront) — passing. e2e not run locally — awaiting quality-analyst verification.`,
      branch
    );
  }

  await ghIssueEdit(state.issueNumber, { addLabel: "status:ready-for-qa", removeLabel: "status:in-progress" });
  await ghIssueComment(
    state.issueNumber,
    `Opened PR #${prNumber}. Ran: unit + integration tests — all passing. e2e not run locally — awaiting quality-analyst verification.`
  );

  return { currentLabel: "status:ready-for-qa", prNumber, codeChanges: changes, devLoopAttempts: attempts };
}

// =============================================================================
// 4. Quality Analyst Node — zero-LLM fast path
// =============================================================================

/**
 * Baseline smoke specs that ALWAYS run in QA, regardless of what the PR
 * changed. These are the "does the app build, render, and sell" floor: a
 * catastrophic core-UI break must be caught here even when the PR's own change
 * has no dedicated spec yet. Deliberately tiny (3 tests, <1 min) — the full
 * regression suite is not part of the autonomous loop anymore; its coverage
 * belongs on a separate scheduled non-prod run instead.
 */
const BASELINE_SPECS = ["tests/e2e/smoke.spec.ts"];

/** True when a changed path is a storefront E2E spec file. */
function isE2eSpec(path: string): boolean {
  return /^storefront\/tests\/e2e\/.*\.spec\.(ts|tsx)$/.test(path);
}

/** True when a changed path is storefront UI source (not a test file). */
function isStorefrontUi(path: string): boolean {
  return path.startsWith("storefront/") && !path.startsWith("storefront/tests/");
}

export async function qualityAnalystNode(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  const issue = await ghIssueView(state.issueNumber);
  // Drives the dev↔QA autonomous-retry bound: incremented on every QA run,
  // read by routeAfterQualityAnalyst (via the label) to decide retry vs escalate.
  const qaAttemptCount = (state.qaAttemptCount ?? 0) + 1;
  const prs = (await ghPrList(`Closes #${state.issueNumber} in:body`, "number,headRefName,url")) as {
    number: number;
    headRefName: string;
    url: string;
  }[];
  const pr = prs[0];
  if (!pr) {
    await ghIssueComment(
      state.issueNumber,
      formatBlockingComment("No open PR found for this issue — can't run QA against nothing.", [
        "A PR was expected but never opened",
        "The issue was relabeled to status:ready-for-qa in error",
      ])
    );
    await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked", removeLabel: "status:ready-for-qa" });
    return { currentLabel: "status:blocked" };
  }

  await ghIssueEdit(state.issueNumber, { addLabel: "status:qa-in-progress", removeLabel: "status:ready-for-qa" });

  // Gate on the PR's own CI — but tolerate the case where NO checks exist at
  // all: a PR opened with GITHUB_TOKEN (which dev-loop uses) does not trigger
  // test.yml, so `gh pr checks` is empty. In that case skip the gate (dev-loop
  // already ran unit tests in this same run) and go straight to E2E. If checks
  // DO exist, poll for a terminal state (wiring check_suite webhooks would be
  // cleaner, but this keeps the loop in one process — which it must be, since
  // GITHUB_TOKEN-created events don't re-trigger this workflow).
  const CI_WAIT_TIMEOUT_MS = 5 * 60_000;
  let waited = 0;
  let checks = await ghPrChecks(pr.number);
  if (checks.length > 0) {
    while (waited < CI_WAIT_TIMEOUT_MS && checks.some((c) => c.bucket === "pending")) {
      await sleep(15_000);
      waited += 15_000;
      checks = await ghPrChecks(pr.number);
    }
  }
  console.log(`[qa] PR #${pr.number} checks after ${Math.round(waited / 1000)}s: ${JSON.stringify(checks)}`);

  if (checks.some((c) => c.bucket === "pending")) {
    // Still pending after the bounded wait — leave it ready-for-qa for a later
    // retrigger rather than blocking.
    await ghIssueEdit(state.issueNumber, { addLabel: "status:ready-for-qa", removeLabel: "status:qa-in-progress" });
    return {};
  }

  const failed = checks.filter((c) => c.bucket === "fail");
  if (failed.length > 0) {
    const report = formatQaReport({
      featureTitle: issue.title,
      passed: false,
      prUrl: pr.url,
      executionSummary: [`PR CI is red (${failed.map((c) => c.name).join(", ")}) — E2E not attempted`],
      acceptanceCriteria: [],
      failureDetails: "Per the QA gating protocol, a PR's own CI must be green before the isolated E2E stack is stood up against it.",
    });
    await ghIssueComment(state.issueNumber, report);
    await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked", removeLabel: "status:qa-in-progress" });
    return { currentLabel: "status:blocked", testResults: { passed: false, log: "CI red" } };
  }

  // Work on the PR's branch, not main — the E2E stack must run against the code
  // under test.
  await gitCheckout(pr.headRefName);

  // Change-scoped QA: run only the baseline smoke specs plus the spec files the
  // PR itself added or modified. The full regression suite is intentionally not
  // run here — it surfaces pre-existing failures unrelated to the PR (the exact
  // thrash root-cause), and its coverage belongs on a separate scheduled
  // non-prod run instead.
  const changedFiles = await ghPrFiles(pr.number);
  const specDelta = changedFiles.filter(isE2eSpec).map((p) => p.replace(/^storefront\//, ""));
  const uiChanged = changedFiles.some(isStorefrontUi);
  // Only include baseline specs that actually exist on the checked-out branch:
  // a PR forked before smoke.spec.ts was added won't have it, and passing a
  // nonexistent spec path to Playwright would error the whole run.
  const baselineOnDisk = BASELINE_SPECS.filter((p) => {
    try {
      readFileSync(`storefront/${p}`, "utf-8");
      return true;
    } catch {
      return false;
    }
  });
  const specsToRun = [...new Set([...baselineOnDisk, ...specDelta])];
  console.log(`[qa] PR #${pr.number} changed ${changedFiles.length} file(s); spec delta: [${specDelta.join(", ") || "none"}] → running: [${specsToRun.join(", ") || "none"}]`);

  let testResults: { passed: boolean; log: string };
  if (specsToRun.length === 0) {
    // Nothing to run (no baseline on this branch and no PR spec delta). Treat as
    // green — the coverage gate below still hands back to dev-loop if the PR
    // changed storefront UI without a spec, and passes through otherwise.
    testResults = { passed: true, log: "no E2E specs on this branch" };
    console.log("[qa] no E2E specs to run — skipping docker bring-up");
  } else {
    console.log("[qa] entering docker compose + E2E path");
    try {
    await writeLocalEnv();
    await dockerComposeUp();
    let healthy = false;
    for (let i = 0; i < 24 && !healthy; i++) {
      healthy = await dockerComposeIsHealthy("backend");
      if (!healthy) await sleep(5000);
    }
    if (!healthy) throw new Error("backend never became healthy within 120s");
    await dockerComposeSeed();

    // The publishable key is generated at seed time and inlined into the
    // storefront bundle at build time, so fetch it and rebuild the storefront
    // with it before running the E2E suite (else the catalog is empty).
    const publishableKey = await dockerComposeGetPublishableKey();
    updateLocalEnvPublishableKey(publishableKey);
    await dockerComposeRebuildStorefront();

    // Wait for the rebuilt storefront to actually be healthy before running E2E.
    // The rebuild restarts the container and a cold Next.js boot can exceed the
    // old fixed 15s sleep, leaving every test to hit a dead :3000.
    let storefrontHealthy = false;
    for (let i = 0; i < 24 && !storefrontHealthy; i++) {
      storefrontHealthy = await dockerComposeIsHealthy("storefront");
      if (!storefrontHealthy) await sleep(5000);
    }
    if (!storefrontHealthy) throw new Error("storefront never became healthy within 120s");

    // Diagnostic probe: distinguish empty-catalog vs auth vs connectivity. The
    // E2E failures are all `product-container` 404s, so log (1) the backend's
    // product list with the fetched publishable key, (2) the storefront's
    // rendered home page, and (3) the storefront's own server logs.
    try {
      const backendRes = await fetch("http://localhost:9000/store/products?limit=3", {
        headers: { "x-publishable-api-key": publishableKey },
      });
      console.log(`[qa] backend /store/products status: ${backendRes.status}`);
      console.log(`[qa] backend /store/products body: ${(await backendRes.text()).slice(0, 500)}`);
    } catch (e) {
      console.log(`[qa] backend probe failed: ${e}`);
    }
    try {
      const homeRes = await fetch("http://localhost:3000/");
      const home = await homeRes.text();
      console.log(`[qa] storefront home status: ${homeRes.status}, length: ${home.length}`);
      console.log(`[qa] storefront home body (first 400): ${home.slice(0, 400)}`);
    } catch (e) {
      console.log(`[qa] storefront home probe failed: ${e}`);
    }
    console.log(`[qa] storefront logs (tail):\n${await dockerComposeLogs("storefront", 80)}`);

    const run = await runPlaywright("http://localhost:3000", ["chromium"], specsToRun);
    // Surface the full E2E output in the workflow log (not just the truncated
    // tail that reaches the issue comment) so a systemic failure is diagnosable.
    console.log(`[qa] Playwright exit ${run.exitCode}:\n${run.stdout}\n${run.stderr}`);
    testResults = { passed: run.exitCode === 0, log: (run.stdout + run.stderr).slice(-8000) };
  } catch (err) {
    testResults = { passed: false, log: err instanceof Error ? err.message : String(err) };
    console.log(`[qa] docker/seed/E2E failed: ${testResults.log}`);
  } finally {
    await dockerComposeDown();
  }
  }

  const report = formatQaReport({
    featureTitle: issue.title,
    passed: testResults.passed,
    prUrl: pr.url,
    executionSummary: [`Change-scoped Playwright run (${specsToRun.join(", ")}): ${testResults.passed ? "Passed" : "Failed"}`],
    acceptanceCriteria: [],
    failureDetails: testResults.passed ? undefined : testResults.log.slice(-2000),
  });
  await ghIssueComment(state.issueNumber, report);

  if (testResults.passed) {
    // Coverage gate: a green baseline doesn't prove the change is tested. If the
    // PR touches storefront UI but added/modified no spec, hand back to dev-loop
    // to author one (bounded by MAX_QA_ROUNDS) — a shipped UI change with no
    // E2E coverage shouldn't silently proceed to tech-lead.
    if (uiChanged && specDelta.length === 0) {
      if (qaAttemptCount <= MAX_QA_ROUNDS) {
        await ghIssueComment(
          state.issueNumber,
          `🧪 Baseline smoke passed, but this PR changes storefront UI without adding/modifying an E2E spec. Handing back to dev-loop to author a spec under \`storefront/tests/e2e/\` that exercises the change.`
        );
        await ghIssueEdit(state.issueNumber, { addLabel: "status:ready-for-dev", removeLabel: "status:qa-in-progress" });
        return {
          currentLabel: "status:ready-for-dev",
          testResults,
          prNumber: pr.number,
          qaAttemptCount,
          qaHandoffMessage:
            "Author a missing E2E spec for this UI change: write a NEW Playwright spec file under storefront/tests/e2e/ that exercises the change. To create a new file, set `search` to the empty string and put the ENTIRE file content in `replace`. Reuse the repo's existing fixtures/page-objects and real getByTestId selectors — do NOT invent new testids.",
          qaHandoffAuthorSpec: true,
        };
      }
      await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked", removeLabel: "status:qa-in-progress" });
      return { currentLabel: "status:blocked", testResults, prNumber: pr.number, qaAttemptCount };
    }
    await ghIssueEdit(state.issueNumber, { addLabel: "status:in-review", removeLabel: "status:qa-in-progress" });
    return { currentLabel: "status:in-review", testResults, prNumber: pr.number, qaAttemptCount };
  }

  // E2E failed. With change-scoping every failure is relevant by construction —
  // baseline specs are core UI, and the delta specs are the PR's own — so hand
  // straight back to dev-loop (bounded) instead of trying to classify
  // "unrelated" failures (which the full-regression run forced us to do, and
  // which caused the earlier thrash).
  if (qaAttemptCount <= MAX_QA_ROUNDS) {
    await ghIssueEdit(state.issueNumber, { addLabel: "status:ready-for-dev", removeLabel: "status:qa-in-progress" });
    return {
      currentLabel: "status:ready-for-dev",
      testResults,
      prNumber: pr.number,
      qaAttemptCount,
      qaHandoffMessage:
        "A change-scoped E2E test failed. Fix the underlying code (or the test itself if the test is wrong) — the failure log below shows what broke.",
      qaHandoffAuthorSpec: false,
    };
  }

  // Budget exhausted — escalate to tech-lead (status:blocked) for human-in-the-
  // loop direction rather than looping dev↔QA forever.
  await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked", removeLabel: "status:qa-in-progress" });
  return { currentLabel: "status:blocked", testResults, prNumber: pr.number, qaAttemptCount };
}

// =============================================================================
// 5. Tech Lead Node — human-in-the-loop
// =============================================================================

const AuditVerdictSchema = z.object({
  approved: z.boolean(),
  isSemanticNoOp: z
    .boolean()
    .describe("True when the diff is a SEMANTIC no-op — it changes only formatting, whitespace, comments, or rewrites equivalent code without changing behavior. A semantic no-op is always an automatic reject (approved=false)."),
  findings: z.array(z.string()).describe("SOLID / VPS-resource / architecture concerns, empty if approved cleanly"),
  reviewSummary: z.string(),
});

/**
 * Deterministic no-op-diff detector — tech-lead's backstop against a PR whose
 * diff changes no observable behavior (the PR #120 failure mode: a formatting
 * reflow shipped as a "fix"). Proves the two no-op classes a text diff alone
 * can: (1) empty, and (2) whitespace-only (every +/- content line is identical
 * in order once whitespace is stripped). A *semantic* no-op — e.g. #120's
 * rewrite of `onChange={(e) => refine(...)}` into a `{ ... }` block body with
 * identical behavior — cannot be proven here; auditPr's isSemanticNoOp check
 * handles that with the LLM's reasoning.
 *
 * `String.fromCharCode(10)` / `ch.trim()` are used instead of `\n` / `/\s/`
 * so the function carries no regex/escape sequences (keeps this readable and
 * immune to escape mangling).
 */
function detectNoOpDiff(diff: string): { isNoOp: boolean; reason?: string } {
  const NEWLINE = String.fromCharCode(10);
  const added: string[] = [];
  const removed: string[] = [];
  for (const raw of diff.split(NEWLINE)) {
    if (raw.startsWith("+") && !raw.startsWith("+++")) added.push(raw.slice(1));
    else if (raw.startsWith("-") && !raw.startsWith("---")) removed.push(raw.slice(1));
  }
  if (added.length === 0 && removed.length === 0) {
    return { isNoOp: true, reason: "the diff is empty (no added or removed lines)" };
  }
  const strip = (s: string) => s.split("").filter((ch) => ch.trim() !== "").join("");
  const a = added.map(strip).join("");
  const r = removed.map(strip).join("");
  if (a === r) {
    return { isNoOp: true, reason: "the only differences are whitespace/line-breaks — no code content changed" };
  }
  return { isNoOp: false };
}

async function auditPr(diff: string): Promise<z.infer<typeof AuditVerdictSchema>> {
  return extractStructured(AuditVerdictSchema, [
    {
      role: "system",
      content: [
        "You are the Principal Technical Lead for a Next.js + MedusaJS e-commerce platform on a 4 vCPU / 8GB RAM VPS.",
        "SOLID/Clean Code: custom Medusa logic must live in workflows/services/subscribers, never route handlers. Next.js: Server Components by default, 'use client' scoped to interactive leaves. TypeScript: no `any`, no unhandled promises.",
        "VPS resource rules (non-negotiable): Postgres query filters must use indexed columns, no unpaginated queries. No unbounded Promise.all, unclosed Redis pub/sub, or dependency-less useEffect. Next.js fetch calls need `next: { revalidate }`; images need `<Image/>` with dimensions.",
        "Any new/changed docker-compose.yml service MUST declare deploy.resources.limits.memory and .cpus — a missing limit is an automatic reject.",
        "redis's --maxmemory-policy is deliberately noeviction — any PR changing that flag or adding a Redis consumer needs explicit justification in the PR body, otherwise flag it.",
        "Semantic no-op detection: if the diff changes no observable behavior — only whitespace, formatting, comments, or an equivalent rewrite of the same logic (e.g. reformatting `onChange={(e) => refine(e.target.value)}` into a `{ ... }` block body) — set isSemanticNoOp=true and approved=false, with a finding `No-op diff: <what was reformatted and why it cannot fix the issue>`. Otherwise set isSemanticNoOp=false.",
      ].join(" "),
    },
    { role: "user", content: diff },
  ]);
}

async function techLeadReviewWorkflow(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  await ghIssueEdit(state.issueNumber, {
    addLabel: "status:tech-lead-review-in-progress",
    removeLabel: "status:in-review",
  });

  const prs = (await ghPrList(`Closes #${state.issueNumber} in:body`, "number,headRefName,url")) as {
    number: number;
    headRefName: string;
    url: string;
  }[];
  const pr = prs[0];
  if (!pr) {
    await ghIssueComment(state.issueNumber, formatBlockingComment("No open PR found to review.", ["Relabel once a PR exists"]));
    await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked", removeLabel: "status:tech-lead-review-in-progress" });
    return { currentLabel: "status:blocked" };
  }

  const checks = await ghPrChecks(pr.number);
  if (checks.some((c) => c.bucket === "pending")) {
    await ghIssueEdit(state.issueNumber, { addLabel: "status:in-review", removeLabel: "status:tech-lead-review-in-progress" });
    return {}; // wait for a later run — see the same pending-CI caveat as qualityAnalystNode
  }
  const hardFail = checks.some((c) => c.bucket === "fail" && c.name !== "storefront-e2e");
  if (hardFail) {
    await ghPrReviewComment(pr.number, "CI is red on a required check (not storefront-e2e) — cannot approve.");
    await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked", removeLabel: "status:tech-lead-review-in-progress" });
    return { currentLabel: "status:blocked" };
  }

  const diff = await ghPrDiff(pr.number);

  // Gate 1a — deterministic no-op pre-filter (zero LLM cost): reject an empty
  // or whitespace-only diff before the audit even runs.
  const noOp = detectNoOpDiff(diff);
  if (noOp.isNoOp) {
    const comment = formatBlockingComment(
      `No-op diff rejected: ${noOp.reason}. This change cannot fix the issue because it does not alter behavior.`,
      ["Push a real code change that alters behavior", "Close the PR if no change is actually needed", "Escalate for a human review of what the fix should be"],
      "🛑 No-Op Diff Rejected"
    );
    await ghPrReviewComment(pr.number, comment);
    await ghIssueComment(state.issueNumber, comment);
    await ghIssueEdit(state.issueNumber, {
      addLabel: "status:blocked-architecture-review",
      removeLabel: "status:tech-lead-review-in-progress",
    });
    return { currentLabel: "status:blocked-architecture-review" };
  }

  const verdict = await auditPr(diff);

  // Gate 1b — semantic no-op (caught by the audit LLM): a diff that changes
  // formatting/whitespace/comments or rewrites equivalent code without changing
  // behavior. The deterministic pre-filter above can't prove these; the LLM can
  // (PR #120's `{ ... }` reflow of an arrow body).
  if (verdict.isSemanticNoOp) {
    const comment = formatBlockingComment(
      "No-op diff: this change does not alter behavior, so it cannot fix the issue.",
      ["Push a real code change that alters behavior", "Explain why this change is actually behavior-altering", "Escalate for a human review"],
      "🛑 No-Op Diff Rejected"
    );
    await ghPrReviewComment(pr.number, comment);
    await ghIssueComment(state.issueNumber, comment);
    await ghIssueEdit(state.issueNumber, {
      addLabel: "status:blocked-architecture-review",
      removeLabel: "status:tech-lead-review-in-progress",
    });
    return { currentLabel: "status:blocked-architecture-review", architecturalBlockers: verdict.findings };
  }

  if (!verdict.approved) {
    const comment = formatBlockingComment(
      verdict.findings.join(" "),
      ["Address the findings and push a fix", "Explain why the concern doesn't apply here", "Escalate for a human architecture call"],
      "🛑 **Architectural Escalation Required**"
    );
    await ghPrReviewComment(pr.number, comment);
    await ghIssueComment(state.issueNumber, comment);
    await ghIssueEdit(state.issueNumber, {
      addLabel: "status:blocked-architecture-review",
      removeLabel: "status:tech-lead-review-in-progress",
    });

    // Halt for human input. In LangGraph Studio (local, MemorySaver alive for
    // the session) this genuinely pauses the run and can be resumed with
    // Command({ resume: ... }) for demonstration. In production (a single
    // `graph.invoke()` per GitHub Actions job, no persisted checkpoint across
    // runs — see state.ts) there is nothing to resume: this call halts the
    // current run, and the owner's reply arrives as a brand-new
    // issue_comment webhook that starts a fresh process and re-enters this
    // same node via ownerReplyWorkflow, driven by the issue's now-current
    // GitHub label rather than a resumed checkpoint.
    interrupt({
      reason: "tech-lead architecture escalation",
      issueNumber: state.issueNumber,
      prNumber: pr.number,
      findings: verdict.findings,
    });

    return { currentLabel: "status:blocked-architecture-review", architecturalBlockers: verdict.findings };
  }

  await runTechLeadApprove(
    pr.number,
    [
      "### 🟢 Technical Lead Review Passed",
      "- [x] SOLID Principles & Clean Code",
      "- [x] VPS Resource & Memory Limits Audited (8GB RAM / 4 vCPU compliant)",
      "- [x] Postgres Query Indexes & Pagination Verified",
      "- [x] All CI Checks Passing",
      "",
      verdict.reviewSummary,
      "",
      "Proceeding to deploy pipeline.",
    ].join("\n")
  );
  await ghIssueEdit(state.issueNumber, { addLabel: "status:deploying", removeLabel: "status:tech-lead-review-in-progress" });

  return runDeployWorkflow(state.issueNumber, pr.number, pr.headRefName);
}

async function smokeTest(): Promise<boolean> {
  // SMOKE_* not NEXT_PUBLIC_*: NEXT_PUBLIC_BASE_URL is the storefront's own
  // build-time variable (see storefront/src/lib/util/env.ts getBaseURL), and
  // the graph runs dev_loop's `npm run test:unit` as a child of this same
  // process. If we read NEXT_PUBLIC_* here, the workflow env that sets the
  // production URL would leak into those unit tests and break anything that
  // asserts the localhost fallback (sitemap.test.ts, product-jsonld). Give the
  // smoke check its own namespace so the two consumers can't collide.
  const baseUrl = process.env.SMOKE_BASE_URL;
  const backendUrl = process.env.SMOKE_MEDUSA_BACKEND_URL;
  if (!baseUrl || !backendUrl) return false;
  for (let i = 0; i < 12; i++) {
    try {
      // Probe /api/health, not the storefront root — the root sits behind
      // middleware.ts's region redirect (/ -> /au), which a cookie-less fetch
      // follows forever (fetch follows redirects but doesn't carry the
      // _medusa_cache_id cookie back), so fetch(baseUrl) would throw "redirect
      // count exceeded" on a perfectly healthy server. /api/* bypasses that
      // middleware and returns 200 directly (see storefront/src/app/api/health).
      const [a, b] = await Promise.all([fetch(`${baseUrl}/api/health`), fetch(`${backendUrl}/health`)]);
      if (a.ok && b.ok) return true;
    } catch {
      // fall through to retry
    }
    await sleep(5000);
  }
  return false;
}

async function runDeployWorkflow(issueNumber: number, prNumber: number, headRefName: string): Promise<Partial<AgenticSdlcStateType>> {
  const diff = await ghPrDiff(prNumber);
  const touchesInfra = /diff --git a\/(docker-compose\.yml|Caddyfile|scripts\/deploy\.sh|\.github\/workflows\/deploy-vps\.yml)/.test(diff);

  if (!touchesInfra) {
    // Pre-merge fast path
    const runId = await ghWorkflowRunAndGetId("deploy-vps.yml", headRefName);
    const deployOk = await ghRunWatch(runId);
    if (!deployOk || !(await smokeTest())) {
      await ghWorkflowRun("deploy-vps.yml", "main"); // restore known-good
      await ghIssueEdit(issueNumber, { addLabel: "status:blocked-deploy-failed", removeLabel: "status:deploying" });
      await ghIssueComment(
        issueNumber,
        `📌 **Blocking Reason:** Pre-merge deploy verification failed (run ${runId}). Production was not affected; redeployed main to confirm it's still healthy. Needs review before retry.`
      );
      return { currentLabel: "status:blocked-deploy-failed" };
    }
    await runTechLeadMerge(prNumber);
    return { currentLabel: "status:deploying" };
  }

  // Post-merge path — infra-sensitive PR, merge first so `git pull --ff-only` on the VPS picks it up.
  const beforeId = await ghRunListLatestIdOrNull("deploy-vps.yml", "main");
  await runTechLeadMerge(prNumber);
  const runId = await ghRunWaitForNewId("deploy-vps.yml", "main", beforeId);
  const deployOk = await ghRunWatch(runId);
  if (!deployOk || !(await smokeTest())) {
    const mergeSha = process.env.GITHUB_SHA ?? "";
    if (mergeSha) await runTechLeadRollback(mergeSha);
    await ghIssueEdit(issueNumber, { addLabel: "status:blocked-deploy-failed", removeLabel: "status:deploying" });
    await ghIssueComment(
      issueNumber,
      `📌 **Blocking Reason:** Post-merge deploy verification failed (run ${runId}). Reverted and redeployed to restore production. Needs review before retry.`
    );
    return { currentLabel: "status:blocked-deploy-failed" };
  }
  return { currentLabel: "status:deploying" };
}

async function unblockGenericWorkflow(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  const issue = await ghIssueView(state.issueNumber);
  const prs = (await ghPrList(`Closes #${state.issueNumber} in:body`, "number,headRefName,url")) as { number: number; url: string }[];
  const pr = prs[0];

  const lastComment = issue.comments[issue.comments.length - 1]?.body ?? "";

  // A scope-creep block (the dev-loop couldn't stay under the minimal-diff
  // limit after 3 retries) can't be resolved by giving direction — the code
  // model already retried and failed. Auto-unblocking here would loop
  // dev-loop -> blocked -> tech-lead -> ready-for-dev forever. Escalate to a
  // human instead.
  if (lastComment.includes("Scope-creep detected")) {
    await ghIssueComment(
      state.issueNumber,
      "🛑 **Escalation:** the dev-loop repeatedly exceeded the minimal-diff limit. This needs a human decision — either the issue scope, or the code-generation approach (model/prompt), must change. I will not auto-unblock it."
    );
    await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked-architecture-review", removeLabel: "status:blocked" });
    return { currentLabel: "status:blocked-architecture-review" };
  }

  const decision = await extractStructured(
    z.object({ canResolve: z.boolean(), direction: z.string() }),
    [
    {
      role: "system",
      content:
        "You are the Technical Lead resolving a status:blocked issue. If you can give a clear, concrete technical direction (architectural call, disambiguation, bug-fix direction), set canResolve=true. If it needs a product/business call only a human can make, set canResolve=false.",
    },
    { role: "user", content: `Issue #${state.issueNumber}: ${issue.title}\n\n${issue.body}\n\nLatest blocking comment:\n${lastComment}` },
  ]);

  if (decision.canResolve) {
    const prNote = pr ? `\n\nThis issue already has an open PR: ${pr.url} — push the fix there, don't open a new PR.` : "";
    await ghIssueComment(state.issueNumber, `### 🧭 Technical Lead Direction\n${decision.direction}${prNote}`);
    await ghIssueEdit(state.issueNumber, {
      addLabel: "status:ready-for-dev",
      removeLabel: "status:blocked",
    });
    // This is the one fully-autonomous hand-back to dev_loop — no human
    // needed to reach it, unlike ownerReplyWorkflow's blocked-architecture-review
    // path below (gated on hasOwnerReplySince) — so it's the site that can
    // actually recur unboundedly within a single run. See handoverCount's
    // doc comment in state.ts / routeAfterTechLead's circuit breaker in graph.ts.
    return { currentLabel: "status:ready-for-dev", handoverCount: 1 };
  }

  await ghIssueComment(
    state.issueNumber,
    formatBlockingComment(decision.direction, ["Provide the missing product/business decision", "Deprioritize this issue"], "🛑 **Architectural Escalation Required**")
  );
  await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked-architecture-review", removeLabel: "status:blocked" });
  return { currentLabel: "status:blocked-architecture-review" };
}

async function ownerReplyWorkflow(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  const issue = await ghIssueView(state.issueNumber);
  const ownerLogin = process.env.REPO_OWNER_LOGIN ?? "jayanthyp";
  if (!hasOwnerReplySince(issue.comments, ownerLogin)) {
    return {}; // owner-reply-only queue, nothing to do without a genuine new reply
  }

  if (state.currentLabel === "status:blocked-architecture-review") {
    // Route back to whichever workflow it came from. Without a persisted
    // origin marker (no cross-run state — see plan decision #2), infer from
    // whether an open PR exists: a PR-review FAIL re-enters review; a 2a punt
    // re-enters dev.
    const prs = (await ghPrList(`Closes #${state.issueNumber} in:body`, "number")) as { number: number }[];
    if (prs.length > 0) {
      await ghIssueEdit(state.issueNumber, { addLabel: "status:in-review", removeLabel: "status:blocked-architecture-review" });
      return { currentLabel: "status:in-review" };
    }
    await ghIssueEdit(state.issueNumber, {
      addLabel: "status:ready-for-dev",
      removeLabel: "status:blocked-architecture-review",
    });
    return { currentLabel: "status:ready-for-dev" };
  }

  // status:blocked-deploy-failed — parse the reply as retry vs abandon.
  const lastComment = issue.comments[issue.comments.length - 1]?.body ?? "";
  if (/retry/i.test(lastComment)) {
    await ghIssueEdit(state.issueNumber, { addLabel: "status:deploying", removeLabel: "status:blocked-deploy-failed" });
    return { currentLabel: "status:deploying" };
  }
  return {}; // abandon: leave the label as-is, PR is left for the owner to close manually
}

export async function techLeadNode(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  switch (state.currentLabel) {
    case "status:in-review":
      return techLeadReviewWorkflow(state);
    case "status:blocked":
      return unblockGenericWorkflow(state);
    case "status:blocked-architecture-review":
    case "status:blocked-deploy-failed":
      return ownerReplyWorkflow(state);
    default:
      return {};
  }
}

// dev_loop<->tech_lead circuit breaker destination — see handoverCount in
// state.ts and routeAfterTechLead in graph.ts. Reached only when tech-lead's
// autonomous unblock has handed the same issue back to dev_loop
// MAX_HANDOVERS times in one run without it resolving; ends the run the same
// way every other block does (status:blocked + an explanatory comment)
// rather than letting LangGraph's own recursion-limit throw an uncaught,
// GitHub-invisible crash.
export async function circuitBreakerEscalationNode(state: AgenticSdlcStateType): Promise<Partial<AgenticSdlcStateType>> {
  console.warn(
    `[circuit-breaker] issue #${state.issueNumber}: handoverCount=${state.handoverCount} reached the limit — halting the dev_loop<->tech_lead cycle`
  );
  await ghIssueComment(
    state.issueNumber,
    formatBlockingComment(
      `dev-loop and tech-lead handed this issue back and forth ${state.handoverCount} times in a single run without resolving it. Halting automatically rather than risking a LangGraph recursion-limit crash.`,
      ["Provide a more specific fix direction", "Confirm this needs a different approach entirely (e.g. a change outside dev-loop's scope)", "Close/deprioritize this issue"],
      "🛑 **Circuit Breaker Tripped**"
    )
  );
  await ghIssueEdit(state.issueNumber, { addLabel: "status:blocked", removeLabel: "status:ready-for-dev" });
  return { currentLabel: "status:blocked" };
}
