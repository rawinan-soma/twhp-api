import { Module } from '@nestjs/common';
import { FactoriesService } from './factories.service';
import { FactoriesController } from './factories.controller';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  providers: [FactoriesService, PrismaService],
  controllers: [FactoriesController],
  exports: [FactoriesService],
})
export class FactoriesModule {}
