import { Module } from '@nestjs/common';
import { FactoriesService } from './factories.service';
import { FactoriesController } from './factories.controller';
import { PrismaService } from 'prisma/prisma.service';
import { EnrollsService } from '../enrolls/enrolls.service';

@Module({
  providers: [FactoriesService, PrismaService, EnrollsService],
  controllers: [FactoriesController],
  exports: [FactoriesService],
})
export class FactoriesModule {}
