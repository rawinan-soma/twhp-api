import { Module } from '@nestjs/common';
import { EnrollsService } from './enrolls.service';

@Module({
  providers: [EnrollsService]
})
export class EnrollsModule {}
