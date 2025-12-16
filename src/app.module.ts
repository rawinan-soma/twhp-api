import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthenticationModule } from 'src/authentication/authentication.module';
import { FactoriesModule } from 'src/factories/factories.module';
import { AdminsModule } from 'src/admins/admins.module';
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
    AuthenticationModule,
    FactoriesModule,
    AdminsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
