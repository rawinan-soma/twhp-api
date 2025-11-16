import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AuthenticationModule } from './authentication/authentication.module';
import Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        SERVER_PORT: Joi.number(),
        SERVER_URL: Joi.string().required(),
        ENDPOINT_PREFIX: Joi.string().required(),
      }),
    }),
    PrismaModule,
    AuthenticationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
