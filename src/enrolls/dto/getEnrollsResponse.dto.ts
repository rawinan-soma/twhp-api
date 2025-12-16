import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class GetEnrollResponseDto {
  @ApiProperty()
  @IsInt()
  id: number;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  @IsDateString()
  enroll_date: Date;

  @ApiProperty({ example: 1 })
  @IsInt()
  factory_id: number;

  @ApiProperty({ example: 10 })
  @IsInt()
  eval_doh_id: number;

  @ApiProperty({ example: 11 })
  @IsInt()
  eval_odpc_id: number;

  @ApiProperty({ example: 12 })
  @IsInt()
  eval_mental_id: number;

  // ===== employee male =====
  @ApiProperty() @IsInt() employee_th_m: number;
  @ApiProperty() @IsInt() employee_mm_m: number;
  @ApiProperty() @IsInt() employee_kh_m: number;
  @ApiProperty() @IsInt() employee_la_m: number;
  @ApiProperty() @IsInt() employee_vn_m: number;
  @ApiProperty() @IsInt() employee_cn_m: number;
  @ApiProperty() @IsInt() employee_ph_m: number;
  @ApiProperty() @IsInt() employee_jp_m: number;
  @ApiProperty() @IsInt() employee_in_m: number;
  @ApiProperty() @IsInt() employee_other_m: number;

  // ===== employee female =====
  @ApiProperty() @IsInt() employee_th_f: number;
  @ApiProperty() @IsInt() employee_mm_f: number;
  @ApiProperty() @IsInt() employee_kh_f: number;
  @ApiProperty() @IsInt() employee_la_f: number;
  @ApiProperty() @IsInt() employee_vn_f: number;
  @ApiProperty() @IsInt() employee_cn_f: number;
  @ApiProperty() @IsInt() employee_ph_f: number;
  @ApiProperty() @IsInt() employee_jp_f: number;
  @ApiProperty() @IsInt() employee_in_f: number;
  @ApiProperty() @IsInt() employee_other_f: number;

  // ===== standards =====
  @ApiProperty() @IsBoolean() standard_HC: boolean;
  @ApiProperty() @IsBoolean() standard_SAN: boolean;
  @ApiProperty() @IsBoolean() standard_wellness: boolean;
  @ApiProperty() @IsBoolean() standard_safety: boolean;
  @ApiProperty() @IsBoolean() standard_TIS18001: boolean;
  @ApiProperty() @IsBoolean() standard_ISO45001: boolean;
  @ApiProperty() @IsBoolean() standard_ISO14001: boolean;
  @ApiProperty() @IsBoolean() standard_zero: boolean;
  @ApiProperty() @IsBoolean() standard_5S: boolean;
  @ApiProperty() @IsBoolean() standard_HAS: boolean;

  // ===== safety officer =====
  @ApiProperty({ example: 'Mr.' })
  @IsString()
  safety_officer_prefix: string;

  @ApiProperty({ example: 'Somchai' })
  @IsString()
  safety_officer_first_name: string;

  @ApiProperty({ example: 'Jaidee' })
  @IsString()
  safety_officer_last_name: string;

  @ApiProperty({ example: 'Safety Officer' })
  @IsString()
  safety_officer_position: string;

  @ApiProperty({ example: 'somchai@example.com', required: false })
  @IsOptional()
  @IsEmail()
  safety_officer_email?: string;

  @ApiProperty({ example: '0812345678', required: false })
  @IsOptional()
  @IsString()
  safety_officer_phone?: string;

  @ApiProperty({ example: 'somchai_line', required: false })
  @IsOptional()
  @IsString()
  safety_officer_lineID?: string;
}
