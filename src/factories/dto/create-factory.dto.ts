import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class CreateFactoryDto {
  @ApiProperty()
  @IsString()
  username: string;

  @ApiProperty()
  @IsString()
  password: string;

  @ApiProperty()
  @IsString()
  email: string;

  @ApiProperty()
  @IsNumber()
  factory_type: number;

  @ApiProperty()
  @IsString()
  name_th: string;

  @ApiProperty()
  @IsString()
  name_en: string;

  @ApiProperty()
  @IsString()
  tsic_code: string;

  @ApiProperty()
  @IsString()
  address_no: string;

  @ApiProperty()
  @IsString()
  soi: string;

  @ApiProperty()
  @IsString()
  road: string;

  @ApiProperty()
  @IsString()
  zipcode: string;

  @ApiProperty()
  @IsString()
  phone_number: string;

  @ApiProperty()
  @IsString()
  fax_number: string;

  @ApiProperty()
  @IsNumber()
  subdistrict_id: number;
}
