import { asc, eq, sql } from "drizzle-orm";
import { db } from "../drizzle";
import {
  accounts,
  evaluators,
  invitations,
  provinces,
  provincialOfficers,
} from "../drizzle/schema";
import type { StaffEntry } from "../schema/staff";

const READ_ALL_FROM_ONE_SNAPSHOT = {
  isolationLevel: "repeatable read",
  accessMode: "read only",
} as const;

export const createStaffService = (database: typeof db) => ({
  list: (): Promise<StaffEntry[]> =>
    database.transaction(async (tx) => {
      const invited = await tx
        .select({
          invitationId: invitations.id,
          status: sql<"pending" | "expired">`
              CASE WHEN ${invitations.expiresAt} > now() THEN 'pending' ELSE 'expired' END`,
          role: sql<StaffEntry["role"]>`${invitations.role}`,
          firstName: invitations.firstName,
          lastName: invitations.lastName,
          email: invitations.email,
          phoneNumber: invitations.phoneNumber,
          level: invitations.level,
          region: invitations.region,
          provinceId: invitations.provinceId,
          provinceName: provinces.nameTh,
        })
        .from(invitations)
        .leftJoin(provinces, eq(provinces.provinceId, invitations.provinceId))
        .orderBy(asc(invitations.id));

      const evaluatorRows = await tx
        .select({
          accountId: accounts.id,
          username: accounts.username,
          email: accounts.email,
          firstName: evaluators.firstName,
          lastName: evaluators.lastName,
          phoneNumber: evaluators.phoneNumber,
          level: evaluators.level,
          region: evaluators.region,
        })
        .from(evaluators)
        .innerJoin(accounts, eq(accounts.id, evaluators.accountId));

      const officerRows = await tx
        .select({
          accountId: accounts.id,
          username: accounts.username,
          email: accounts.email,
          firstName: provincialOfficers.firstName,
          lastName: provincialOfficers.lastName,
          phoneNumber: provincialOfficers.phoneNumber,
          provinceId: provincialOfficers.provinceId,
          provinceName: provinces.nameTh,
        })
        .from(provincialOfficers)
        .innerJoin(accounts, eq(accounts.id, provincialOfficers.accountId))
        .innerJoin(provinces, eq(provinces.provinceId, provincialOfficers.provinceId));

      const accepted = [
        ...evaluatorRows.map((row) => ({
          ...row,
          status: "accepted" as const,
          role: "Evaluator" as const,
          provinceId: null,
          provinceName: null,
        })),
        ...officerRows.map((row) => ({
          ...row,
          status: "accepted" as const,
          role: "Provincial" as const,
          level: null,
          region: null,
        })),
      ].sort((a, b) => a.accountId - b.accountId);

      return [...invited, ...accepted];
    }, READ_ALL_FROM_ONE_SNAPSHOT),
});

export const staffService = createStaffService(db);
