import "server-only";

import { env } from "@/lib/env";

/**
 * Minimal client for any OpenAI-compatible `/chat/completions` endpoint.
 *
 * That wire format is the de facto standard for serving open-weight models, so
 * one ~60-line client covers every deployment target we care about:
 *
 *   Ollama (local)  AI_BASE_URL=http://localhost:11434/v1   no key, no cost
 *   Groq            AI_BASE_URL=https://api.groq.com/openai/v1
 *   OpenRouter      AI_BASE_URL=https://openrouter.ai/api/v1  (`:free` models)
 *   llama.cpp/vLLM  whatever host you run it on
 *
 * Deliberately not an SDK: the surface used here is one POST with a JSON body,
 * and a vendor SDK would tie the app to a provider we explicitly want to keep
 * swappable.
 */

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface CompletionOptions {
  messages: ChatMessage[];
  maxTokens?: number;
  /** Milliseconds before the request is abandoned. */
  timeoutMs?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
}

export function isAiConfigured(): boolean {
  return Boolean(env.AI_BASE_URL && env.AI_MODEL);
}

export async function complete({
  messages,
  maxTokens = 220,
  timeoutMs = 20_000,
}: CompletionOptions): Promise<CompletionResult> {
  const baseUrl = env.AI_BASE_URL;
  const model = env.AI_MODEL;
  if (!baseUrl || !model) {
    throw new AiUnavailableError("AI_BASE_URL and AI_MODEL are not configured");
  }

  // A slow or hung model server must never hold an expense write open.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(env.AI_API_KEY ? { Authorization: `Bearer ${env.AI_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        // Low but non-zero: these are one-paragraph summaries, and we want them
        // stable enough that regenerating on an unchanged month reads the same.
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AiUnavailableError(
        `Model server returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`
      );
    }

    const body = await response.json();
    const text: unknown = body?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.trim() === "") {
      throw new AiUnavailableError("Model server returned an empty completion");
    }

    return { text: text.trim(), model: typeof body.model === "string" ? body.model : model };
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiUnavailableError(`Model server timed out after ${timeoutMs}ms`);
    }
    throw new AiUnavailableError(
      error instanceof Error ? error.message : "Model server unreachable"
    );
  } finally {
    clearTimeout(timer);
  }
}
