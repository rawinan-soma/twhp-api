import { eq } from "drizzle-orm";
import { db } from "../drizzle";
import { coverLogs, covers } from "../drizzle/schema";

export const createCoverRepository = (database: typeof db) => ({
  create: async (enrollId: number) => {
    return database.transaction(async (tx) => {
      const cover = await tx
        .insert(covers)
        .values({ enrollId: enrollId })
        .returning()
        .then((res) => res[0]);

      await tx.insert(coverLogs).values({
        coverId: cover.id,
        status: "in_progress",
        evaluatorId: null,
      });
    });
  },

  findOneByEnrollId: async (enrollId: number) => {
    return await database
      .select()
      .from(covers)
      .where(eq(covers.enrollId, enrollId))
      .then((res) => res[0]);
  },
});

export const coverRepository = createCoverRepository(db);
