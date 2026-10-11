/**
 * Stage 6's judge: TypeSafe AI's Jev, a "System One" decision model. It
 * generates no text — it answers typed questions about a state with
 * calibrated probabilities, in one parallel pass, billed on input tokens only.
 *
 *   POST {JEV_BASE_URL}/v1/systemone   Authorization: Bearer $TYPESAFE_API_KEY
 *   { model, state, questions: { <id>: { type: "noul"|"score"|"choice", instructions, criteria? } } }
 *
 * JEV_BASE_URL also works with OpenRouter's System One surface
 * (https://openrouter.ai/api + JEV_MODEL=~typesafe/jev-latest) or a LiteLLM proxy.
 *
 * The rubric: one Noul per spec acceptance criterion / error case / required
 * test, fixed Nouls for this repo's quality rules (the old LLM audit, now
 * typed), and one Score for complexity. Every decision fails closed: an
 * answer in the uncertain band counts as a failure.
 */
import { traceable } from "langsmith/traceable";
import { JEV } from "./config.js";
import type { Spec } from "./spec.js";

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}
export interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}
type JevQuestion = NoulQuestion | ScoreQuestion;

type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "score"; score: number; confidence: number; probabilities?: Record<string, number> }
  | { type: "choice"; choice: string; confidence: number };

