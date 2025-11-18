import { IsNumber, IsString } from 'class-validator';

export class CreateFactoryDto {
  @IsString()
  username: string;

  @IsString()
  password: string;

  @IsString()
  email: string;

  @IsNumber()
  factory_type: number;

  @IsString()
  name_th: string;

  @IsString()
  name_en: string;

  @IsString()
  tsic_code: string;

  @IsString()
  address_no: string;

  @IsString()
  soi: string;

  @IsString()
  road: string;

  @IsString()
  zipcode: string;

  @IsString()
  phone_number: string;

  @IsString()
  fax_number: string;

  @IsNumber()
  subdistrict_id: number;
}
