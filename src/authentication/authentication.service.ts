import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';
import { Prisma } from '../../prisma/generated/client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenPayload } from './token-payload.interface';
import { PrismaService } from 'prisma/prisma.service';
import { plainToInstance } from 'class-transformer';
import { AccountResponseDto } from './account-response.dto';

@Injectable()
export class AuthenticationService {
  // private readonly logger = new Logger(AuthenticationService.name);
  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async getAuthenticatedAccount(username: string, password: string) {
    try {
      const user = await this.prismaService.accounts.findUnique({
        where: { username },
        include: { factory: { select: { is_validate: true } } },
      });

      if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new UnauthorizedException('invalid username or password');
      }

      if (user.role === 'Factory' && user.factory?.is_validate === false) {
        throw new UnauthorizedException('factory not validated');
      }

      return { username: user.username, role: user.role, id: user.id };
    } catch (err) {
      // this.logger.error(err);
      if (err instanceof UnauthorizedException) {
        throw err;
      } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BadRequestException('bad request by user');
      } else {
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }

  async getAccountById(id: number) {
    try {
      const account = await this.prismaService.accounts.findUnique({
        where: { id: id },
        omit: { password: true },
        include: {
          adminDoed: true,
          evaluator: true,
          factory: true,
          provicial: true,
        },
      });

      if (!account) {
        throw new NotFoundException('invalid credential');
      }

      return plainToInstance(AccountResponseDto, account, {
        excludeExtraneousValues: true,
      });
    } catch (err) {
      // this.logger.error(err);
      if (err instanceof NotFoundException) {
        throw err;
      } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        throw new BadRequestException('bad request by user');
      } else {
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }

  getCookieFromToken(id: number) {
    const payload: TokenPayload = { id: id };
    const token = this.jwt.sign(payload);

    return token;
  }

  getCookieOption(tokenType: 'Authentication' | 'logout') {
    if (tokenType === 'logout') {
      return {
        httpOnly: true,
        secure: this.config.get<boolean>('COOKIE_SECURE'),
        sameSite: 'lax' as const,
        path: '/',
        maxAge: 0,
      };
    }
    return {
      httpOnly: true,
      secure: this.config.get<boolean>('COOKIE_SECURE'),
      sameSite: 'lax' as const,
      path: '/',
      maxAge: Number(this.config.get<string>('TOKEN_EXP')) * 1000,
    };
  }
}
