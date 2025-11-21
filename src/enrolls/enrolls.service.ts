import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { CreateEnrollDto } from './dto/create-enroll.dto';

@Injectable()
export class EnrollsService {
  constructor(private readonly prismaService: PrismaService) {}

  async getAllEnrolls() {
    try {
      return await this.prismaService.enrolls.findMany({
        orderBy: { enroll_date: 'desc' },
      });
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
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
      } else if (err instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
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
      if (err instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else {
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

  async createEnrollment(dto: CreateEnrollDto, factoryId: number) {
    try {
      const evaluators = await this.getEvaluator(factoryId);
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
      } else if (err instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException(err.message);
      } else throw new InternalServerErrorException('unexpected error');
    }
  }
}
