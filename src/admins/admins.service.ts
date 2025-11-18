import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

@Injectable()
export class AdminsService {
  constructor(private readonly prisma: PrismaService) {}

  async editAdminProfile(accountId: number, data: UpdateAdminDto) {
    try {
      const admin = await this.prisma.adminsDoed.findUnique({
        where: { account_id: accountId },
      });

      if (!admin) {
        throw new BadRequestException('Admin not found');
      }

      const edittedAdmin = await this.prisma.adminsDoed.update({
        where: { account_id: accountId },
        data: {
          first_name: data.first_name,
          last_name: data.last_name,
          phone_number: data.phone_number,
          account: {
            update: {
              email: data.email,
              password: data.password,
            },
          },
        },
      });

      return edittedAdmin;
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      } else if (err instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }

  async validateFactoryRegister(factoryId: number) {
    try {
      const factory = await this.prisma.factories.findUnique({
        where: { account_id: factoryId },
      });

      if (!factory) {
        throw new BadRequestException('Factory not found');
      }

      if (factory.is_validate) {
        throw new BadRequestException('Factory already validated');
      }

      const validatedFactory = await this.prisma.factories.update({
        where: { account_id: factory.account_id },
        data: { is_validate: true },
      });

      return {
        factory_id: validatedFactory.account_id,
        factory_name: validatedFactory.name_th,
        is_validate: validatedFactory.is_validate,
      };
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      } else if (err instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }

  async getAllFactories(isValidate: boolean) {
    try {
      const factories = await this.prisma.factories.findMany({
        where: { is_validate: isValidate },
        orderBy: { account_id: 'asc' },
      });

      return factories;
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      } else if (err instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }

  async deleteFactory(factoryId: number) {
    try {
      const selectedFactory = await this.prisma.factories.findUnique({
        where: { account_id: factoryId },
      });

      if (!selectedFactory) {
        throw new BadRequestException('Factory not found');
      }

      await this.prisma.factories.delete({
        where: { account_id: factoryId },
      });

      return { message: 'factory deleted successfully' };
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      } else if (err instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }

  async getFactoryById(factoryId: number) {
    try {
      const factory = await this.prisma.factories.findUnique({
        where: { account_id: factoryId },
      });

      if (!factory) {
        throw new BadRequestException('Factory not found');
      }

      return factory;
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      } else if (err instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }
}
