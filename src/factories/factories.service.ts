import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateFactoryDto } from './dto/create-factory.dto';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../../prisma/generated/client';
import { UpdateFactoryDto } from './dto/update-factory.dto';

@Injectable()
export class FactoriesService {
  private readonly logger = new Logger(FactoriesService.name);
  constructor(private readonly prismaService: PrismaService) {}

  private async checkExistingFactoryByUsername(username: string) {
    const existedFactory = await this.prismaService.accounts.findUnique({
      where: { username: username },
    });

    if (existedFactory) {
      throw new BadRequestException('factory already exists');
    }
  }

  private async getFactoryLocation(subdistrict_id: number) {
    const location = await this.prismaService.subdistricts.findUnique({
      where: { subdistrict_id: subdistrict_id },
      include: { district: true },
    });

    if (!location) {
      throw new BadRequestException('invalid subdistrict id');
    }

    const selectedSubdistrict = location.subdistrict_id;
    const selectedDistrict = location.district_id;
    const selectedProvince = location.district.province_id;

    return {
      selectedDistrict: selectedDistrict,
      selectedProvince: selectedProvince,
      selectedSubdistrict: selectedSubdistrict,
    };
  }

  async factoryRegister(dto: CreateFactoryDto) {
    try {
      await this.checkExistingFactoryByUsername(dto.username);
      const location = await this.getFactoryLocation(dto.subdistrict_id);
      const hashedPassword = await bcrypt.hash(dto.password, 12);

      const newFactory = await this.prismaService.accounts.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          role: 'Factory',
          username: dto.username,
          factory: {
            create: {
              address_no: dto.address_no,
              factory_type: dto.factory_type,
              fax_number: dto.fax_number,
              name_en: dto.name_en,
              name_th: dto.name_th,
              phone_number: dto.phone_number,
              province_id: location.selectedProvince,
              district_id: location.selectedDistrict,
              subdistrict_id: location.selectedSubdistrict,
              road: dto.road,
              soi: dto.soi,
              tsic_code: dto.tsic_code,
              zipcode: dto.zipcode,
            },
          },
        },
        select: {
          username: true,
          factory: { select: { name_th: true } },
        },
      });

      return {
        message: 'factory created successfully',
        factory: {
          factory_id: newFactory.username,
          name: newFactory.factory?.name_th,
        },
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

  async updateFactoryData(accountId: number, dto: UpdateFactoryDto) {
    try {
      const factory = await this.prismaService.factories.findUnique({
        where: { account_id: accountId },
      });

      if (!factory) {
        throw new BadRequestException('factory not found');
      }

      if (dto.password) {
        dto.password = await bcrypt.hash(dto.password, 12);
      }

      if (dto.subdistrict_id) {
        const location = await this.getFactoryLocation(dto.subdistrict_id);
        await this.prismaService.factories.update({
          where: { account_id: accountId },
          data: {
            subdistrict_id: location.selectedSubdistrict,
            district_id: location.selectedDistrict,
            province_id: location.selectedProvince,
          },
        });
      }

      await this.prismaService.factories.update({
        where: { account_id: accountId },
        data: {
          address_no: dto.address_no,
          factory_type: dto.factory_type,
          fax_number: dto.fax_number,
          name_en: dto.name_en,
          name_th: dto.name_th,
          road: dto.road,
          phone_number: dto.phone_number,
          soi: dto.soi,
          tsic_code: dto.tsic_code,
          zipcode: dto.zipcode,
          account: { update: { email: dto.email, password: dto.password } },
        },
      });

      return { message: 'factory updated successfully' };
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
