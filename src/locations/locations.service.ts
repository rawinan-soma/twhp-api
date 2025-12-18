import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);
  constructor(private readonly prismaService: PrismaService) {}

  async getAllProvinces() {
    try {
      const province = await this.prismaService.provinces.findMany({
        select: { name_th: true, province_id: true },
        orderBy: { name_th: 'asc' },
      });
      return province;
    } catch (err) {
      this.logger.error(err);
      throw new InternalServerErrorException('unexpected error');
    }
  }

  async getDistrictsByProvinceId(provinceId: number) {
    try {
      const district = await this.prismaService.districts.findMany({
        where: { province_id: provinceId },
        select: { district_id: true, name_th: true },
      });
      return district;
    } catch (err) {
      this.logger.error(err);
      throw new InternalServerErrorException('unexpected error');
    }
  }

  async getSubdistrictsByDistrictId(districtId: number) {
    try {
      const subdistrict = await this.prismaService.subdistricts.findMany({
        where: { district_id: districtId },
        select: { subdistrict_id: true, name_th: true },
      });
      return subdistrict;
    } catch (err) {
      this.logger.error(err);
      throw new InternalServerErrorException('unexpected error');
    }
  }
}
