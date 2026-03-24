import { db } from "../drizzle";
import { provinces, districts, subdistricts } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const createLocationService = (database: typeof db) => {
  return {
    getAllProvinces: async () => {
      return await database
        .select({
          name_th: provinces.nameTh,
          province_id: provinces.provinceId,
        })
        .from(provinces)
        .orderBy(provinces.nameTh);
    },

    getAllDistrictByProvinceId: async (provinceId: number) => {
      return await database
        .select({
          name_th: districts.nameTh,
          district_id: districts.districtId,
        })
        .from(districts)
        .where(eq(districts.provinceId, provinceId));
    },

    getAllSubdistrictByDistrictId: async (districtId: number) => {
      return await database
        .select({
          name_th: subdistricts.nameTh,
          subdistrict_id: subdistricts.subdistrictId,
        })
        .from(subdistricts)
        .where(eq(subdistricts.districtId, districtId));
    },
  };
};

export const locationService = createLocationService(db);
