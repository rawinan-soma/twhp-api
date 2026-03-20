/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import fs from "fs";
import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { parse } from "csv-parse/sync";
import * as bcrypt from "bcrypt";
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

  await db.insert(schema.provinces).values(provincesData).onConflictDoNothing();
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

  await db.insert(schema.districts).values(districtsData).onConflictDoNothing();
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
      .onConflictDoNothing();
  }
  console.log("Subdistricts seeded");

  // 4. Seed Provincial Officers
  const provincialOfficerData = JSON.parse(
    fs.readFileSync(path.join(seedDataDir, "admin_province.json"), "utf8"),
  );
  console.log("Seeding Provincial Officers...");
  for (const item of provincialOfficerData) {
    const hashedPassword = await bcrypt.hash(item.password, 12);

    await db.transaction(async (tx) => {
      const [account] = await tx
        .insert(schema.accounts)
        .values({
          username: item.username,
          password: hashedPassword,
          email: item.email,
          role: "Provincial",
        })
        .onConflictDoUpdate({
          target: schema.accounts.username,
          set: {
            password: hashedPassword,
            email: item.email,
            role: "Provincial",
          },
        })
        .returning();

      await tx
        .insert(schema.provincialOfficers)
        .values({
          accountId: account.id,
          firstName: item.provincial.first_name,
          lastName: item.provincial.last_name,
          phoneNumber: item.provincial.phone_number,
          provinceId: Number(item.provincial.province_id),
        })
        .onConflictDoUpdate({
          target: schema.provincialOfficers.accountId,
          set: {
            firstName: item.provincial.first_name,
            lastName: item.provincial.last_name,
            phoneNumber: item.provincial.phone_number,
            provinceId: Number(item.provincial.province_id),
          },
        });
    });
  }
  console.log("Provincial Officers seeded");

  // 5. Seed Evaluators
  const evaluatorsData = JSON.parse(
    fs.readFileSync(path.join(seedDataDir, "eval.json"), "utf8"),
  );
  console.log("Seeding Evaluators...");
  for (const item of evaluatorsData) {
    const hashedPassword = await bcrypt.hash(item.password, 12);

    await db.transaction(async (tx) => {
      const [account] = await tx
        .insert(schema.accounts)
        .values({
          username: item.username,
          password: hashedPassword,
          email: item.email,
          role: "Evaluator",
        })
        .onConflictDoUpdate({
          target: schema.accounts.username,
          set: {
            password: hashedPassword,
            email: item.email,
            role: "Evaluator",
          },
        })
        .returning();

      await tx
        .insert(schema.evaluators)
        .values({
          accountId: account.id,
          firstName: item.first_name,
          lastName: item.last_name,
          level: item.level,
          region: item.region,
          phoneNumber: item.phone_number,
        })
        .onConflictDoUpdate({
          target: schema.evaluators.accountId,
          set: {
            firstName: item.first_name,
            lastName: item.last_name,
            level: item.level,
            region: item.region,
            phoneNumber: item.phone_number,
          },
        });
    });
  }
  console.log("Evaluators seeded");

  // 6. Seed AdminDoed (test1)
  console.log("Seeding AdminDoed (test1)...");
  const adminPassword = await bcrypt.hash("12345", 12);
  await db.transaction(async (tx) => {
    const [account] = await tx
      .insert(schema.accounts)
      .values({
        username: "test1",
        password: adminPassword,
        email: "admin@test.com",
        role: "DOED",
      })
      .onConflictDoUpdate({
        target: schema.accounts.username,
        set: { password: adminPassword, role: "DOED" },
      })
      .returning();

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
