import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateEnrollDto {
  @ApiProperty()
  @IsNumber()
  employee_th_m: number;

  @ApiProperty()
  @IsNumber()
  employee_mm_m: number;

  @ApiProperty()
  @IsNumber()
  employee_kh_m: number;

  @ApiProperty()
  @IsNumber()
  employee_la_m: number;

  @ApiProperty()
  @IsNumber()
  employee_vn_m: number;

  @ApiProperty()
  @IsNumber()
  employee_cn_m: number;

  @ApiProperty()
  @IsNumber()
  employee_ph_m: number;

  @ApiProperty()
  @IsNumber()
  employee_jp_m: number;

  @ApiProperty()
  @IsNumber()
  employee_in_m: number;

  @ApiProperty()
  @IsNumber()
  employee_other_m: number;

  @ApiProperty()
  @IsNumber()
  employee_th_f: number;

  @ApiProperty()
  @IsNumber()
  employee_mm_f: number;

  @ApiProperty()
  @IsNumber()
  employee_kh_f: number;

  @ApiProperty()
  @IsNumber()
  employee_la_f: number;

  @ApiProperty()
  @IsNumber()
  employee_vn_f: number;

  @ApiProperty()
  @IsNumber()
  employee_cn_f: number;

  @ApiProperty()
  @IsNumber()
  employee_ph_f: number;

  @ApiProperty()
  @IsNumber()
  employee_jp_f: number;

  @ApiProperty()
  @IsNumber()
  employee_in_f: number;

  @ApiProperty()
  @IsNumber()
  employee_other_f: number;

  @ApiProperty()
  @IsBoolean()
  standard_HC: boolean;

  @ApiProperty()
  @IsBoolean()
  standard_SAN: boolean;

  @ApiProperty()
  @IsBoolean()
  standard_wellness: boolean;

  @ApiProperty()
  @IsBoolean()
  standard_safety: boolean;

  @ApiProperty()
  @IsBoolean()
  standard_TIS18001: boolean;

  @ApiProperty()
  @IsBoolean()
  standard_ISO45001: boolean;

  @ApiProperty()
  @IsBoolean()
  standard_ISO14001: boolean;

  @ApiProperty()
  @IsBoolean()
  standard_zero: boolean;

  @ApiProperty()
  @IsBoolean()
  standard_5S: boolean;

  @ApiProperty()
  @IsBoolean()
  standard_HAS: boolean;

  @ApiProperty()
  @IsString()
  safety_officer_prefix: string;

  @ApiProperty()
  @IsString()
  safety_officer_first_name: string;

  @ApiProperty()
  @IsString()
  safety_officer_last_name: string;

  @ApiProperty()
  @IsString()
  safety_officer_position: string;

  @ApiProperty({ nullable: true })
  @IsString()
  @IsOptional()
  safety_officer_email?: string;

  @ApiProperty({ nullable: true })
  @IsString()
  @IsOptional()
  safety_officer_phone?: string;

  @ApiProperty({ nullable: true })
  @IsString()
  @IsOptional()
  safety_officer_lineID?: string;
}
