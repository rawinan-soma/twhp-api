import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { CreateFactoryDto } from './dto/create-factory-dto';
import * as bcrypt from 'bcrypt';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

@Injectable()
export class FactoriesService {
  constructor(private readonly prismaService: PrismaService) {}
  async factoryRegister(dto: CreateFactoryDto) {
    try {
      const location = await this.prismaService.subdistricts.findUnique({
        where: { subdistrict_id: dto.subdistrict_id },
        include: { district: true },
      });

      if (!location) {
        throw new BadRequestException('invalid subdistrict id');
      }

      const selectedSubdistrict = location.subdistrict_id;
      const selectedDistrict = location.district_id;
      const selectedProvince = location.district.province_id;

      const hashedPassword = await bcrypt.hash(dto.password, 12);

      await this.prismaService.accounts.create({
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
              province_id: selectedProvince,
              district_id: selectedDistrict,
              subdistrict_id: selectedSubdistrict,
              road: dto.road,
              soi: dto.soi,
              tsic_code: dto.tsic_code,
              zipcode: dto.zipcode,
            },
          },
        },
      });
    } catch (err) {
      // this.logger.error(err);
      if (err instanceof BadRequestException) {
        throw err;
      } else if (err instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException('bad request by user');
      } else {
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }
}
