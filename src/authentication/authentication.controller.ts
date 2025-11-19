import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthenticationService } from './authentication.service';
import type { RequestWithAccountData } from './request-with-account-data.interface';
import { LocalGuard } from './local.guard';
import { JwtGuard } from './jwt.guard';
import type { Response } from 'express';

@Controller('authentication')
export class AuthenticationController {
  constructor(private readonly authenticationService: AuthenticationService) {}

  @UseGuards(LocalGuard)
  @HttpCode(200)
  @Post('login')
  async loginHandler(
    @Req() request: RequestWithAccountData,
    @Res({ passthrough: true }) response: Response,
  ) {
    const account = await this.authenticationService.getAccountById(
      request.user?.id,
    );

    const tokenCookie = this.authenticationService.getCookieFromToken(
      Number(account.id),
    );

    response.cookie(
      'Authentication',
      tokenCookie,
      this.authenticationService.getCookieOption('Authentication'),
    );

    return {
      message: 'login succesful',
      user: {
        id: account.id,
        role: account.role,
        username: account.username,
      },
    };
  }

  @UseGuards(JwtGuard)
  @Post('logout')
  @HttpCode(200)
  logoutHandler(
    @Req() request: RequestWithAccountData,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.cookie(
      'Authentication',
      '',
      this.authenticationService.getCookieOption('logout'),
    );
    return {
      message: 'logout successful',
    };
  }

  @UseGuards(JwtGuard)
  @Get()
  authenticate(@Req() request: RequestWithAccountData) {
    return this.authenticationService.getAccountById(request.user.id);
  }
}
