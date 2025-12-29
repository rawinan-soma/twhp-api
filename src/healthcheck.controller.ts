import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from 'prisma/prisma.service';

@Controller('health')
export class HealthcheckController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get('/api')
  checkApiHealth() {
    return 'API is healthy';
  }

  @Get('/prisma')
  @HealthCheck()
  checkPrismaHealth() {
    return this.db.pingCheck('prisma', this.prisma);
  }
}
