import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AuthenticationModule } from './authentication/authentication.module';
import { FactoriesModule } from './factories/factories.module';
import { AdminsModule } from './admins/admins.module';
import { EnrollsModule } from './enrolls/enrolls.module';
import Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        SERVER_PORT: Joi.number(),
        SERVER_URL: Joi.string().required(),
        ENDPOINT_PREFIX: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        TOKEN_EXP: Joi.number().required(),
      }),
    }),
    PrismaModule,
    AuthenticationModule,
    FactoriesModule,
    AdminsModule,
    EnrollsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
