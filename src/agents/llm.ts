/**
 * The only place the pipeline talks to a model. Every call is a typed,
 * schema-validated extraction — the LLM reasons, tools.ts acts.
 *
 * Provider chain, tried in order (each is optional, configured by env):
 *
 *   1. OmniRoute (OMNIROUTE_BASE_URL + OMNIROUTE_API_KEY) — the self-hosted
 *      gateway on the VPS. The model is a per-role *combo* whose fallback
 *      chain spends free-tier models first and ends with DeepSeek.
 *   2. Direct Anthropic-compatible proxy (ANTHROPIC_BASE_URL set, e.g.
 *      DeepSeek) — the pre-existing secrets. Catches OmniRoute being
 *      unreachable, and free models that keep returning unusable output
 *      (OmniRoute only falls back on quota/rate-limit errors, not on quality).
 *   3. Claude direct (ANTHROPIC_API_KEY is an Anthropic key, no base URL).
 *
 * The gateway/proxy transports force one `extract` tool (`tool_choice: any`)
 * — tool calling is the structured-output mechanism every upstream supports.
 * Claude direct uses native structured outputs instead: Opus/Sonnet 5.5
 * reject forced tool_choice and sampling params.
 *
 * Within a provider, validation failures (including a schema's superRefine
 * rules) are fed back as a corrective turn; a provider that exhausts its
 * attempts or errors hands the request to the next one.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { traceable } from "langsmith/traceable";
import { z } from "zod/v4";
import { CLAUDE_MODELS, GATEWAY_MAX_TOKENS, OMNIROUTE, PROXY_MODEL, type Role } from "./config.js";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const ROLE_EFFORT: Record<Role, Effort | null> = {
  orchestrator: "high",
  worker: "medium",
  workerLight: null,
};

interface Provider {
  name: "omniroute" | "proxy" | "claude";
  client: Anthropic;
  model: (role: Role) => string;
}

const PROVIDERS: Provider[] = [];
if (OMNIROUTE.baseUrl && OMNIROUTE.apiKey) {
  // authToken -> `Authorization: Bearer`, which is what OmniRoute checks.
  // apiKey: null keeps the SDK from also sending ANTHROPIC_API_KEY (the
  // DeepSeek key) to the gateway.
  PROVIDERS.push({
    name: "omniroute",
    client: new Anthropic({ baseURL: OMNIROUTE.baseUrl, apiKey: null, authToken: OMNIROUTE.apiKey, maxRetries: 2 }),
    model: (role) => OMNIROUTE.combos[role],
  });
}
if (process.env.ANTHROPIC_API_KEY) {
  PROVIDERS.push(
    process.env.ANTHROPIC_BASE_URL
      ? { name: "proxy", client: new Anthropic({ maxRetries: 3 }), model: () => PROXY_MODEL }
      : { name: "claude", client: new Anthropic({ maxRetries: 4 }), model: (role) => CLAUDE_MODELS[role] }
  );
}

/** `effort` is rejected by Haiku 4.5 / Sonnet 4.5 and older models. */
const supportsEffort = (model: string) => /^claude-(fable|mythos|opus-5|sonnet-5|opus-4-[5-8]|sonnet-4-6)/.test(model);
/** Models that accept `fallbacks: "default"` (beta server-side-fallback-2026-07-01). */
const supportsDefaultFallbacks = (model: string) => /^claude-(fable-5|opus-5|sonnet-5-5)/.test(model);

/** A safety-classifier decline that even Claude's fallback chain refused. Not retried — callers block for a human. */
export class RefusalError extends Error {}

interface CallResult {
  raw: unknown;
  text: string;
  stopReason: string | null;
  model: string;
  usage_metadata: { input_tokens: number; output_tokens: number; total_tokens: number };
}

type Messages = { role: "user"; content: string }[];

