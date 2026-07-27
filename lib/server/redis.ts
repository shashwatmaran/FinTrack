import "server-only";

import { env } from "@/lib/env";

/**
 * Minimal Upstash Redis client over its REST API.
 *
 * Deliberately not the vendor SDK, for the same reason `lib/ai/client.ts`
 * isn't: the surface used here is one POST with a JSON body, and a dependency
 * would tie the app to a provider that any Redis-over-HTTP service could
 * replace. Vercel provisions Upstash under the `KV_*` names.
 *
 * Commands are sent as arrays of strings — `[["INCR", "k"], ["TTL", "k"]]` —
 * and come back as `[{ result }, { result }]` in the same order.
 */

export class RedisUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RedisUnavailableError";
  }
}

type Command = (string | number)[];

export function isRedisConfigured(): boolean {
  return Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN);
}

/**
 * Runs commands in one round trip.
 *
 * `timeoutMs` is short on purpose: this sits in front of sign-in, and a slow
 * store must not add seconds to every attempt. The caller treats a timeout as
 * "Redis is unavailable" and falls back rather than blocking the request.
 */
export async function pipeline(
  commands: Command[],
  timeoutMs = 2000
): Promise<unknown[]> {
  const url = env.KV_REST_API_URL;
  const token = env.KV_REST_API_TOKEN;
  if (!url || !token) throw new RedisUnavailableError("KV_REST_API_* are not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      cache: "no-store",
    });

    if (!response.ok) {
      // The body can echo the command, so only the status is surfaced.
      throw new RedisUnavailableError(`Redis returned ${response.status}`);
    }

    const body: unknown = await response.json();
    if (!Array.isArray(body) || body.length !== commands.length) {
      throw new RedisUnavailableError("Unexpected pipeline response shape");
    }

    return body.map((entry) =>
      entry && typeof entry === "object" && "result" in entry
        ? (entry as { result: unknown }).result
        : null
    );
  } catch (error) {
    if (error instanceof RedisUnavailableError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new RedisUnavailableError(`Redis timed out after ${timeoutMs}ms`);
    }
    /**
     * The original message is attached as `cause` rather than copied into
     * ours. A transport error can quote the request it failed on, and this is
     * the one module holding a bearer token — callers log these messages, and
     * logs travel further than the code that wrote them.
     */
    throw new RedisUnavailableError("Redis unreachable", { cause: error });
  } finally {
    clearTimeout(timer);
  }
}