/** Network / rate limit / overload after retries — worth retrying later, never a verdict. */
export class JevUnavailableError extends Error {}
/** Missing key, bad auth, or a rejected request — needs a human. */
export class JevConfigError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const jevEvaluate = traceable(
  async (state: object, questions: Record<string, JevQuestion>): Promise<Record<string, JevAnswer>> => {
    const apiKey = process.env.TYPESAFE_API_KEY;
    if (!apiKey) throw new JevConfigError("TYPESAFE_API_KEY is not set — see .env.example.");

    let lastError = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${JEV.baseUrl}/v1/systemone`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: JEV.model, state, questions }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (res.ok) {
        const body = (await res.json()) as { answers?: Record<string, JevAnswer>; usage?: { input_tokens?: number } };
        const answers = body.answers ?? {};
        for (const [id, q] of Object.entries(questions)) {
          if (answers[id]?.type !== q.type) throw new JevUnavailableError(`Jev returned no ${q.type} answer for "${id}".`);
        }
        console.log(`[jev] ${Object.keys(questions).length} questions, ${body.usage?.input_tokens ?? "?"} input tokens`);
        return answers;
      }
      lastError = `${res.status} ${(await res.text()).slice(0, 500)}`;
      if (res.status === 429 || res.status === 529 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      throw new JevConfigError(`Jev rejected the request: ${lastError}`);
    }
    throw new JevUnavailableError(`Jev unavailable after retries: ${lastError}`);
  },
  { name: "jev", run_type: "tool" }
);

// ---------------------------------------------------------------------------
// Rubric
// ---------------------------------------------------------------------------

export interface RubricItem {
  id: string;
  label: string;
  question: NoulQuestion;
  /** The answer that means "this PR is fine" for this question. */
  passWhen: "yes" | "no";
}

const noul = (instructions: string, yes: string, no: string): NoulQuestion => ({ type: "noul", instructions, criteria: { true: yes, false: no } });

/** Levels low→high. Jev scores each level independently, so each describes a concrete situation. */
export const COMPLEXITY_QUESTION: ScoreQuestion = {
  type: "score",
  instructions: "How much code and structure does state.diff use, relative to what state.spec actually requires?",
  criteria: [
    "Minimal: the least code that meets the spec; reuses existing helpers and patterns; no new abstractions",
    "Lean: small local helpers, each justified by use inside this diff",
    "Moderate: some indirection, configuration or generality the spec does not need",
    "Heavy: speculative abstractions, extra layers or new dependencies the spec does not need",
    "Bloated: boilerplate, duplicated logic or framework-style scaffolding for a small requirement",
  ],
};

export function buildRubric(spec: Spec, changedPaths: string[]): RubricItem[] {
  const items: RubricItem[] = [];
  spec.acceptanceCriteria.forEach((ac, i) =>
    items.push({
      id: `ac_${i + 1}`,
      label: `${ac.id}: ${ac.statement}`,
      passWhen: "yes",
      question: noul(
        `Does state.diff fully implement this acceptance criterion from state.spec: "${ac.statement}"?`,
        "The diff contains code that makes the criterion true as stated",
        "The criterion is missing, only partly implemented, or contradicted by the diff"
      ),
    })
  );
  spec.errorHandling.forEach((e, i) =>
    items.push({
      id: `err_${i + 1}`,
      label: `Handles: ${e.case}`,
      passWhen: "yes",
      question: noul(
        `Does the code in state.diff handle this failure case exactly as state.spec requires? Case: "${e.case}". Required behaviour: "${e.expectedBehavior}".`,
        "The case is handled with the required behaviour",
        "The case is unhandled or handled differently"
      ),
    })
  );
  spec.testing.requiredTests.forEach((t, i) =>
    items.push({
      id: `test_${i + 1}`,
      label: `Test ${t.path}`,
      passWhen: "yes",
      question: noul(
        `Does state.diff add or update ${t.path} with assertions that actually verify: "${t.verifies}"?`,
        "The test exists in the diff and its assertions check that behaviour",
        "The test is missing, trivial, or asserts something else"
      ),
    })
  );

  const quality: [string, string, string, string, string][] = [
    ["q_behavior", "Changes behaviour (not a no-op)", "yes", "Does state.diff change the program's observable behaviour, rather than only formatting, comments, or an equivalent rewrite of the same logic?", "Behaviour changes"],
    ["q_scope", "No unrequested scope", "no", "Does state.diff add features, options, abstractions, configuration or dependencies that state.spec does not ask for?", "Adds unrequested scope"],
    ["q_tests_weakened", "No weakened tests", "no", "Does state.diff delete, skip, loosen or comment out an existing test or assertion?", "A test or assertion is weakened"],
    ["q_secrets", "No hardcoded secrets", "no", "Does state.diff add a hardcoded secret, password, API key or access token?", "A secret is hardcoded"],
    ["q_async", "No unhandled promises", "no", "Does state.diff add an async call whose rejection is neither awaited inside error handling nor caught?", "An async failure can go unhandled"],
    ["q_any", "No `any` / ts-ignore", "no", "Does state.diff introduce the TypeScript `any` type, `@ts-ignore` or `@ts-expect-error`?", "Type safety is bypassed"],
  ];
  if (changedPaths.some((p) => p.startsWith("medusa/src/api/"))) {
    quality.push(["q_route_logic", "Medusa logic outside route handlers", "no", "Does state.diff put business logic (data writes or multi-step operations) directly in a Medusa API route handler instead of a workflow, service or subscriber?", "Business logic sits in a route handler"]);
  }
  if (changedPaths.some((p) => p.startsWith("medusa/"))) {
    quality.push(["q_unbounded_query", "Paginated queries", "no", "Does state.diff add a database query or list endpoint that can return every row without pagination or a limit?", "A query is unbounded"]);
  }
  if (changedPaths.some((p) => p.startsWith("storefront/src/"))) {
    quality.push(["q_use_client", "'use client' only on interactive leaves", "no", "Does state.diff add 'use client' to a component that has no state, effects or event handlers?", "'use client' is added to a non-interactive component"]);
    quality.push(["q_raw_img", "Next.js <Image/> for images", "no", "Does state.diff render a raw <img> element instead of Next.js <Image /> with dimensions?", "A raw <img> is rendered"]);
  }
  if (changedPaths.some((p) => /(^|\/)docker-compose[^/]*\.ya?ml$/.test(p))) {
    quality.push(["q_compose_limits", "Compose resource limits", "yes", "Does every docker-compose service added or changed in state.diff declare deploy.resources.limits.memory and deploy.resources.limits.cpus?", "Every changed service has memory and cpu limits"]);
    quality.push(["q_redis_policy", "Redis noeviction kept", "no", "Does state.diff change Redis's --maxmemory-policy flag?", "The Redis eviction policy changes"]);
  }
  for (const [id, label, passWhen, instructions, yesMeans] of quality) {
    items.push({ id, label, passWhen: passWhen as "yes" | "no", question: noul(instructions, yesMeans, `Not the case: ${yesMeans.toLowerCase()}`) });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Decision
// ---------------------------------------------------------------------------

export interface JevVerdict {
  pass: boolean;
  items: { id: string; label: string; passWhen: "yes" | "no"; pYes: number; status: "pass" | "fail" | "uncertain" }[];
  complexity: { score: number; confidence: number; max: number; pass: boolean };
}

export function decide(rubric: RubricItem[], answers: Record<string, JevAnswer>, threshold = JEV.passThreshold, maxComplexity = JEV.maxComplexity): JevVerdict {
  const items = rubric.map((r) => {
    const a = answers[r.id];
    const pYes = a?.type === "noul" ? a.noul : 0.5;
    const pGood = r.passWhen === "yes" ? pYes : 1 - pYes;
    const status: "pass" | "fail" | "uncertain" = pGood >= threshold ? "pass" : pGood <= 1 - threshold ? "fail" : "uncertain";
    return { id: r.id, label: r.label, passWhen: r.passWhen, pYes, status };
  });
  const c = answers.complexity;
  const score = c?.type === "score" ? c.score : Number.POSITIVE_INFINITY;
  const complexity = { score, confidence: c?.type === "score" ? c.confidence : 0, max: maxComplexity, pass: score <= maxComplexity };
  return { pass: items.every((i) => i.status === "pass") && complexity.pass, items, complexity };
}

// ---------------------------------------------------------------------------
// State assembly
// ---------------------------------------------------------------------------

/** Not reviewed: the spec itself (passed separately), lockfiles, snapshots. */
const IGNORED_IN_REVIEW = /^(docs\/specs\/|(.*\/)?(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$|.*\.snap$)/;

/** Splits a unified diff per file and drops files Jev should not spend tokens on. */
export function filterDiff(diff: string): { kept: string; files: string[] } {
  const chunks = diff.split(/^(?=diff --git )/m).filter((c) => c.startsWith("diff --git "));
  const kept: string[] = [];
  const files: string[] = [];
  for (const chunk of chunks) {
    const path = chunk.match(/^diff --git a\/(\S+) b\/(\S+)/)?.[2] ?? "";
    files.push(path);
    if (!IGNORED_IN_REVIEW.test(path)) kept.push(chunk);
  }
  return { kept: kept.join(""), files };
}

/** Conservative for code-heavy text (~3 chars/token), so a "fits" estimate really fits Jev's 32K window. */
export const estimateTokens = (value: unknown): number => Math.ceil(JSON.stringify(value).length / 3);

export function buildJevState(spec: Spec, reviewDiff: string): object {
  return {
    task: "Review a pull request diff against the locked spec it must implement.",
    spec: {
      title: spec.title,
      objective: spec.objective,
      rootCause: spec.rootCause,
      acceptanceCriteria: spec.acceptanceCriteria,
      errorHandling: spec.errorHandling,
      fileStructure: spec.fileStructure,
      requiredTests: spec.testing.requiredTests,
      never: spec.boundaries.never,
      ui: spec.ui,
    },
    diff: reviewDiff,
  };
}
