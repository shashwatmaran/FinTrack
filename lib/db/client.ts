import "server-only";

import { MongoClient, type Db } from "mongodb";
import { env } from "@/lib/env";

/**
 * A single MongoClient is reused across the process. In development Next.js
 * hot-reloads modules, so the promise is cached on globalThis to avoid opening
 * a new connection pool on every edit.
 */
declare global {
  var __fintrackMongo: Promise<MongoClient> | undefined;
}

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

  return connect(uri);
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(env.MONGODB_DB ?? "fintrack");
}
