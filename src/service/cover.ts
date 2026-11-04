import { and, desc, eq, gte, lt } from "drizzle-orm";
import { status } from "elysia";
import { db } from "../drizzle";
import { coverLogs, covers, enrolls } from "../drizzle/schema";
import { utilities } from "../utils";

export const createCoverService = (database: typeof db) => {
  return {
    create: async (factoryId: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

      const enroll = await database
        .select({ id: enrolls.id })
        .from(enrolls)
        .where(
          and(
            eq(enrolls.factoryId, factoryId),
            gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
            lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
          ),
        )
        .limit(1)
        .then((res) => res[0]);

      if (!enroll) {
        return status(404, { message: "enroll not found" });
      }

      const existingCover = await database
        .select()
        .from(covers)
        .where(eq(covers.enrollId, enroll.id))
        .limit(1)
        .then((res) => res[0]);

      if (existingCover) {
        return status(400, { message: "cover already exists for this enroll" });
      }

      await database.transaction(async (tx) => {
        const [newCover] = await tx.insert(covers).values({ enrollId: enroll.id }).returning();

        await tx.insert(coverLogs).values({ coverId: newCover.id, status: "in_progress" });
      });

      return { message: "assessment cover created!" };
    },

    getCoverById: async (factoryId: number, fiscalYear?: number) => {
      const {
        fiscalYear: resolvedFiscalYear,
        fiscalYearStart,
        fiscalYearEnd,
      } = utilities().getFiscalYear(fiscalYear);

      const cover = await database
        .select({
          id: covers.id,
          enrollId: covers.enrollId,
          startDate: covers.startDate,
        })
        .from(covers)
        .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
        .where(
          and(
            eq(enrolls.factoryId, factoryId),
            gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
            lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
          ),
        )
        .limit(1)
        .then((res) => res[0]);

      if (!cover) return status(404, { message: "cover not found" });

      const latestLog = await database
        .select({ status: coverLogs.status, updatedAt: coverLogs.updatedAt })
        .from(coverLogs)
        .where(eq(coverLogs.coverId, cover.id))
        .orderBy(desc(coverLogs.id))
        .limit(1)
        .then((res) => res[0]);

      return {
        ...cover,
        status: latestLog?.status ?? "in_progress",
        update_date: latestLog?.updatedAt ?? cover.startDate,
        fiscalYear: resolvedFiscalYear,
      };
    },
  };
};

export const coverService = createCoverService(db);
