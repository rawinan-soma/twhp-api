import { Module } from '@nestjs/common';
import { FactoriesService } from './factories.service';
import { FactoriesController } from './factories.controller';
import { PrismaModule } from 'prisma/prisma.module';
import { EnrollsModule } from 'src/enrolls/enrolls.module';

@Module({
  imports: [PrismaModule, EnrollsModule],
  providers: [FactoriesService],
  controllers: [FactoriesController],
  exports: [FactoriesService],
})
export class FactoriesModule {}
