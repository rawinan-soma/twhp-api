import { Module } from '@nestjs/common';
import { EnrollsService } from './enrolls.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [EnrollsService],
  exports: [EnrollsService],
})
export class EnrollsModule {}
