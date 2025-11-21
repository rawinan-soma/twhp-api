import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateEnrollDto {
  @IsNumber()
  employee_th_m: number;
  @IsNumber()
  employee_mm_m: number;
  @IsNumber()
  employee_kh_m: number;
  @IsNumber()
  employee_la_m: number;
  @IsNumber()
  employee_vn_m: number;
  @IsNumber()
  employee_cn_m: number;
  @IsNumber()
  employee_ph_m: number;
  @IsNumber()
  employee_jp_m: number;
  @IsNumber()
  employee_in_m: number;
  @IsNumber()
  employee_other_m: number;
  @IsNumber()
  employee_th_f: number;
  @IsNumber()
  employee_mm_f: number;
  @IsNumber()
  employee_kh_f: number;
  @IsNumber()
  employee_la_f: number;
  @IsNumber()
  employee_vn_f: number;
  @IsNumber()
  employee_cn_f: number;
  @IsNumber()
  employee_ph_f: number;
  @IsNumber()
  employee_jp_f: number;
  @IsNumber()
  employee_in_f: number;
  @IsNumber()
  employee_other_f: number;
  @IsBoolean()
  standard_HC: boolean;
  @IsBoolean()
  standard_SAN: boolean;
  @IsBoolean()
  standard_wellness: boolean;
  @IsBoolean()
  standard_safety: boolean;
  @IsBoolean()
  standard_TIS18001: boolean;
  @IsBoolean()
  standard_ISO45001: boolean;
  @IsBoolean()
  standard_ISO14001: boolean;
  @IsBoolean()
  standard_zero: boolean;
  @IsBoolean()
  standard_5S: boolean;
  @IsBoolean()
  standard_HAS: boolean;

  @IsString()
  safety_officer_prefix: string;
  @IsString()
  safety_officer_first_name: string;
  @IsString()
  safety_officer_last_name: string;
  @IsString()
  safety_officer_position: string;
  @IsString()
  @IsOptional()
  safety_officer_email: string;
  @IsString()
  @IsOptional()
  safety_officer_phone: string;
  @IsString()
  @IsOptional()
  safety_officer_lineID: string;
}
