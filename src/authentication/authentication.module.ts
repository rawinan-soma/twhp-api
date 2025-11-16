import { Module } from '@nestjs/common';
import { AuthenticationService } from './authentication.service';
import { AuthenticationController } from './authentication.controller';
import { PrismaService } from 'prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { LocalStrategy } from './local.strategy';

@Module({
  controllers: [AuthenticationController],
  providers: [
    AuthenticationService,
    PrismaService,
    ConfigService,
    JwtService,
    LocalStrategy,
  ],
})
export class AuthenticationModule {}
