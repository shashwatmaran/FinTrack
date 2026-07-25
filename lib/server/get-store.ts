import "server-only";

import { features } from "@/lib/env";
import { memoryStore } from "./memory-store";
import type { DataStore } from "./store-types";

let warned = false;

/**
 * Picks the backing store once per call. MongoDB is loaded lazily so the
 * driver is never pulled into the bundle when no connection string is set.
 */
export async function getStore(): Promise<DataStore> {
  if (!features.database) {
    if (!warned && process.env.NODE_ENV !== "test") {
      warned = true;
      console.warn(
        "[fintrack] MONGODB_URI is not set — using the in-memory store. Data resets when the server restarts."
      );
    }
    return memoryStore;
  }

  const { mongoStore } = await import("./mongo-store");
  return mongoStore;
}
