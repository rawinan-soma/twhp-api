import { Module } from '@nestjs/common';
import { AdminsService } from './admins.service';
import { PrismaService } from 'prisma/prisma.service';
import { AdminsController } from './admins.controller';
import { FactoriesModule } from 'src/factories/factories.module';
import { FactoriesService } from 'src/factories/factories.service';

@Module({
  imports: [FactoriesModule],
  providers: [AdminsService, PrismaService, FactoriesService],
  controllers: [AdminsController],
})
export class AdminsModule {}
