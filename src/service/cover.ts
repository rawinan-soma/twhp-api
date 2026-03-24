import { db } from "../drizzle";
import { covers, coverLogs } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { status } from "elysia";

export const createCoverService = (database: typeof db) => {
  return {
    create: async (enrollId: number) => {
      const existingCover = await database
        .select()
        .from(covers)
        .where(eq(covers.enrollId, enrollId))
        .limit(1)
        .then((res) => res[0]);

      if (existingCover) {
        return status(400, { message: "cover already exists for this enroll" });
      }

      await database.transaction(async (tx) => {
        const [newCover] = await tx.insert(covers).values({ enrollId }).returning();

        await tx.insert(coverLogs).values({ coverId: newCover.id, status: "in_progress" });
      });

      return { message: "assessment cover created!" };
    },
  };
};

export const coverService = createCoverService(db);
