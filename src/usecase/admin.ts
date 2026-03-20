import { adminRepository } from "../repository/admin";
import type { UpdateAdminDto } from "../schema/admin";
import * as bcrypt from "bcrypt";
import { status } from "elysia";

export const createAdminUsecase = (admin: typeof adminRepository) => {
  return {
    editAdminData: async (accountId: number, dto: UpdateAdminDto) => {
      const currentAdmin = await admin.findOneById(accountId);

      if (!currentAdmin) {
        throw status(400, { message: "admin not found" });
      }

      if (dto.password) {
        dto.password = await bcrypt.hash(dto.password, 12);
      }

      await admin.update(accountId, dto);

      return {
        message: "admin updated successfully",
      };
    },
  };
};

export const adminUsecase = createAdminUsecase(adminRepository);
