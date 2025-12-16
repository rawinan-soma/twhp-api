import { Module } from '@nestjs/common';
import { AdminsService } from './admins.service';
import { AdminsController } from './admins.controller';
import { PrismaModule } from 'prisma/prisma.module';
import { PrismaService } from 'prisma/prisma.service';
import { EnrollsService } from 'src/enrolls/enrolls.service';
import { FactoriesService } from 'src/factories/factories.service';
import { EnrollsModule } from 'src/enrolls/enrolls.module';
import { FactoriesModule } from 'src/factories/factories.module';

@Module({
  imports: [PrismaModule, EnrollsModule, FactoriesModule],
  providers: [AdminsService, PrismaService, EnrollsService, FactoriesService],
  controllers: [AdminsController],
})
export class AdminsModule {}
