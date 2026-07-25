import { beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import type { DataStore } from "@/lib/server/store-types";
import { runStoreContract } from "./store-contract";
import { seedTestDb } from "./helpers/seed-test-db";

/**
 * The same contract as memory-store, against a real mongod.
 *
 * MONGODB_URI has to exist before `lib/env.ts` is first evaluated, so the
 * store is pulled in with a dynamic import after the server is up rather than
 * a top-level import.
 */
let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let store: DataStore;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = "fintrack_test";

  client = new MongoClient(mongod.getUri());
  await client.connect();
  db = client.db("fintrack_test");

  ({ mongoStore: store } = await import("@/lib/server/mongo-store"));
});

afterAll(async () => {
  const { __resetMongoClientForTests } = await import("@/lib/db/client");
  await __resetMongoClientForTests();
  await client?.close();
  await mongod?.stop();
});

runStoreContract({
  name: "mongo-store",
  async create() {
    await seedTestDb(db);
    return store;
  },
});
