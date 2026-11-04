import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { ElysiaCustomStatusResponse } from "elysia";
import * as Minio from "minio";
import { Pool } from "pg";
import type { Grade } from "../drizzle/grades";
import { accounts, awards, enrolls, factories } from "../drizzle/schema";
import type { CreateEnrollWithFilesDto } from "../schema/enroll";
import { utilities } from "../utils";
import { createEnrollService } from "./enroll";

// Ticket 03 — gold-tier enrolment lockout. Written against PostgreSQL: run only against a
// disposable DATABASE_URL (see CLAUDE.md), never the ordinary local `twhp` database.

const pool = new Pool({ connectionString: Bun.env.DATABASE_URL! });
const db = drizzle(pool);
const enrollService = createEnrollService(db);

// Distinct from every other integration test's fixture ids.
const F_GOLD_Y1 = 99990;
const F_GOLD_Y2 = 99991;
const F_GOLD_Y3 = 99992;
const F_CONSEC_Y1 = 99993;
const F_CONSEC_Y2 = 99994;
const F_SILVER = 99995;
const F_NO_AWARD = 99996;
const F_DUPLICATE = 99997;
const F_UPLOAD = 99998;
const F_CONTROL = 99999;
const F_BOTH = 99989;
const F_CERT = 99988;
const F_JOINED = 99987;
const F_PRIOR_UNFINISHED = 99986;
const ALL_FACTORIES = [
  F_GOLD_Y1,
  F_GOLD_Y2,
  F_GOLD_Y3,
  F_CONSEC_Y1,
  F_CONSEC_Y2,
  F_SILVER,
  F_NO_AWARD,
  F_DUPLICATE,
  F_UPLOAD,
  F_CONTROL,
  F_BOTH,
  F_CERT,
  F_JOINED,
  F_PRIOR_UNFINISHED,
];

const SEEDED_EVALUATOR_ID = 78; // seeded ODPC evaluator (FK target for enroll eval_* ids)
const TEST_PROVINCE_ID = 10; // seeded province with seeded region evaluators

const currentYear = utilities().getFiscalYear().fiscalYear;

const dto = (overrides: Partial<CreateEnrollWithFilesDto> = {}) =>
  ({
    employeeThM: 1,
    employeeMmM: 0,
    employeeKhM: 0,
    employeeLaM: 0,
    employeeVnM: 0,
    employeeCnM: 0,
    employeePhM: 0,
    employeeJpM: 0,
    employeeInM: 0,
    employeeOtherM: 0,
    employeeThF: 1,
    employeeMmF: 0,
    employeeKhF: 0,
    employeeLaF: 0,
    employeeVnF: 0,
    employeeCnF: 0,
    employeePhF: 0,
    employeeJpF: 0,
    employeeInF: 0,
    employeeOtherF: 0,
    standardHc: false,
    standardSan: false,
    standardSanPlus: false,
    standardWellness: false,
    standardSafety: false,
    standardTis18001: false,
    standardIso45001: false,
    standardIso14001: false,
    standardZero: false,
    standard5S: false,
    standardHas: false,
    safetyOfficerPrefix: "นาย",
    safetyOfficerFirstName: "ทดสอบ",
    safetyOfficerLastName: "ทดสอบ",
    safetyOfficerPosition: "เจ้าหน้าที่",
    safetyOfficerEmail: "safety_lockout@test.com",
    ...overrides,
  }) as CreateEnrollWithFilesDto;

async function cleanup() {
  await db.delete(awards).where(inArray(awards.factoryId, ALL_FACTORIES));
  await db.delete(enrolls).where(inArray(enrolls.factoryId, ALL_FACTORIES));
  await db.delete(factories).where(inArray(factories.accountId, ALL_FACTORIES));
  await db.delete(accounts).where(inArray(accounts.id, ALL_FACTORIES));
}

