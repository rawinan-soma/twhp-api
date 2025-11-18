import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TokenPayload } from './token-payload.interface';
import { AuthenticationService } from './authentication.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authenticationService: AuthenticationService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.Authentication as string;
        },
      ]),
      secretOrKey: configService.get('JWT_SECRET')!,
      ignoreExpiration: false,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: TokenPayload) {
    const user = await this.authenticationService.getAccountById(payload.id);

    const newToken = this.authenticationService.getCookieFromToken(user.id);
    req.res?.cookie(
      'Authentication',
      newToken,
      this.authenticationService.getCookieOption('Authentication'),
    );

    return user;
  }
}
