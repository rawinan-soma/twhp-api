import { db } from "../drizzle/index.js";
import { districts } from "../drizzle/schema.js";
import { eq } from "drizzle-orm";

export const createDistrictRepository = (database: typeof db) => ({
  findAllByProvinceId: async (provinceId: number) => {
    return await database
      .select({ name_th: districts.nameTh, district_id: districts.districtId })
      .from(districts)
      .where(eq(districts.provinceId, provinceId));
  },
});

export const districtRepository = createDistrictRepository(db);