const callModel = traceable(
  async (p: { name: string; provider: Provider; role: Role; model: string; system: string; messages: Messages; jsonSchema: Record<string, unknown>; effort: Effort | null }): Promise<CallResult> => {
    const { provider, model, system, messages, jsonSchema, effort } = p;

    if (provider.name === "claude") {
      const stream = provider.client.beta.messages.stream({
        model,
        max_tokens: 64_000,
        // Cache the stable prefix (skills + rules + repo index): retries and
        // sibling subagents re-send it verbatim.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
        output_config: {
          ...(effort && supportsEffort(model) ? { effort } : {}),
          format: { type: "json_schema", schema: jsonSchema },
        },
        ...(supportsDefaultFallbacks(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      const res = await stream.finalMessage();
      const text = textOf(res.content);
      return { raw: parseJsonLoose(text), text, stopReason: res.stop_reason, model: res.model, usage_metadata: usage(res.usage) };
    }

    const res = await provider.client.messages.create({
      model,
      max_tokens: GATEWAY_MAX_TOKENS,
      system,
      messages,
      tools: [{ name: "extract", description: "Return the requested structured data.", input_schema: jsonSchema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "any" },
      // DeepSeek's Anthropic endpoint routes thinking-mode requests to a model
      // that emits no tool_use; OmniRoute's upstreams get provider defaults.
      ...(provider.name === "proxy" ? { temperature: 0, thinking: { type: "disabled" as const } } : {}),
    });
    const toolUse = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const text = textOf(res.content);
    // Some free models answer with JSON in text despite tool_choice — accept it.
    return { raw: toolUse?.input ?? parseJsonLoose(text), text, stopReason: res.stop_reason, model: res.model, usage_metadata: usage(res.usage) };
  },
  {
    name: "llm",
    run_type: "llm",
    processInputs: (inputs) => ({ call: inputs.name, provider: inputs.provider.name, role: inputs.role, model: inputs.model, messages: inputs.messages }),
  }
);

function textOf(content: ReadonlyArray<{ type: string }>): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** JSON from a bare response, a ```json fence, or the outermost {...} span; undefined if none parses. */
export function parseJsonLoose(text: string): unknown {
  const candidates = [text, text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1], text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)];
  for (const c of candidates) {
    if (!c || !c.trim()) continue;
    try {
      return JSON.parse(c);
    } catch {
      // try the next shape
    }
  }
  return undefined;
}

function usage(u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
  const input = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  return { input_tokens: input, output_tokens: u.output_tokens ?? 0, total_tokens: input + (u.output_tokens ?? 0) };
}

/**
 * Asks `role` for a value matching `schema`, walking the provider chain.
 * Each retry re-sends the original prompt plus one corrective user turn, so
 * the prompt prefix stays byte-identical (cache-friendly, append-only).
 */
export async function extractStructured<S extends z.ZodType>(
  schema: S,
  req: { role: Role; name: string; system: string; user: string; maxAttempts?: number; effort?: Effort }
): Promise<z.infer<S>> {
  if (PROVIDERS.length === 0) {
    throw new Error("No model provider configured: set OMNIROUTE_BASE_URL + OMNIROUTE_API_KEY and/or ANTHROPIC_API_KEY (see .env.example).");
  }
  const jsonSchema = betaZodOutputFormat(schema).schema as Record<string, unknown>;
  const maxAttempts = req.maxAttempts ?? 3;
  const failures: string[] = [];

  for (const provider of PROVIDERS) {
    const model = provider.model(req.role);
    let correction: string | null = null;
    let lastError = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const messages: Messages = [{ role: "user", content: req.user }];
      if (correction) messages.push({ role: "user", content: correction });

      let res: CallResult;
      try {
        res = await callModel({ name: req.name, provider, role: req.role, model, system: req.system, messages, jsonSchema, effort: req.effort ?? ROLE_EFFORT[req.role] });
      } catch (err) {
        if (!(err instanceof Anthropic.APIError)) throw err;
        lastError = `${err.status ?? "connection"} ${err.message}`;
        console.warn(`[llm] ${req.name}: ${provider.name} failed (${lastError}) — trying the next provider`);
        break;
      }

      const u = res.usage_metadata;
      console.log(`[llm] ${req.name}: ${provider.name} model=${res.model} attempt=${attempt} in=${u.input_tokens} out=${u.output_tokens} stop=${res.stopReason}`);
      if (res.stopReason === "refusal") {
        throw new RefusalError(`${req.name}: the model declined this request (stop_reason=refusal, served by ${res.model}).`);
      }

      const parsed = res.raw === undefined ? null : schema.safeParse(res.raw);
      if (parsed?.success) return parsed.data;

      lastError =
        res.stopReason === "max_tokens"
          ? "the response hit max_tokens before it was complete"
          : parsed
            ? parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")
            : "no structured result (no extract tool call and no parseable JSON)";
      console.warn(`[llm] ${req.name}: ${provider.name} attempt ${attempt} rejected — ${lastError}`);
      const previous = res.text || (res.raw === undefined ? "" : JSON.stringify(res.raw));
      correction = [
        `Your previous response was rejected: ${lastError}.`,
        res.stopReason === "max_tokens" ? "Be more concise so the complete response fits." : "",
        provider.name === "claude" ? "" : "Respond ONLY by calling the `extract` tool with the complete arguments.",
        "Re-read the request and return the COMPLETE corrected response, satisfying every rule above.",
        previous ? `Previous response (for reference):\n${previous.slice(0, 6000)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    }
    failures.push(`${provider.name}: ${lastError}`);
  }
  throw new Error(`${req.name}: every provider failed — ${failures.join(" | ")}`);
}
