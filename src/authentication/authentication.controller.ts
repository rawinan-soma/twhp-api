import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticationService } from './authentication.service';
import type { RequestWithAccountData } from './request-with-account-data.interface';
import { LocalGuard } from './local.guard';
import { JwtGuard } from './jwt.guard';
import { CreateFactoryDto } from './dto/create-factory-dto';

@Controller('authentication')
export class AuthenticationController {
  constructor(private readonly authenticationService: AuthenticationService) {}

  @UseGuards(LocalGuard)
  @HttpCode(200)
  @Post('login')
  async loginHandler(@Req() request: RequestWithAccountData) {
    const account = await this.authenticationService.getAccountById(
      request.user?.id,
    );

    const tokenCookie = this.authenticationService.getCookieFromToken(
      Number(account.id),
    );

    request.res?.cookie(
      'Authentication',
      tokenCookie,
      this.authenticationService.getCookieOption('Authentication'),
    );

    return {
      message: 'login succesful',
    };
  }

  @UseGuards(JwtGuard)
  @Post('logout')
  @HttpCode(200)
  logoutHandler(@Req() request: RequestWithAccountData) {
    request.res?.clearCookie('Authentication');
    return {
      message: 'logout succesful',
    };
  }

  @Post('factory/register')
  async factoryRegisterHandler(@Body() dto: CreateFactoryDto) {
    return await this.authenticationService.factoryRegister(dto);
  }
}
