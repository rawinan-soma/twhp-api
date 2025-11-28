import { Module } from '@nestjs/common';
import { AdminsService } from './admins.service';
import { PrismaService } from 'prisma/prisma.service';
import { AdminsController } from './admins.controller';
import { FactoriesService } from 'src/factories/factories.service';
import { EnrollsService } from 'src/enrolls/enrolls.service';

@Module({
  providers: [AdminsService, PrismaService, FactoriesService, EnrollsService],
  controllers: [AdminsController],
})
export class AdminsModule {}