async function makeFactory(id: number) {
  const ref = await db
    .select({ districtId: factories.districtId, subdistrictId: factories.subdistrictId })
    .from(factories)
    .limit(1)
    .then((r) => r[0]);
  await db.insert(accounts).values({
    id,
    username: `test_lockout_${id}`,
    password: "hashed",
    email: `test_lockout_${id}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId: id,
    factoryType: 1,
    nameTh: `โรงงานทดสอบล็อก ${id}`,
    nameEn: `Test Lockout Factory ${id}`,
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId: TEST_PROVINCE_ID,
    districtId: ref?.districtId ?? 1001,
    subdistrictId: ref?.subdistrictId ?? 100101,
    isValidate: true,
  });
}

const award = (factoryId: number, fiscalYear: number, grade: Grade) =>
  db.insert(awards).values({ factoryId, fiscalYear, grade });

const enrollsOf = (factoryId: number) =>
  db.select().from(enrolls).where(eq(enrolls.factoryId, factoryId));

const codeOf = (r: unknown) => (r as ElysiaCustomStatusResponse<number, unknown>).code;
const messageOf = (r: unknown) =>
  (r as ElysiaCustomStatusResponse<number, { message: string }>).response.message;

const pdf = () => new File(["%PDF-1.4"], "cert.pdf", { type: "application/pdf" });

// Object storage is stubbed: the tests observe whether an upload was *attempted*.
const putObject = spyOn(Minio.Client.prototype, "putObject");
const bucketExists = spyOn(Minio.Client.prototype, "bucketExists");

beforeAll(async () => {
  putObject.mockResolvedValue({} as never);
  bucketExists.mockResolvedValue(true as never);
  await cleanup();
  for (const id of ALL_FACTORIES) await makeFactory(id);
});

afterEach(() => {
  putObject.mockClear();
});

afterAll(async () => {
  putObject.mockRestore();
  bucketExists.mockRestore();
  await cleanup();
  await pool.end();
});

describe("Ticket 03 — gold-tier enrolment lockout", () => {
  it("rejects a factory holding gold in FY − 1", async () => {
    await award(F_GOLD_Y1, currentYear - 1, "gold");

    const result = await enrollService.create(dto(), F_GOLD_Y1);

    expect(result).toBeInstanceOf(ElysiaCustomStatusResponse);
    expect(codeOf(result)).toBe(400);
    expect(await enrollsOf(F_GOLD_Y1)).toHaveLength(0);
  });

  it("rejects a factory holding gold in FY − 2", async () => {
    await award(F_GOLD_Y2, currentYear - 2, "gold");

    const result = await enrollService.create(dto(), F_GOLD_Y2);

    expect(codeOf(result)).toBe(400);
    expect(await enrollsOf(F_GOLD_Y2)).toHaveLength(0);
  });

  it("lets a factory whose gold is in FY − 3 enrol", async () => {
    await award(F_GOLD_Y3, currentYear - 3, "gold");

    const result = await enrollService.create(dto(), F_GOLD_Y3);

    expect(result).not.toBeInstanceOf(ElysiaCustomStatusResponse);
    expect(await enrollsOf(F_GOLD_Y3)).toHaveLength(1);
  });

  it("blocks a consec-gold exactly as it blocks a gold, in both years", async () => {
    await award(F_CONSEC_Y1, currentYear - 1, "consec-gold");
    await award(F_CONSEC_Y2, currentYear - 2, "consec-gold");

    expect(codeOf(await enrollService.create(dto(), F_CONSEC_Y1))).toBe(400);
    expect(codeOf(await enrollService.create(dto(), F_CONSEC_Y2))).toBe(400);
  });

  it.each([
    ["silver", F_SILVER],
    ["certificate", F_CERT],
    ["joined", F_JOINED],
  ] as const)("carries no lockout for %s in FY − 1", async (grade, factoryId) => {
    await award(factoryId, currentYear - 1, grade);

    const result = await enrollService.create(dto(), factoryId);

    expect(result).not.toBeInstanceOf(ElysiaCustomStatusResponse);
    expect(await enrollsOf(factoryId)).toHaveLength(1);
  });

  it("does not lock out a factory with no Awards row", async () => {
    // A prior-year enrolment that never reached `finished` writes no Awards row; a first-time
    // enrolment has no history at all. Both are "no award recorded".
    const result = await enrollService.create(dto(), F_NO_AWARD);

    expect(result).not.toBeInstanceOf(ElysiaCustomStatusResponse);
    expect(await enrollsOf(F_NO_AWARD)).toHaveLength(1);
  });

  it("does not lock out a factory whose FY − 1 enrolment never reached a finished Cover", async () => {
    // Enrolled last fiscal year, Cover left in progress: finalize never ran, so no Awards row.
    const { fiscalYearStart } = utilities().getFiscalYear(currentYear - 1);
    await db.insert(enrolls).values({
      ...dto(),
      factoryId: F_PRIOR_UNFINISHED,
      enrollDate: new Date(fiscalYearStart.getTime() + 86_400_000).toISOString(),
      evalDohId: SEEDED_EVALUATOR_ID,
      evalOdpcId: SEEDED_EVALUATOR_ID,
      evalMentalId: SEEDED_EVALUATOR_ID,
    });

    const result = await enrollService.create(dto(), F_PRIOR_UNFINISHED);

    expect(result).not.toBeInstanceOf(ElysiaCustomStatusResponse);
    expect(await enrollsOf(F_PRIOR_UNFINISHED)).toHaveLength(2);
  });

  it("names the next fiscal year the factory may enrol in", async () => {
    // Gold in FY − 1: blocked in FY and FY + 1, may enrol in FY + 2.
    expect(messageOf(await enrollService.create(dto(), F_GOLD_Y1))).toContain(
      String(currentYear + 2),
    );
    // Gold in FY − 2: blocked in FY only, may enrol in FY + 1.
    expect(messageOf(await enrollService.create(dto(), F_GOLD_Y2))).toContain(
      String(currentYear + 1),
    );
  });

  it("is barred until the later award lapses when gold is held in both years", async () => {
    // A policy violation in the data, but the answer must still be the safe one.
    await award(F_BOTH, currentYear - 1, "gold");
    await award(F_BOTH, currentYear - 2, "consec-gold");

    const result = await enrollService.create(dto(), F_BOTH);

    expect(codeOf(result)).toBe(400);
    expect(messageOf(result)).toContain(String(currentYear + 2));
  });

  it("keeps the duplicate-enrolment rejection and its message unchanged", async () => {
    await enrollService.create(dto(), F_DUPLICATE);

    const second = await enrollService.create(dto(), F_DUPLICATE);

    expect(codeOf(second)).toBe(400);
    expect(messageOf(second)).toBe("already make an enroll in fiscal year");
  });

  it("uploads nothing to object storage when the lockout rejects", async () => {
    await award(F_UPLOAD, currentYear - 1, "gold");

    const result = await enrollService.create(
      dto({ standardHc: true, fileStandardHc: pdf() }),
      F_UPLOAD,
    );

    expect(codeOf(result)).toBe(400);
    expect(putObject).not.toHaveBeenCalled();
  });

  it("does upload for an eligible factory (proves the stub observes uploads)", async () => {
    const result = await enrollService.create(
      dto({ standardHc: true, fileStandardHc: pdf() }),
      F_CONTROL,
    );

    expect(result).not.toBeInstanceOf(ElysiaCustomStatusResponse);
    expect(putObject).toHaveBeenCalledTimes(1);
  });
});
