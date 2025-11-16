import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'prisma/prisma.service';
import { TokenPayload } from './token-payload.interface';

export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          return request?.cookies?.Authentication as string;
        },
      ]),
      secretOrKey: config.get('JWT_SECRET')!,
    });
  }

  async validate(payload: TokenPayload) {
    const user = await this.prisma.accounts.findUnique({
      where: { id: payload.id },
      select: { username: true, role: true },
    });

    return user;
  }
}
