import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../prisma/generated/client';
import { CreateEnrollDto } from './dto/create-enroll.dto';

@Injectable()
export class EnrollsService {
  private readonly logger = new Logger(EnrollsService.name);

  constructor(private readonly prismaService: PrismaService) {}

  public getFiscalYear() {
    const currentYear = new Date().getFullYear();
    const now = new Date();
    const fiscalYearStart =
      now >= new Date(currentYear, 9, 1)
        ? new Date(currentYear, 9, 1)
        : new Date(currentYear - 1, 9, 1);
    const fiscalYearEnd = new Date(fiscalYearStart.getFullYear() + 1, 9, 1);

    return { fiscalYearStart, fiscalYearEnd };
  }

  async getAllEnrolls() {
    try {
      const { fiscalYearStart, fiscalYearEnd } = this.getFiscalYear();
      const enrolls = await this.prismaService.enrolls.findMany({
        orderBy: { enroll_date: 'desc' },
        where: {
          enroll_date: { gte: fiscalYearStart, lt: fiscalYearEnd },
        },
        include: { factory: { select: { name_th: true } } },
      });

      const result = enrolls.map(({ factory, ...rest }) => ({
        ...rest,
        factory_name_th: factory.name_th,
      }));

      return result;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
        this.logger.error(err);
        throw new InternalServerErrorException();
      }
    }
  }

  async getEnrollById(enrollId: number) {
    try {
      const enroll = await this.prismaService.enrolls.findUnique({
        where: { id: enrollId },
      });
      if (!enroll) {
        throw new BadRequestException('enroll not found');
      }
      return enroll;
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
        this.logger.error(err);
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }

  async getAllEnrollByFactory(factoryId: number) {
    try {
      return await this.prismaService.enrolls.findMany({
        where: { factory_id: factoryId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
        this.logger.error(err);
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }

  private async getFactoryLocation(factoryId: number) {
    const location = await this.prismaService.factories.findUnique({
      where: { account_id: factoryId },
      include: { province: true },
    });

    if (!location) {
      throw new BadRequestException('location not found');
    }

    return location;
  }

  private async getEvaluator(factoryId: number) {
    const location = await this.getFactoryLocation(factoryId);

    const evaluators = await this.prismaService.evaluators.findMany({
      where: { region: location.province.health_region },
    });

    if (!evaluators) {
      throw new BadRequestException('evaluators not found');
    }

    return {
      eval_doh: evaluators.filter((evaluator) => evaluator.level === 'DOH')[0],
      eval_mental: evaluators.filter(
        (evaluator) => evaluator.level === 'Mental',
      )[0],
      eval_odpc: evaluators.filter(
        (evaluator) => evaluator.level === 'ODPC',
      )[0],
    };
  }

  async findEnrollmentInFiscalYear(factoryId: number) {
    const { fiscalYearStart, fiscalYearEnd } = this.getFiscalYear();
    const existingEnrollment = await this.prismaService.enrolls.findFirst({
      where: {
        factory_id: factoryId,
        enroll_date: {
          gte: fiscalYearStart,
          lt: fiscalYearEnd,
        },
      },
    });

    return existingEnrollment;
  }

  async getEnrollmentInFiscalYear(factoryId: number) {
    try {
      const enrollment = await this.findEnrollmentInFiscalYear(factoryId);

      if (!enrollment) {
        return { message: 'no enrollment found' };
      }

      return enrollment;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BadRequestException('bad request by user');
      } else {
        this.logger.error(err);
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }

  async createEnrollment(dto: CreateEnrollDto, factoryId: number) {
    try {
      const evaluators = await this.getEvaluator(factoryId);
      const existingEnrollment =
        await this.findEnrollmentInFiscalYear(factoryId);

      if (existingEnrollment) {
        throw new BadRequestException('already enroll in this fiscal year');
      }
      const newEnrollment = await this.prismaService.enrolls.create({
        data: {
          ...dto,
          factory: { connect: { account_id: factoryId } },
          eval_mental: {
            connect: { account_id: evaluators.eval_mental.account_id },
          },
          eval_odpc: {
            connect: { account_id: evaluators.eval_odpc.account_id },
          },
          eval_doh: { connect: { account_id: evaluators.eval_doh.account_id } },
        },
      });

      return {
        message: 'create enrollment successfully.',
        enrollment: {
          enroll_id: newEnrollment.id,
          factory_id: newEnrollment.factory_id,
          enrollment_date: newEnrollment.enroll_date,
        },
      };
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
        this.logger.error(err);
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }
}
