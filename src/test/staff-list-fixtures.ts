import { asc, eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  accounts,
  coverLogs,
  covers,
  districts,
  enrolls,
  factories,
  provinces,
  subdistricts,
} from "../drizzle/schema";

export const SEEDED_EVALUATOR_ID = 78;

export type CoverState = "none" | "in_progress" | "in_review";

export type RegionLayout = {
  region: number;
  provinceInRegion: number;
  otherProvinceInRegion: number;
  provinceOutOfRegion: number;
  outOfRegionRegion: number;
};

export const pickRegionLayout = async (db: NodePgDatabase): Promise<RegionLayout> => {
  const rows = await db
    .select({ provinceId: provinces.provinceId, healthRegion: provinces.healthRegion })
    .from(provinces)
    .orderBy(asc(provinces.provinceId));
  const first = rows.find((p) => rows.filter((q) => q.healthRegion === p.healthRegion).length >= 2);
  if (!first) throw new Error("seed data has no health region with two provinces");
  const sibling = rows.find(
    (p) => p.healthRegion === first.healthRegion && p.provinceId !== first.provinceId,
  );
  const outsider = rows.find((p) => p.healthRegion !== first.healthRegion);
  if (!sibling || !outsider) throw new Error("seed data lacks a second province or region");
  return {
    region: first.healthRegion,
    provinceInRegion: first.provinceId,
    otherProvinceInRegion: sibling.provinceId,
    provinceOutOfRegion: outsider.provinceId,
    outOfRegionRegion: outsider.healthRegion,
  };
};

export const geoOf = async (db: NodePgDatabase, provinceId: number) => {
  const row = await db
    .select({ districtId: districts.districtId, subdistrictId: subdistricts.subdistrictId })
    .from(districts)
    .innerJoin(subdistricts, eq(subdistricts.districtId, districts.districtId))
    .where(eq(districts.provinceId, provinceId))
    .orderBy(asc(subdistricts.subdistrictId))
    .limit(1)
    .then((r) => r[0]);
  if (!row) throw new Error(`no district and subdistrict seeded for province ${provinceId}`);
  return row;
};

const enrollValues = (factoryId: number, enrollDate: string) => ({
  factoryId,
  enrollDate,
  evalDohId: SEEDED_EVALUATOR_ID,
  evalOdpcId: SEEDED_EVALUATOR_ID,
  evalMentalId: SEEDED_EVALUATOR_ID,
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
});

export const seedFactoryInProvince = async (
  db: NodePgDatabase,
  accountId: number,
  provinceId: number,
  geo: { districtId: number; subdistrictId: number },
) => {
  await db.insert(accounts).values({
    id: accountId,
    username: `test_staff_list_${accountId}`,
    password: "hashed",
    email: `test_staff_list_${accountId}@test.com`,
    role: "Factory",
  });
  await db.insert(factories).values({
    accountId,
    factoryType: 1,
    nameTh: "โรงงานทดสอบ staff list",
    nameEn: "Test Staff List Factory",
    tsicCode: "1011",
    addressNo: "1",
    zipcode: "10000",
    phoneNumber: "0000000000",
    provinceId,
    districtId: geo.districtId,
    subdistrictId: geo.subdistrictId,
    isValidate: true,
  });
};

export const seedEnrollWithCover = async (
  db: NodePgDatabase,
  factoryId: number,
  enrollDate: string,
  state: CoverState,
) => {
  const [enroll] = await db
    .insert(enrolls)
    .values(enrollValues(factoryId, enrollDate))
    .returning({ id: enrolls.id });
  if (state === "none") return;
  const [cover] = await db
    .insert(covers)
    .values({ enrollId: enroll.id })
    .returning({ id: covers.id });
  if (state === "in_review")
    await db.insert(coverLogs).values({ coverId: cover.id, status: "in_progress" });
  await db.insert(coverLogs).values({ coverId: cover.id, status: state });
};

export const removeFactoryWithCovers = async (db: NodePgDatabase, factoryId: number) => {
  const enrollIds = await db
    .select({ id: enrolls.id })
    .from(enrolls)
    .where(eq(enrolls.factoryId, factoryId))
    .then((r) => r.map((x) => x.id));
  if (enrollIds.length) {
    const coverIds = await db
      .select({ id: covers.id })
      .from(covers)
      .where(inArray(covers.enrollId, enrollIds))
      .then((r) => r.map((x) => x.id));
    if (coverIds.length) {
      await db.delete(coverLogs).where(inArray(coverLogs.coverId, coverIds));
      await db.delete(covers).where(inArray(covers.id, coverIds));
    }
    await db.delete(enrolls).where(inArray(enrolls.id, enrollIds));
  }
  await db.delete(factories).where(eq(factories.accountId, factoryId));
  await db.delete(accounts).where(eq(accounts.id, factoryId));
};
