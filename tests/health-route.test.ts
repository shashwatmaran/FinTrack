import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The health endpoint is unauthenticated by necessity — it has to answer when
 * auth itself is the broken thing. So the assertions that matter most are about
 * what it must *not* say: a driver error routinely carries the whole connection
 * string, credentials included.
 */
const featuresMock = { database: false, auth: false, aiInsights: false, scheduledJobs: false };
const getDb = vi.fn();

vi.mock("@/lib/env", () => ({
  get features() {
    return featuresMock;
  },
  env: {},
}));
vi.mock("@/lib/db/client", () => ({ getDb }));

const { GET } = await import("@/app/api/health/route");

beforeEach(() => {
  featuresMock.database = false;
  featuresMock.auth = false;
  featuresMock.aiInsights = false;
  featuresMock.scheduledJobs = false;
  getDb.mockReset();
  vi.unstubAllEnvs();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const body = async () => (await GET()).json();

describe("health endpoint", () => {
  it("reports the in-memory fallback when no database is configured", async () => {
    expect((await body()).database).toBe("in-memory");
  });

  it("does not try to connect when no database is configured", async () => {
    await GET();
    expect(getDb).not.toHaveBeenCalled();
  });

  it("reports connected when the ping succeeds", async () => {
    featuresMock.database = true;
    featuresMock.auth = true;
    getDb.mockResolvedValue({ command: vi.fn().mockResolvedValue({ ok: 1 }) });

    const res = await GET();
    expect((await res.json()).database).toBe("connected");
    expect(res.status).toBe(200);
  });

  it("reports unreachable and 503 when the ping fails", async () => {
    featuresMock.database = true;
    featuresMock.auth = true;
    getDb.mockRejectedValue(new Error("MongoServerSelectionError"));

    const res = await GET();
    expect((await res.json()).database).toBe("unreachable");
    expect(res.status).toBe(503);
  });

  it("never leaks the connection string from a driver error", async () => {
    featuresMock.database = true;
    getDb.mockRejectedValue(
      new Error("connect ECONNREFUSED mongodb+srv://admin:hunter2@cluster0.abc.mongodb.net")
    );

    const text = JSON.stringify(await body());
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("mongodb+srv");
    expect(text).not.toContain("cluster0");
  });

  it("flags AUTH_URL still pointing at localhost", async () => {
    // The signature of env vars copied out of .env.local into a deploy.
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    expect((await body()).authUrlIsLocalhost).toBe(true);
  });

  it("counts a localhost AUTH_URL as unhealthy once deployed", async () => {
    featuresMock.database = true;
    featuresMock.auth = true;
    getDb.mockResolvedValue({ command: vi.fn().mockResolvedValue({ ok: 1 }) });
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    vi.stubEnv("NODE_ENV", "production");

    // Reachable database, real secret, and still broken — so not "ok".
    expect((await GET()).status).toBe(503);
  });

  it("does not call it unhealthy in development, where localhost is correct", async () => {
    featuresMock.database = true;
    featuresMock.auth = true;
    getDb.mockResolvedValue({ command: vi.fn().mockResolvedValue({ ok: 1 }) });
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    vi.stubEnv("NODE_ENV", "development");

    expect((await GET()).status).toBe(200);
  });

  it("does not flag a real deployment URL", async () => {
    vi.stubEnv("AUTH_URL", "https://fintrack.vercel.app");
    expect((await body()).authUrlIsLocalhost).toBe(false);
  });

  it("never echoes the AUTH_URL value itself", async () => {
    vi.stubEnv("AUTH_URL", "https://internal-staging-host.example.com");
    expect(JSON.stringify(await body())).not.toContain("internal-staging-host");
  });

  it("reports whether AUTH_SECRET is present without revealing it", async () => {
    vi.stubEnv("AUTH_SECRET", "super-secret-value");
    const text = JSON.stringify(await body());

    expect(JSON.parse(text).authSecret).toBe(true);
    expect(text).not.toContain("super-secret-value");
  });
});
