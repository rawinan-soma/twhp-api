import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import * as bcrypt from "bcrypt";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { accounts, adminsDoed, factories } from "../drizzle/schema";
import { createAdminService } from "./admin";
import { createFactoryService } from "./factory";

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const db = drizzle(pool);
const factoryService = createFactoryService(db);
const adminService = createAdminService(db);

const dbReachable = await pool
  .query("select 1")
  .then(() => true)
  .catch(() => false);

if (!dbReachable) {
  console.warn("[profile-update.integration] SKIPPED: no reachable DATABASE_URL.");
}

const describeDb = dbReachable ? describe : describe.skip;

const FACTORY_ID = 998461;
const OTHER_ACCOUNT_ID = 998462;
const ADMIN_ID = 998463;
const ACCOUNT_IDS = [FACTORY_ID, OTHER_ACCOUNT_ID, ADMIN_ID];

const HOME = { provinceId: 10, districtId: 1001, subdistrictId: 100101 };
const AWAY = { provinceId: 20, districtId: 2001, subdistrictId: 200101 };

const ORIGINAL_PASSWORD = "original-password";
const OTHER_EMAIL = "profile-update-other@test.com";
const FACTORY_UPDATED = { message: "factory updated successfully" };
const ADMIN_UPDATED = { message: "admin updated!" };

let originalHash: string;

const accountRow = (id: number) =>
  db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .then((rows) => rows[0]!);

const factoryRow = () =>
  db
    .select()
    .from(factories)
    .where(eq(factories.accountId, FACTORY_ID))
    .then((rows) => rows[0]!);

const adminRow = () =>
  db
    .select()
    .from(adminsDoed)
    .where(eq(adminsDoed.accountId, ADMIN_ID))
    .then((rows) => rows[0]!);

const cleanup = async () => {
  await db.delete(factories).where(eq(factories.accountId, FACTORY_ID));
  await db.delete(adminsDoed).where(eq(adminsDoed.accountId, ADMIN_ID));
  await db.delete(accounts).where(inArray(accounts.id, ACCOUNT_IDS));
};

beforeAll(async () => {
  if (dbReachable) originalHash = await bcrypt.hash(ORIGINAL_PASSWORD, 4);
});

beforeEach(async () => {
  if (!dbReachable) return;
  await cleanup();
  await db.insert(accounts).values([
    {
      id: FACTORY_ID,
      username: "profile_update_factory",
      password: originalHash,
      email: "profile-update-factory@test.com",
      role: "Factory",
    },
    {
      id: OTHER_ACCOUNT_ID,
      username: "profile_update_other",
      password: originalHash,
      email: OTHER_EMAIL,
      role: "Factory",
    },
    {
      id: ADMIN_ID,
      username: "profile_update_admin",
      password: originalHash,
      email: "profile-update-admin@test.com",
      role: "DOED",
    },
  ]);
  await db.insert(factories).values({
    accountId: FACTORY_ID,
    factoryType: 1,
    nameTh: "โรงงานทดสอบ",
    nameEn: "Profile Update Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    ...HOME,
    isValidate: true,
  });
  await db.insert(adminsDoed).values({
    accountId: ADMIN_ID,
    firstName: "Original",
    lastName: "Admin",
    phoneNumber: "0000000000",
  });
});

afterAll(async () => {
  if (dbReachable) await cleanup();
  await pool.end();
});

