import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthenticationModule } from 'src/authentication/authentication.module';
import { FactoriesModule } from 'src/factories/factories.module';
import { AdminsModule } from 'src/admins/admins.module';
import { LocationsModule } from './locations/locations.module';
import Joi from 'joi';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HealthcheckController } from './healthcheck.controller';
import { PrismaModule } from 'prisma/prisma.module';
import { TerminusModule } from '@nestjs/terminus';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        API_PORT: Joi.number(),
        SERVER_URL: Joi.string().required(),
        ENDPOINT_PREFIX: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        TOKEN_EXP: Joi.number().required(),
        COOKIE_SECURE: Joi.string().required(),
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 6000,
          limit: 10,
        },
      ],
    }),
    PrismaModule,
    AuthenticationModule,
    FactoriesModule,
    AdminsModule,
    LocationsModule,
    TerminusModule,
  ],
  controllers: [HealthcheckController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
