import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { Prisma } from '../../prisma/generated/client';
import * as bcrypt from 'bcrypt';
import { EnrollsService } from 'src/enrolls/enrolls.service';

@Injectable()
export class AdminsService {
  private readonly logger = new Logger(AdminsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly enroll: EnrollsService,
  ) {}
  async editAdminProfile(accountId: number, data: UpdateAdminDto) {
    try {
      const admin = await this.prisma.adminsDoed.findUnique({
        where: { account_id: accountId },
      });

      if (!admin) {
        throw new BadRequestException('admin not found');
      }

      if (data.password) {
        data.password = await bcrypt.hash(data.password, 12);
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
        include: {
          account: { select: { email: true } },
        },
      });

      return {
        ...edittedAdmin,
        account: undefined,
        email: edittedAdmin.account.email,
      };
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
        this.logger.error(err);
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
        throw new BadRequestException('factory not found');
      }

      if (factory.is_validate) {
        throw new BadRequestException('factory already validated');
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
      } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
        this.logger.error(err);
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }

  async getAllFactories(isValidate: boolean, enrolled?: boolean) {
    try {
      if (enrolled && enrolled === true) {
        const { fiscalYearStart, fiscalYearEnd } = this.enroll.getFiscalYear();
        const factories = await this.prisma.factories.findMany({
          where: {
            is_validate: true,
            enroll: {
              some: {
                enroll_date: {
                  gte: fiscalYearStart,
                  lt: fiscalYearEnd,
                },
              },
            },
          },
          orderBy: { account_id: 'asc' },
        });

        return factories;
      }

      const factories = await this.prisma.factories.findMany({
        where: { is_validate: isValidate },
        orderBy: { account_id: 'asc' },
      });

      return factories;
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
        this.logger.error(err);
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
        throw new BadRequestException('factory not found');
      }

      await this.prisma.factories.delete({
        where: { account_id: factoryId },
      });

      return { message: 'factory deleted successfully' };
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
        this.logger.error(err);
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }

  async getFactoryById(factoryId: number) {
    try {
      const factory = await this.prisma.factories.findUnique({
        where: { account_id: factoryId },
        include: {
          account: { select: { username: true } },
          province: { select: { name_th: true } },
          district: { select: { name_th: true } },
          subdistrict: { select: { name_th: true } },
        },
      });

      if (!factory) {
        throw new BadRequestException('factory not found');
      }

      return {
        ...factory,
        username: factory.account.username,
        province_name_th: factory.province.name_th,
        district_name_th: factory.district.name_th,
        subdistrict_name_th: factory.subdistrict.name_th,
        province: undefined,
        district: undefined,
        subdistrict: undefined,
        account: undefined,
      };
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
        this.logger.error(err);
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }
}
