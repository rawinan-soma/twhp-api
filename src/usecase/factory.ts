import { factoryRepository } from "../repository/factory";
import { accountRepository } from "../repository/account";
import { subdistrictRepository } from "../repository/subdistrict";
import {
  type AllFactoriesQueryParams,
  type CreateFactoryDto,
  type UpdateFactoryDto,
} from "../schema/factory";
import * as bcrypt from "bcrypt";
import { utilities } from "../utils";
import { status } from "elysia";

const createFactoryHelper = (
  account: typeof accountRepository,
  factory: typeof factoryRepository,
  subdistrict: typeof subdistrictRepository,
) => {
  return {
    checkExistingFactory: async (username: string) => {
      const factory = await account.findOneIdByUsername(username);

      if (factory) {
        throw status(400, { message: "factory already exists" });
      }

      return true;
    },
    checkNonexistingFactory: async (accountId: number) => {
      const existingfactory = await factory.findOneByAccountId(accountId);

      if (!existingfactory) {
        throw status(400, { message: "factory not found" });
      }

      return existingfactory;
    },
    getFactoryLocation: async (subdistrictId: number) => {
      const location = await subdistrict.findLocationById(subdistrictId);

      if (!location) {
        throw status(400, { message: "invalid subdistrict id" });
      }

      const selectedSubdistrict = location.Subdistricts.subdistrictId;
      const selectedDistrict = location.Districts?.districtId;
      const selectedProvince = location.Districts?.provinceId;

      return {
        selectedDistrict: selectedDistrict,
        selectedProvince: selectedProvince,
        selectedSubdistrict: selectedSubdistrict,
      };
    },
  };
};

export const createFactoryUsecase = (
  factory: typeof factoryRepository,
  account: typeof accountRepository,
  subdistrict: typeof subdistrictRepository,
) => {
  const helper = createFactoryHelper(account, factory, subdistrict);
  return {
    register: async (dto: CreateFactoryDto) => {
      await helper.checkExistingFactory(dto.username);
      const location = await helper.getFactoryLocation(dto.subdistrictId);
      const hashedPassword = await bcrypt.hash(dto.password, 12);

      if (!location) {
        throw status(400, { message: "location not found" });
      }

      await factory.create(
        dto,
        hashedPassword,
        location.selectedProvince!,
        location.selectedDistrict!,
      );

      return {
        message: "factory created successfully",
      };
    },

    update: async (accountId: number, dto: UpdateFactoryDto) => {
      await helper.checkNonexistingFactory(accountId);

      if (dto.password) {
        dto.password = await bcrypt.hash(dto.password, 12);
      }

      if (dto.subdistrictId) {
        const location = await helper.getFactoryLocation(dto.subdistrictId);

        await factory.updateFactoryLocation(accountId, location);
      }

      await factory.updateFactoryData(accountId, dto);

      return { message: "factory updated successfully" };
    },

    approveFactoryRegister: async (accountId: number) => {
      const existingFactory = await helper.checkNonexistingFactory(accountId);
      if (existingFactory.Factories.isValidate) {
        throw status(400, { message: "factory already validated" });
      }

      if (!existingFactory.Accounts?.id) {
        throw status(400, { messgae: "factory not found" });
      }

      await factory.validate(existingFactory.Accounts?.id);
      return {
        message: "factory successfully validated",
      };
    },

    getAllFactories: async ({
      validated,
      enrolled = true,
      provinceId,
      region,
    }: {
      validated: boolean;
      enrolled?: boolean;
      provinceId?: number;
      region?: number;
    }) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
      const factories = await factory.findAll({
        validated,
        enrolled,
        provinceId,
        region,
        start: fiscalYearStart,
        end: fiscalYearEnd,
      });
      return factories.map((res) => ({
        province_name_th: res.Provinces?.nameTh,
        district_name_th: res.Districts?.nameTh,
        subdistrict_name_th: res.Subdistricts?.nameTh,
        account_id: res.Factories.accountId,
        factory_type: res.Factories.factoryType,
        name_th: res.Factories.nameTh,
        name_en: res.Factories.nameEn,
        tsic_code: res.Factories.tsicCode,
        address_no: res.Factories.addressNo,
        soi: res.Factories.soi,
        road: res.Factories.road,
        zipcode: res.Factories.zipcode,
        phone_number: res.Factories.phoneNumber,
        fax_number: res.Factories.faxNumber,
        is_validate: res.Factories.isValidate,
      }));
    },

    deleteFactory: async (factoryId: number) => {
      await helper.checkNonexistingFactory(factoryId);

      await account.delete(factoryId);

      return { message: "factory delete succesfully" };
    },

    getFactoryById: async (factoryId: number) => {
      const result = await factory.findOneByAccountId(factoryId);

      if (!result) {
        throw status(400, { message: "factory not found" });
      }

      return {
        account_id: result.Factories.accountId,
        factory_type: result.Factories.factoryType,
        name_th: result.Factories.nameTh,
        name_en: result.Factories.nameEn,
        tsic_code: result.Factories.tsicCode,
        address_no: result.Factories.addressNo,
        soi: result.Factories.soi,
        road: result.Factories.road,
        zipcode: result.Factories.zipcode,
        phone_number: result.Factories.phoneNumber,
        fax_number: result.Factories.faxNumber,
        province_id: result.Factories.provinceId,
        district_id: result.Factories.districtId,
        subdistrict_id: result.Factories.subdistrictId,
        is_validate: result.Factories.isValidate,
        username: result.Accounts?.username,
        province_name_th: result.Provinces?.nameTh,
        district_name_th: result.Districts?.nameTh,
        subdistrict_name_th: result.Subdistricts?.nameTh,
      };
    },
  };
};

export const factoryUsecase = createFactoryUsecase(
  factoryRepository,
  accountRepository,
  subdistrictRepository,
);
