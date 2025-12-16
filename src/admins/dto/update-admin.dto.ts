import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateAdminDto {
  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  phone_number?: string;
}
