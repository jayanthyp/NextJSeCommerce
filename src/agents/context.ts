/**
 * Builds the repository context models reason over. Moved out of the old
 * nodes.ts; the AST index logic is unchanged.
 *
 * Locating code stays a deterministic scan (never left to the LLM): a full
 * path index (the anti-hallucination guarantee that a model can never invent
 * a path), a symbol map of the files most relevant to the query, and the
 * verbatim AST nodes whose JSX tags/attributes match it.
 */
import { readFileSync } from "node:fs";
import * as ts from "typescript";
import { gitListFiles } from "./tools.js";

/** Words that carry no signal for locating a file, dropped when deriving search terms. */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "into", "onto", "your",
  "you", "are", "was", "were", "add", "adds", "should", "when", "where",
  "which", "what", "have", "has", "will", "would", "could", "page", "pages",
  "issue", "able", "not", "all", "any", "but",
]);

/** Pulls candidate search terms out of free text, keeping the first ~10 meaningful words. */
function deriveSearchTerms(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(words)].slice(0, 10);
}

function scriptKindFor(path: string): ts.ScriptKind {
  if (path.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (path.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (path.endsWith(".js")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

interface SymbolRef {
  kind: string;
  name: string;
  line: number;
}

/** A file's top-level declarations, for navigation only. */
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

interface NodeMatch {
  file: string;
  line: number;
  text: string;
  score: number;
}

/**
 * JSX nodes whose tag / attribute names match the terms, verbatim with line
 * numbers. Matching tag names (not raw text) is what stops a <svg role="img">
 * icon outranking the real <Image> elements for an "img" query.
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
    out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text, score });
  };
  function visit(node: ts.Node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
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

/** Path index + symbol map + targeted verbatim nodes for `query` (an issue or task description). */
export async function readRepoContext(query: string): Promise<string> {
  // medusa/*.ts: root-level config (medusa-config.ts) lives outside medusa/src
  // and was invisible to bug fixes rooted there (#129).
  const files = await gitListFiles(["storefront/src", "medusa/src", "medusa/*.ts"]);
  const source = files.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));
  const terms = deriveSearchTerms(query);

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

  // Rank files by matching-node density + component-dir boost + path-term boost.
  const CODE_DIR = /\/(components|templates|models|services|api|jobs|scripts|lib)\//;
  const score = new Map<string, number>();
  for (const m of nodeMatches) score.set(m.file, (score.get(m.file) ?? 0) + m.score);
  const rank = (file: string) =>
    (score.get(file) ?? 0) + (CODE_DIR.test(file) ? 5 : 0) + (terms.some((t) => file.toLowerCase().includes(t)) ? 3 : 0);
  const relevant = new Set<string>(score.keys());
  for (const file of source) if (terms.some((t) => file.toLowerCase().includes(t))) relevant.add(file);
  const ranked = [...relevant].sort((a, b) => rank(b) - rank(a) || a.localeCompare(b));

  const symbolLines: string[] = [];
  for (const file of ranked.slice(0, 20)) {
    const syms = symbolByFile.get(file) ?? [];
    if (!syms.length) continue;
    symbolLines.push(`### ${file}`);
    for (const s of syms.slice(0, 25)) symbolLines.push(`  L${s.line} ${s.kind} ${s.name}`);
  }

  nodeMatches.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line);
  const seen = new Set<string>();
  const nodeLines: string[] = [];
  for (const m of nodeMatches) {
    const key = `${m.file}:${m.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    nodeLines.push(`### ${m.file}:${m.line}\n${m.text}`);
    if (nodeLines.length >= 12) break;
  }

  return [
    "## File path index (every tracked source file — use an exact path from this list, never invent one):",
    source.map((f) => `- ${f}`).join("\n"),
    "",
    "## Symbol map (declarations in the files most relevant here):",
    symbolLines.join("\n") || "(none matched)",
    "",
    "## Targeted nodes (verbatim code matching the request):",
    nodeLines.join("\n\n") || "(none matched)",
  ].join("\n");
}

/** Full content of tracked files (missing ones are reported, not thrown), capped per file. */
export function readFiles(paths: string[], maxCharsPerFile = 12_000): string {
  return paths
    .map((p) => {
      try {
        const text = readFileSync(p, "utf-8");
        return `=== ${p} ===\n${text.length > maxCharsPerFile ? `${text.slice(0, maxCharsPerFile)}\n…(truncated)` : text}`;
      } catch {
        return `=== ${p} ===\n(file does not exist yet)`;
      }
    })
    .join("\n\n");
}

/** Design tokens for UI specs. Each file is optional — DESIGN.md is an example, not a guarantee. */
export function readDesignContext(): string {
  const parts: string[] = [];
  for (const path of ["storefront/DESIGN.md", "storefront/tailwind.config.ts", "storefront/tailwind.config.js", "storefront/src/styles/globals.css", "storefront/src/app/globals.css"]) {
    try {
      parts.push(`--- ${path} ---\n${readFileSync(path, "utf-8").slice(0, 8000)}`);
    } catch {
      // absent — fine
    }
  }
  return parts.join("\n\n");
}

/**
 * Context for re-entering the build after an E2E failure: the log plus every
 * spec file it names, so the model sees what the failing test asserts instead
 * of guessing at the source.
 */
export function readE2eFailureContext(log: string): string {
  const specPaths = [...new Set(log.match(/[a-zA-Z0-9_/\-]+\.spec\.(ts|tsx)/g) ?? [])];
  const parts = [`## Playwright E2E failure (the change is already committed — fix what the failure shows):\n\`\`\`\n${log.slice(-4000)}\n\`\`\``];
  for (const p of specPaths) {
    const full = p.startsWith("storefront/") ? p : `storefront/${p}`;
    try {
      parts.push(`=== ${full} ===\n${readFileSync(full, "utf-8")}`);
    } catch {
      // a path from the log may not exist verbatim on disk
    }
  }
  return parts.join("\n\n");
}

/** Templates for authoring a missing E2E spec: a representative spec, its page objects, and the existing spec list. */
export async function readSpecTemplateContext(): Promise<string> {
  const parts: string[] = [];
  for (const p of [
    "storefront/tests/e2e/frequently-bought-together.spec.ts",
    "storefront/tests/e2e/pages/product-page.ts",
    "storefront/tests/e2e/pages/cart-page.ts",
    "storefront/tests/e2e/fixtures/test-data.ts",
  ]) {
    try {
      parts.push(`--- ${p} ---\n${readFileSync(p, "utf-8")}`);
    } catch {
      // an absent template is non-fatal
    }
  }
  const existing = (await gitListFiles(["storefront/tests/e2e"])).filter((f) => /\.spec\.(ts|tsx)$/.test(f));
  parts.push(`--- existing spec files (follow this naming, avoid duplicating a test) ---\n${existing.join("\n")}`);
  return parts.join("\n\n");
}
