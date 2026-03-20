import { db } from "../drizzle/index.js";
import { provinces } from "../drizzle/schema.js";

export const createProviceRepository = (database: typeof db) => ({
  findAll: async () => {
    return await database
      .select({ name_th: provinces.nameTh, province_id: provinces.provinceId })
      .from(provinces)
      .orderBy(provinces.nameTh);
  },
});

export const provinceRepository = createProviceRepository(db);
