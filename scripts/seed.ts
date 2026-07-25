/**
 * Seeds a MongoDB database with the demo dataset.
 *
 *   npm run seed          # insert, refusing to touch a non-empty database
 *   npm run seed -- --reset   # drop the collections first
 *
 * Reads MONGODB_URI from .env.local. Safe to run against an empty Atlas
 * cluster; it will not silently overwrite existing data.
 */
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { MongoClient } from "mongodb";
import {
  ACTIVITY,
  DEMO_PASSWORD,
  DEMO_USER_ID,
  EXPENSES,
  GROUPS,
  NOTIFICATIONS,
  SETTLEMENTS,
  USERS,
} from "../lib/mock-data";

config({ path: ".env.local" });
config({ path: ".env" });

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "fintrack";
const reset = process.argv.includes("--reset");

if (!uri) {
  console.error(
    "MONGODB_URI is not set.\n" +
      "Add your Atlas connection string to .env.local, then run this again."
  );
  process.exit(1);
}

async function main(connectionString: string) {
  const client = new MongoClient(connectionString, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  console.log(`Connected to ${dbName}`);

  const db = client.db(dbName);
  const names = ["users", "groups", "expenses", "settlements", "notifications", "activity"];

  if (reset) {
    for (const name of names) {
      await db.collection(name).deleteMany({});
    }
    console.log("Cleared existing collections");
  } else {
    const existing = await db.collection("users").estimatedDocumentCount();
    if (existing > 0) {
      console.error(
        `Refusing to seed: 'users' already has ${existing} documents.\n` +
          "Re-run with --reset if you want to replace the data."
      );
      await client.close();
      process.exit(1);
    }
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const now = new Date().toISOString();

  await db.collection("users").insertMany(
    USERS.map((u) => ({
      _id: u.id,
      name: u.name,
      email: u.email.toLowerCase(),
      initials: u.initials,
      color: u.color,
      passwordHash,
      createdAt: now,
    })) as never
  );

  await db.collection("groups").insertMany(
    GROUPS.map((g) => ({
      _id: g.id,
      name: g.name,
      type: g.type,
      color: g.color,
      memberIds: g.memberIds,
      createdAt: g.createdAt,
    })) as never
  );

  await db.collection("expenses").insertMany(
    EXPENSES.map((e) => ({
      _id: e.id,
      groupId: e.groupId,
      description: e.description,
      category: e.category,
      amount: e.amount,
      payerId: e.payerId,
      splitMethod: e.splitMethod,
      splits: e.splits,
      date: e.date,
      ...(e.notes ? { notes: e.notes } : {}),
      ...(e.recurring ? { recurring: e.recurring } : {}),
    })) as never
  );

  await db.collection("settlements").insertMany(
    SETTLEMENTS.map((s) => ({
      _id: s.id,
      groupId: s.groupId,
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      amount: s.amount,
      status: s.status,
      method: s.method,
      createdAt: s.createdAt,
    })) as never
  );

  await db.collection("notifications").insertMany(
    NOTIFICATIONS.map((n) => ({
      _id: n.id,
      userId: DEMO_USER_ID,
      title: n.title,
      body: n.body,
      read: n.read,
      createdAt: n.createdAt,
    })) as never
  );

  await db.collection("activity").insertMany(
    ACTIVITY.map((a) => ({
      _id: a.id,
      groupId: a.groupId,
      actorId: a.actorId,
      message: a.message,
      createdAt: a.createdAt,
    })) as never
  );

  for (const name of names) {
    console.log(`  ${name}: ${await db.collection(name).countDocuments()} documents`);
  }

  console.log("\nSeed complete. Sign in with:");
  console.log(`  email:    ${USERS[0].email}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log("\nIndexes are created automatically on first request from the app.");

  await client.close();
}

main(uri).catch((error) => {
  console.error("\nSeed failed:", error instanceof Error ? error.message : error);
  console.error(
    "\nCommon causes:\n" +
      "  - Your IP isn't in the Atlas Network Access allowlist\n" +
      "  - The database user's password is wrong or needs URL-encoding\n" +
      "  - The cluster is still provisioning"
  );
  process.exit(1);
});