describeDb("factoryService.update", () => {
  it("stores non-account fields and leaves the account row unchanged", async () => {
    const accountBefore = await accountRow(FACTORY_ID);

    const result = await factoryService.update(FACTORY_ID, { phoneNumber: "0811111111" });

    expect(result).toEqual(FACTORY_UPDATED);
    expect((await factoryRow()).phoneNumber).toBe("0811111111");
    expect(await accountRow(FACTORY_ID)).toEqual(accountBefore);
  });

  it("updates only the email when email is the only field", async () => {
    const factoryBefore = await factoryRow();

    const result = await factoryService.update(FACTORY_ID, { email: "new-factory@test.com" });

    expect(result).toEqual(FACTORY_UPDATED);
    expect((await accountRow(FACTORY_ID)).email).toBe("new-factory@test.com");
    expect(await factoryRow()).toEqual(factoryBefore);
  });

  it("stores a password as a bcrypt hash that verifies against the plain value", async () => {
    const factoryBefore = await factoryRow();

    const result = await factoryService.update(FACTORY_ID, { password: "a-new-password" });

    expect(result).toEqual(FACTORY_UPDATED);
    const { password } = await accountRow(FACTORY_ID);
    expect(password).not.toBe("a-new-password");
    expect(await bcrypt.compare("a-new-password", password)).toBe(true);
    expect(await factoryRow()).toEqual(factoryBefore);
  });

  it("changes nothing for an empty body", async () => {
    const factoryBefore = await factoryRow();
    const accountBefore = await accountRow(FACTORY_ID);

    const result = await factoryService.update(FACTORY_ID, {});

    expect(result).toEqual(FACTORY_UPDATED);
    expect(await factoryRow()).toEqual(factoryBefore);
    expect(await accountRow(FACTORY_ID)).toEqual(accountBefore);
  });

  it("treats an empty password as absent", async () => {
    const result = await factoryService.update(FACTORY_ID, { password: "" });

    expect(result).toEqual(FACTORY_UPDATED);
    const { password } = await accountRow(FACTORY_ID);
    expect(password).toBe(originalHash);
    expect(await bcrypt.compare(ORIGINAL_PASSWORD, password)).toBe(true);
  });

  it("stores the subdistrict, district, and province of a valid subdistrictId", async () => {
    const result = await factoryService.update(FACTORY_ID, {
      subdistrictId: AWAY.subdistrictId,
    });

    expect(result).toEqual(FACTORY_UPDATED);
    expect(await factoryRow()).toMatchObject(AWAY);
  });

  it("changes nothing when the account write of a location update fails", async () => {
    const factoryBefore = await factoryRow();
    const accountBefore = await accountRow(FACTORY_ID);

    const update = factoryService.update(FACTORY_ID, {
      subdistrictId: AWAY.subdistrictId,
      phoneNumber: "0822222222",
      email: OTHER_EMAIL,
    });

    await expect(update).rejects.toThrow();
    expect(await factoryRow()).toEqual(factoryBefore);
    expect(await accountRow(FACTORY_ID)).toEqual(accountBefore);
  });

  it.each([999999, 0])("returns 400 and writes nothing for subdistrictId %d", async (id) => {
    const factoryBefore = await factoryRow();

    const result = await factoryService.update(FACTORY_ID, {
      subdistrictId: id,
      phoneNumber: "0833333333",
    });

    expect(result).toMatchObject({ code: 400, response: { message: "invalid subdistrict id" } });
    expect(await factoryRow()).toEqual(factoryBefore);
  });

  it("returns 404 for an unknown factory", async () => {
    const result = await factoryService.update(999999999, {});

    expect(result).toMatchObject({ code: 404, response: { message: "factory not found" } });
  });
});

describeDb("adminService.editAdminData", () => {
  it("stores profile fields and leaves the account row unchanged", async () => {
    const accountBefore = await accountRow(ADMIN_ID);

    const result = await adminService.editAdminData(ADMIN_ID, { phoneNumber: "0844444444" });

    expect(result).toEqual(ADMIN_UPDATED);
    expect((await adminRow()).phoneNumber).toBe("0844444444");
    expect(await accountRow(ADMIN_ID)).toEqual(accountBefore);
  });

  it("updates only the email when email is the only field", async () => {
    const adminBefore = await adminRow();

    const result = await adminService.editAdminData(ADMIN_ID, { email: "new-admin@test.com" });

    expect(result).toEqual(ADMIN_UPDATED);
    expect((await accountRow(ADMIN_ID)).email).toBe("new-admin@test.com");
    expect(await adminRow()).toEqual(adminBefore);
  });

  it("stores a password as a bcrypt hash and leaves the admin row unchanged", async () => {
    const adminBefore = await adminRow();

    const result = await adminService.editAdminData(ADMIN_ID, { password: "a-new-admin-password" });

    expect(result).toEqual(ADMIN_UPDATED);
    const { password } = await accountRow(ADMIN_ID);
    expect(await bcrypt.compare("a-new-admin-password", password)).toBe(true);
    expect(await adminRow()).toEqual(adminBefore);
  });

  it("changes nothing for an empty body", async () => {
    const adminBefore = await adminRow();
    const accountBefore = await accountRow(ADMIN_ID);

    const result = await adminService.editAdminData(ADMIN_ID, {});

    expect(result).toEqual(ADMIN_UPDATED);
    expect(await adminRow()).toEqual(adminBefore);
    expect(await accountRow(ADMIN_ID)).toEqual(accountBefore);
  });

  it("returns 400 for an unknown admin", async () => {
    const result = await adminService.editAdminData(999999999, {});

    expect(result).toMatchObject({ code: 400, response: { message: "admin not found" } });
  });
});
