import { db } from "../drizzle/index.js";
import { districts, subdistricts } from "../drizzle/schema.js";
import { eq } from "drizzle-orm";

export const createSubdistrictRepository = (database: typeof db) => ({
  findOneByDistrictId: async (districtId: number) => {
    return await database
      .select({
        name_th: subdistricts.nameTh,
        subdistrict_id: subdistricts.subdistrictId,
      })
      .from(subdistricts)
      .where(eq(subdistricts.districtId, districtId));
  },

  findLocationById: async (subdistrictId: number) => {
    return await database
      .select()
      .from(subdistricts)
      .leftJoin(districts, eq(subdistricts.districtId, districts.districtId))
      .where(eq(subdistricts.subdistrictId, subdistrictId))
      .limit(1)
      .then((res) => res[0]);
  },
});

export const subdistrictRepository = createSubdistrictRepository(db);
