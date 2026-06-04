import { eq } from "drizzle-orm";
import { status } from "elysia";
import { db } from "../drizzle";
import { provincialOfficers } from "../drizzle/schema";

export const createProvincialOfficerService = (database: typeof db) => ({
  getOfficerDataById: async (id: number) => {
    const [officerData] = await database
      .select()
      .from(provincialOfficers)
      .where(eq(provincialOfficers.accountId, id));

    if (!officerData) return status(404, { message: "officer not found" });
    return officerData;
  },
});

export const provincialOfficerService = createProvincialOfficerService(db);
