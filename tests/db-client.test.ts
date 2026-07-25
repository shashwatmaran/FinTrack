import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Pins the one-pool-per-process invariant.
 *
 * The original implementation cached the client only when
 * NODE_ENV === "development", so every other environment opened a fresh
 * MongoClient — and a fresh connection pool — on each call. Every store method
 * resolves `collections()`, so one page load would have opened dozens of pools
 * and exhausted the cluster's connection limit. It was invisible locally
 * because dev took the cached path.
 *
 * Vitest runs as NODE_ENV=test, which is precisely the branch that was broken,
 * so these assertions exercise the regression directly without having to
 * mutate NODE_ENV at runtime.
 */
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = "fintrack_client_test";
});

afterAll(async () => {
  const { __resetMongoClientForTests } = await import("@/lib/db/client");
  await __resetMongoClientForTests();
  await mongod?.stop();
});

describe("getMongoClient", () => {
  it("is not running in the development branch", () => {
    expect(process.env.NODE_ENV).not.toBe("development");
  });

  it("returns the identical client for repeated sequential calls", async () => {
    const { getMongoClient, __resetMongoClientForTests } = await import("@/lib/db/client");
    await __resetMongoClientForTests();

    const first = await getMongoClient();
    const second = await getMongoClient();
    const third = await getMongoClient();

    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("opens only one client under concurrent calls", async () => {
    const { getMongoClient, __resetMongoClientForTests } = await import("@/lib/db/client");
    await __resetMongoClientForTests();

    const clients = await Promise.all(Array.from({ length: 8 }, () => getMongoClient()));
    expect(new Set(clients).size).toBe(1);
  });

  it("shares that one client across every getDb call", async () => {
    const { getDb, __resetMongoClientForTests } = await import("@/lib/db/client");
    await __resetMongoClientForTests();

    const dbs = await Promise.all([getDb(), getDb(), getDb()]);
    expect(dbs.every((d) => d.databaseName === "fintrack_client_test")).toBe(true);
    // Same underlying client means the same topology object.
    expect(new Set(dbs.map((d) => d.client)).size).toBe(1);
  });

  it("throws a clear error when no connection string is configured", async () => {
    const saved = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;
    // `env` is parsed at module load, so the registry has to be cleared for a
    // different environment to be observed.
    vi.resetModules();

    const { getMongoClient } = await import("@/lib/db/client");
    expect(() => getMongoClient()).toThrow(/MONGODB_URI is not set/);

    process.env.MONGODB_URI = saved;
    vi.resetModules();
  });
});
