/**
 * Verifies the MongoDB connection and reports what's in the database.
 *
 *   npm run db:check
 *
 * Run this first when Atlas isn't behaving — it separates "can't connect"
 * from "connected but empty", which are very different problems.
 */
import { config } from "dotenv";
import { MongoClient } from "mongodb";

config({ path: ".env.local" });
config({ path: ".env" });

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "fintrack";

if (!uri) {
  console.log("MONGODB_URI is not set — the app is running on the in-memory store.");
  console.log("Add your Atlas connection string to .env.local to enable persistence.");
  process.exit(0);
}

/** Never print the password, even in a local script. */
function redact(connectionString: string) {
  return connectionString.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@");
}

async function main(connectionString: string) {
  console.log(`URI:      ${redact(connectionString)}`);
  console.log(`Database: ${dbName}\n`);

  const client = new MongoClient(connectionString, { serverSelectionTimeoutMS: 10_000 });
  const started = Date.now();
  await client.connect();
  await client.db(dbName).command({ ping: 1 });
  console.log(`Connected in ${Date.now() - started}ms\n`);

  const db = client.db(dbName);
  const names = ["users", "groups", "expenses", "settlements", "notifications", "activity"];

  let total = 0;
  for (const name of names) {
    const count = await db.collection(name).countDocuments();
    total += count;
    const indexes = await db
      .collection(name)
      .listIndexes()
      .toArray()
      .catch(() => []);
    console.log(`  ${name.padEnd(14)} ${String(count).padStart(4)} docs  ${indexes.length} indexes`);
  }

  console.log(
    total === 0
      ? "\nDatabase is empty. Run 'npm run seed' to load the demo data."
      : `\n${total} documents total.`
  );

  await client.close();
}

main(uri).catch((error) => {
  console.error("\nConnection failed:", error instanceof Error ? error.message : error);
  console.error(
    "\nChecklist:\n" +
      "  1. Atlas > Network Access — is your current IP allowlisted?\n" +
      "  2. Atlas > Database Access — does the user exist with the right password?\n" +
      "  3. Special characters in the password must be URL-encoded (@ -> %40)\n" +
      "  4. Is the cluster finished provisioning?"
  );
  process.exit(1);
});
