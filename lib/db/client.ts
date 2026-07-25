import "server-only";

import { MongoClient, type Db } from "mongodb";
import { env } from "@/lib/env";

/**
 * Exactly one MongoClient (and therefore one connection pool) per process.
 *
 * The module-level cache is what enforces that. The extra globalThis cache is
 * only for development, where Next.js hot-reload re-evaluates the module and
 * would otherwise leak a pool per edit.
 *
 * Caching in production is not optional: every store method resolves
 * `collections()`, so connecting per call would open dozens of pools per page
 * load and exhaust the cluster's connection limit.
 */
declare global {
  var __fintrackMongo: Promise<MongoClient> | undefined;
}

let cached: Promise<MongoClient> | undefined;

function connect(uri: string): Promise<MongoClient> {
  return new MongoClient(uri, {
    // Fail fast instead of hanging the request when the cluster is unreachable
    // or the IP isn't allowlisted — the most common Atlas setup mistake.
    serverSelectionTimeoutMS: 8000,
    retryWrites: true,
  }).connect();
}

export function getMongoClient(): Promise<MongoClient> {
  const uri = env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. The app falls back to in-memory data; this should never be called."
    );
  }

  if (process.env.NODE_ENV === "development") {
    globalThis.__fintrackMongo ??= connect(uri);
    return globalThis.__fintrackMongo;
  }

  cached ??= connect(uri);
  return cached;
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(env.MONGODB_DB ?? "fintrack");
}

/** Test-only: drops the cached connection so a suite can point at a new server. */
export async function __resetMongoClientForTests(): Promise<void> {
  const open = cached ?? globalThis.__fintrackMongo;
  cached = undefined;
  globalThis.__fintrackMongo = undefined;
  if (open) await (await open).close().catch(() => {});
}
