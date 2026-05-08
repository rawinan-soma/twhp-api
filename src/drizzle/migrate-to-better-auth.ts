import { db } from ".";
import { accounts, credentials } from "./schema";
import { randomUUID } from "crypto";

async function migrate() {
  console.log("Starting better-auth migration...");

  const allAccounts = await db.select({ id: accounts.id, password: accounts.password }).from(accounts);
  console.log(`Found ${allAccounts.length} accounts to migrate`);

  for (const account of allAccounts) {
    const now = new Date();
    await db.insert(credentials).values({
      id: randomUUID(),
      accountId: randomUUID(),
      providerId: "credential",
      userId: account.id,
      password: account.password,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  }

  await db.update(accounts).set({
    updatedAt: new Date(),
  });

  console.log(`Migrated ${allAccounts.length} accounts to credentials table`);
  console.log("Migration complete. All existing sessions are invalidated — users must re-login.");

  process.exit(0);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
