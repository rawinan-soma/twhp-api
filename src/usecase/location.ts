import { provinceRepository } from "../repository/province";
import { districtRepository } from "../repository/district";
import { subdistrictRepository } from "../repository/subdistrict";

export const createLocationUsecase = (
  province: typeof provinceRepository,
  district: typeof districtRepository,
  subdistrict: typeof subdistrictRepository,
) => {
  return {
    getAllProvinces: async () => {
      return await province.findAll();
    },

    getAllDistrictByProvinceId: async (provinceId: number) => {
      return await district.findAllByProvinceId(provinceId);
    },

    getAllSubdistrictByDistrictId: async (districtId: number) => {
      return await subdistrict.findOneByDistrictId(districtId);
    },
  };
};

export const locationUsecase = createLocationUsecase(
  provinceRepository,
  districtRepository,
  subdistrictRepository,
);
