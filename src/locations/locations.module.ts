import { Module } from '@nestjs/common';
import { PrismaModule } from 'prisma/prisma.module';
import { PrismaService } from 'prisma/prisma.service';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';

@Module({
  imports: [PrismaModule],
  providers: [PrismaService, LocationsService],
  controllers: [LocationsController],
})
export class LocationsModule {}
