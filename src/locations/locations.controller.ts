import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { ApiInternalServerErrorResponse, ApiOkResponse } from '@nestjs/swagger';

@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get('provinces')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          province_id: { type: 'number', example: 11 },
          name_th: { type: 'string', example: 'สมุทรปราการ' },
        },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    schema: { default: { message: 'unexpected error' } },
  })
  async getAllProvinces() {
    return this.locationsService.getAllProvinces();
  }

  @Get('province/:provinceId/districts')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          district_id: { type: 'number', example: 1101 },
          name_th: { type: 'string', example: 'เมือง' },
        },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    schema: { default: { message: 'unexpected error' } },
  })
  async getAllDistricts(@Param('provinceId', ParseIntPipe) provinceId: number) {
    return this.locationsService.getDistrictsByProvinceId(provinceId);
  }

  @Get('district/:districtId/subdistricts')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          subdistrict_id: { type: 'number', example: 110101 },
          name_th: { type: 'string', example: 'หน้าเมือง' },
        },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    schema: { default: { message: 'unexpected error' } },
  })
  async getAllSubdistricts(
    @Param('districtId', ParseIntPipe) districtId: number,
  ) {
    return this.locationsService.getSubdistrictsByDistrictId(districtId);
  }
}
