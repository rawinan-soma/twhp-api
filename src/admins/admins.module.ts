import { Module } from '@nestjs/common';
import { AdminsService } from './admins.service';
import { PrismaService } from 'prisma/prisma.service';
import { AdminsController } from './admins.controller';

@Module({
  providers: [AdminsService, PrismaService],
  controllers: [AdminsController],
})
export class AdminsModule {}
