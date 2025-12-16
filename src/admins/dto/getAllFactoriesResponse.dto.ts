import { ApiProperty } from '@nestjs/swagger';

export class GetFactoriesResponseDto {
  @ApiProperty()
  account_id: number;

  @ApiProperty()
  factory_type: number;

  @ApiProperty()
  name_th: string;

  @ApiProperty()
  name_en: string;

  @ApiProperty()
  tsic_code: string;

  @ApiProperty()
  address_no: string;

  @ApiProperty({ nullable: true })
  soi?: string;

  @ApiProperty({ nullable: true })
  road?: string;

  @ApiProperty()
  zipcode: string;

  @ApiProperty()
  phone_number: string;

  @ApiProperty({ nullable: true })
  fax_number?: string;

  @ApiProperty()
  is_validate: boolean;

  @ApiProperty()
  province_id: number;

  @ApiProperty()
  district_id: number;

  @ApiProperty()
  subdistrict_id: number;
}
