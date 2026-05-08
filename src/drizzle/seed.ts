/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import fs from "fs";
import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { parse } from "csv-parse/sync";
import * as bcrypt from "bcrypt";
import { sql, and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "./schema.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

async function seed() {
  console.log("Seed started...");

  const seedDataDir = path.join(process.cwd(), "seed_data");

  // 1. Seed Provinces
  const provinceFile = fs.readFileSync(
    path.join(seedDataDir, "provinces.csv"),
    "utf8",
  );
  const provinceRecords = parse(provinceFile, {
    columns: true,
    skip_empty_lines: true,
  });
  const provincesData = provinceRecords.map((r: any) => ({
    provinceId: Number(r.province_id),
    nameTh: r.name_th,
    healthRegion: Number(r.health_region),
  }));

  await db
    .insert(schema.provinces)
    .values(provincesData)
    .onConflictDoUpdate({
      target: schema.provinces.provinceId,
      set: {
        nameTh: sql`EXCLUDED.name_th`,
        healthRegion: sql`EXCLUDED.health_region`,
      },
    });
  console.log("Provinces seeded");

  // 2. Seed Districts
  const districtFile = fs.readFileSync(
    path.join(seedDataDir, "districts.csv"),
    "utf8",
  );
  const districtRecords = parse(districtFile, {
    columns: true,
    skip_empty_lines: true,
  });
  const districtsData = districtRecords.map((r: any) => ({
    districtId: Number(r.district_id),
    provinceId: Number(r.province_id),
    nameTh: r.name_th,
  }));

  await db
    .insert(schema.districts)
    .values(districtsData)
    .onConflictDoUpdate({
      target: schema.districts.districtId,
      set: {
        provinceId: sql`EXCLUDED.province_id`,
        nameTh: sql`EXCLUDED.name_th`,
      },
    });
  console.log("Districts seeded");

  // 3. Seed Subdistricts
  const subdistrictFile = fs.readFileSync(
    path.join(seedDataDir, "sub_districts.csv"),
    "utf8",
  );
  const subdistrictRecords = parse(subdistrictFile, {
    columns: true,
    skip_empty_lines: true,
  });
  const subdistrictsData = subdistrictRecords.map((r: any) => ({
    subdistrictId: Number(r.subdistrict_id),
    nameTh: r.name_th,
    districtId: Number(r.district_id),
  }));

  // Batch insert subdistricts to avoid large payload issues
  const batchSize = 1000;
  for (let i = 0; i < subdistrictsData.length; i += batchSize) {
    await db
      .insert(schema.subdistricts)
      .values(subdistrictsData.slice(i, i + batchSize))
      .onConflictDoUpdate({
        target: schema.subdistricts.subdistrictId,
        set: {
          nameTh: sql`EXCLUDED.name_th`,
          districtId: sql`EXCLUDED.district_id`,
        },
      });
  }
  console.log("Subdistricts seeded");

  // 4. Seed Provincial Officers
  const provincialOfficerData = JSON.parse(
    fs.readFileSync(path.join(seedDataDir, "admin_province.json"), "utf8"),
  );
  console.log("Seeding Provincial Officers...");
  const provincialHashed = await Promise.all(
    provincialOfficerData.map((item: any) => bcrypt.hash(item.password, 12)),
  );
  const provincialAccounts = await db
    .insert(schema.accounts)
    .values(
      provincialOfficerData.map((item: any) => ({
        username: item.username,
        email: item.email,
        role: "Provincial" as const,
      })),
    )
    .onConflictDoUpdate({
      target: schema.accounts.username,
      set: { email: sql`EXCLUDED.email`, role: sql`EXCLUDED.role` },
    })
    .returning({ id: schema.accounts.id, username: schema.accounts.username });
  const provincialAccountMap = new Map(
    provincialAccounts.map((a) => [a.username, a.id]),
  );
  const provincialAccountIds = provincialAccounts.map((a) => a.id);
  const now = new Date();
  await db.delete(schema.credentials).where(
    and(inArray(schema.credentials.userId, provincialAccountIds), eq(schema.credentials.providerId, "credential")),
  );
  await db.insert(schema.credentials).values(
    provincialAccounts.map((a, i) => ({
      id: randomUUID(),
      accountId: randomUUID(),
      providerId: "credential" as const,
      userId: a.id,
      password: provincialHashed[i],
      createdAt: now,
      updatedAt: now,
    })),
  );
  await db
    .insert(schema.provincialOfficers)
    .values(
      provincialOfficerData.map((item: any) => ({
        accountId: provincialAccountMap.get(item.username)!,
        firstName: item.provincial.first_name,
        lastName: item.provincial.last_name,
        phoneNumber: item.provincial.phone_number,
        provinceId: Number(item.provincial.province_id),
      })),
    )
    .onConflictDoUpdate({
      target: schema.provincialOfficers.accountId,
      set: {
        firstName: sql`EXCLUDED.first_name`,
        lastName: sql`EXCLUDED.last_name`,
        phoneNumber: sql`EXCLUDED.phone_number`,
        provinceId: sql`EXCLUDED.province_id`,
      },
    });
  console.log("Provincial Officers seeded");

  // 5. Seed Evaluators
  const evaluatorsData = JSON.parse(
    fs.readFileSync(path.join(seedDataDir, "eval.json"), "utf8"),
  );
  console.log("Seeding Evaluators...");
  const evaluatorHashed = await Promise.all(
    evaluatorsData.map((item: any) => bcrypt.hash(item.password, 12)),
  );
  const evaluatorAccounts = await db
    .insert(schema.accounts)
    .values(
      evaluatorsData.map((item: any) => ({
        username: item.username,
        email: item.email,
        role: "Evaluator" as const,
      })),
    )
    .onConflictDoUpdate({
      target: schema.accounts.username,
      set: { email: sql`EXCLUDED.email`, role: sql`EXCLUDED.role` },
    })
    .returning({ id: schema.accounts.id, username: schema.accounts.username });
  const evaluatorAccountMap = new Map(
    evaluatorAccounts.map((a) => [a.username, a.id]),
  );
  const evaluatorAccountIds = evaluatorAccounts.map((a) => a.id);
  await db.delete(schema.credentials).where(
    and(inArray(schema.credentials.userId, evaluatorAccountIds), eq(schema.credentials.providerId, "credential")),
  );
  await db.insert(schema.credentials).values(
    evaluatorAccounts.map((a, i) => ({
      id: randomUUID(),
      accountId: randomUUID(),
      providerId: "credential" as const,
      userId: a.id,
      password: evaluatorHashed[i],
      createdAt: now,
      updatedAt: now,
    })),
  );
  await db
    .insert(schema.evaluators)
    .values(
      evaluatorsData.map((item: any) => ({
        accountId: evaluatorAccountMap.get(item.username)!,
        firstName: item.first_name,
        lastName: item.last_name,
        level: item.level,
        region: item.region,
        phoneNumber: item.phone_number,
      })),
    )
    .onConflictDoUpdate({
      target: schema.evaluators.accountId,
      set: {
        firstName: sql`EXCLUDED.first_name`,
        lastName: sql`EXCLUDED.last_name`,
        level: sql`EXCLUDED.level`,
        region: sql`EXCLUDED.region`,
        phoneNumber: sql`EXCLUDED.phone_number`,
      },
    });
  console.log("Evaluators seeded");

  // 6. Seed AdminDoed (test1)
  console.log("Seeding AdminDoed (test1)...");
  const adminPassword = await bcrypt.hash("12345", 12);
  await db.transaction(async (tx) => {
    // Remove any account that already owns admin@test.com but has a different username,
    // so the upsert-by-username below does not hit the email unique constraint.
    await tx
      .delete(schema.accounts)
      .where(sql`email = 'admin@test.com' AND username != 'test1'`);

    const [account] = await tx
      .insert(schema.accounts)
      .values({
        username: "test1",
        email: "admin@test.com",
        role: "DOED",
      })
      .onConflictDoUpdate({
        target: schema.accounts.username,
        set: { email: "admin@test.com", role: "DOED" },
      })
      .returning();

    await tx.delete(schema.credentials).where(
      and(eq(schema.credentials.userId, account.id), eq(schema.credentials.providerId, "credential")),
    );
    await tx.insert(schema.credentials).values({
      id: randomUUID(),
      accountId: randomUUID(),
      providerId: "credential",
      userId: account.id,
      password: adminPassword,
      createdAt: now,
      updatedAt: now,
    });

    await tx
      .insert(schema.adminsDoed)
      .values({
        accountId: account.id,
        firstName: "Admin",
        lastName: "Test",
        phoneNumber: "0000000000",
      })
      .onConflictDoUpdate({
        target: schema.adminsDoed.accountId,
        set: {
          firstName: "Admin",
          lastName: "Test",
          phoneNumber: "0000000000",
        },
      });
  });
  console.log("AdminDoed (test1) seeded");

  // 7. Seed Questions
  const questionsData = JSON.parse(
    fs.readFileSync(path.join(seedDataDir, "questions.json"), "utf8"),
  );
  const normalizeStandard = (s: any): string[] => {
    if (!s || s === "None") return [];
    return Array.isArray(s) ? s : [s];
  };
  await db
    .insert(schema.questions)
    .values(
      questionsData.map((q: any) => ({
        id: q.id,
        category: q.category,
        questionText: q.question_text,
        standard: normalizeStandard(q.standard),
        choice1: q.choice_1,
        choice2: q.choice_2,
        choice3: q.choice_3,
        choiceNA: q.choice_NA ?? null,
        special: q.special,
      })),
    )
    .onConflictDoUpdate({
      target: schema.questions.id,
      set: {
        category: sql`EXCLUDED.category`,
        questionText: sql`EXCLUDED.question_text`,
        standard: sql`EXCLUDED.standard`,
        choice1: sql`EXCLUDED.choice_1`,
        choice2: sql`EXCLUDED.choice_2`,
        choice3: sql`EXCLUDED.choice_3`,
        choiceNA: sql`EXCLUDED.choice_na`,
        special: sql`EXCLUDED.special`,
      },
    });
  console.log("Questions seeded");

  console.log("Seed completed successfully");
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
