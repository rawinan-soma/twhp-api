/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Expose, Transform } from 'class-transformer';

export class AccountResponseDto {
  @Expose()
  id: number;

  @Expose()
  email: string;

  @Expose()
  username: string;

  @Expose()
  role: string;

  @Expose()
  @Transform(({ value }) => value ?? undefined)
  adminDoed?: any;

  @Expose()
  @Transform(({ value }) => value ?? undefined)
  evaluator?: any;

  @Expose()
  @Transform(({ value }) => value ?? undefined)
  factory?: any;

  @Expose()
  @Transform(({ value }) => value ?? undefined)
  provicial?: any;
}
