import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenPayload } from './token-payload.interface';
import { PrismaService } from 'prisma/prisma.service';
import { CreateFactoryDto } from './dto/create-factory-dto';

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
      });

      if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new UnauthorizedException('invalid username or password');
      }

      return { username: user.username, role: user.role, id: user.id };
    } catch (err) {
      // this.logger.error(err);
      if (err instanceof UnauthorizedException) {
        throw err;
      } else if (err instanceof PrismaClientKnownRequestError) {
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
      });

      if (!account) {
        throw new NotFoundException('account not found');
      }

      return account;
    } catch (err) {
      // this.logger.error(err);
      if (err instanceof NotFoundException) {
        throw err;
      } else if (err instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException('bad request by user');
      } else {
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }

  getCookieFromToken(id: number) {
    const payload: TokenPayload = { id: id };
    const token = this.jwt.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: `${this.config.get('TOKEN_EXP')}`,
    });

    return token;
  }

  getCookieOption(tokenType: 'Authentication' | 'logout') {
    if (tokenType === 'logout') {
      return {
        httpOnly: true,
        secure: false,
        sameSite: 'lax' as const,
        path: '/',
        maxAge: 0,
      };
    }
    return {
      httpOnly: true,
      secure: false,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: Number(this.config.get<string>('TOKEN_EXP')),
    };
  }

  async factoryRegister(dto: CreateFactoryDto) {
    try {
      const location = await this.prismaService.subdistricts.findUnique({
        where: { subdistrict_id: dto.subdistrict_id },
        include: { district: true },
      });

      if (!location) {
        throw new BadRequestException('invalid subdistrict id');
      }

      const selectedSubdistrict = location.subdistrict_id;
      const selectedDistrict = location.district_id;
      const selectedProvince = location.district.province_id;

      const hashedPassword = await bcrypt.hash(dto.password, 12);

      await this.prismaService.accounts.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          role: 'Factory',
          username: dto.username,
          factory: {
            create: {
              address_no: dto.address_no,
              factory_type: dto.factory_type,
              fax_number: dto.fax_number,
              name_en: dto.name_en,
              name_th: dto.name_th,
              phone_number: dto.phone_number,
              province_id: selectedProvince,
              district_id: selectedDistrict,
              subdistrict_id: selectedSubdistrict,
              road: dto.road,
              soi: dto.soi,
              tsic_code: dto.tsic_code,
              zipcode: dto.zipcode,
            },
          },
        },
      });
    } catch (err) {
      // this.logger.error(err);
      if (err instanceof BadRequestException) {
        throw err;
      } else if (err instanceof PrismaClientKnownRequestError) {
        throw new BadRequestException('bad request by user');
      } else {
        throw new InternalServerErrorException('unexpected error');
      }
    }
  }
}
