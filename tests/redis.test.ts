import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The Redis client is the only module holding a bearer token, and its errors
 * get logged by callers. Logs travel further than the code that writes them, so
 * the assertions that matter most are about what its error messages must never
 * contain.
 */
const envMock = {
  KV_REST_API_URL: "https://db.upstash.io" as string | undefined,
  KV_REST_API_TOKEN: "AX7sHIGHLYSECRETTOKEN" as string | undefined,
};

vi.mock("@/lib/env", () => ({
  get env() {
    return envMock;
  },
  features: {},
}));

const { pipeline, isRedisConfigured, RedisUnavailableError } = await import(
  "@/lib/server/redis"
);

const SECRET = "AX7sHIGHLYSECRETTOKEN";

beforeEach(() => {
  envMock.KV_REST_API_URL = "https://db.upstash.io";
  envMock.KV_REST_API_TOKEN = SECRET;
  vi.restoreAllMocks();
});

describe("configuration", () => {
  it("reports configured when both values are present", () => {
    expect(isRedisConfigured()).toBe(true);
  });

  it("reports unconfigured when the token is missing", () => {
    envMock.KV_REST_API_TOKEN = undefined;
    expect(isRedisConfigured()).toBe(false);
  });

  it("refuses to run commands when unconfigured", async () => {
    envMock.KV_REST_API_URL = undefined;
    await expect(pipeline([["PING"]])).rejects.toBeInstanceOf(RedisUnavailableError);
  });
});

describe("sending commands", () => {
  it("authorises with the token and posts to /pipeline", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ result: 1 }]), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await pipeline([["INCR", "k"]]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://db.upstash.io/pipeline");
    expect(init.headers.Authorization).toBe(`Bearer ${SECRET}`);
  });

  it("stringifies command arguments", async () => {
    // Upstash rejects numeric JSON values in commands.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ result: 1 }]), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await pipeline([["EXPIRE", "k", 60, "NX"]]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual([["EXPIRE", "k", "60", "NX"]]);
  });

  it("unwraps results in command order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ result: 7 }, { result: 42 }]), { status: 200 })
      )
    );
    expect(await pipeline([["INCR", "k"], ["TTL", "k"]])).toEqual([7, 42]);
  });

  it("rejects a response with the wrong number of results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify([{ result: 1 }]), { status: 200 }))
    );
    await expect(pipeline([["INCR", "k"], ["TTL", "k"]])).rejects.toBeInstanceOf(
      RedisUnavailableError
    );
  });
});

describe("errors never carry the credential", () => {
  it("reports only the status on a rejected request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(`unauthorized: ${SECRET}`, { status: 401 }))
    );

    await expect(pipeline([["PING"]])).rejects.toThrow(/401/);
    await expect(pipeline([["PING"]])).rejects.not.toThrow(new RegExp(SECRET));
  });

  it("does not copy a transport error's message into its own", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error(`connect failed to https://db.upstash.io?t=${SECRET}`))
    );

    const error = await pipeline([["PING"]]).then(
      () => null,
      (e: Error & { cause?: Error }) => e
    );

    expect(error).toBeInstanceOf(RedisUnavailableError);
    expect(error!.message).not.toContain(SECRET);
    // The detail is kept for debugging, just not in the message callers log.
    expect(error!.cause?.message).toContain(SECRET);
  });

  it("times out rather than holding sign-in open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          })
      )
    );

    await expect(pipeline([["PING"]], 20)).rejects.toThrow(/timed out/i);
  });
});
