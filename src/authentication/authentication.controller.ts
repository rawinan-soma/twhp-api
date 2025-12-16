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
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from 'prisma/generated/enums';

@Controller('authentication')
export class AuthenticationController {
  constructor(private readonly authenticationService: AuthenticationService) {}

  @UseGuards(LocalGuard)
  @HttpCode(200)
  @Post('login')
  @ApiOperation({ summary: 'login เข้าสู่ระบบ' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
      },
      required: ['username', 'password'],
    },
  })
  @ApiOkResponse({
    schema: {
      example: {
        message: 'login succesful',
        user: {
          id: 1,
          role: 'DOED',
          username: 'aaa',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    schema: { default: { message: 'invalid username or password' } },
  })
  @ApiBadRequestResponse({
    schema: { default: { message: 'bad request by user' } },
  })
  @ApiInternalServerErrorResponse({
    schema: { default: { message: 'unexpected error' } },
  })
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
  @ApiOperation({ summary: 'logout ออกจากระบบ' })
  @ApiOkResponse({ schema: { default: { message: 'logout successful' } } })
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
  @ApiOperation({
    summary: 'ตรวจสอบการเข้าสู่ระบบ ถ้า login อยู่จะ return ข้อมูลตัวเองออกมา',
  })
  @ApiOkResponse({
    schema: {
      example: {
        username: 'aaa',
        id: 1,
        email: 'example@mail.com',
        role: Roles.DOED,
      },
    },
  })
  @ApiUnauthorizedResponse({ schema: { default: { message: 'unauthorized' } } })
  authenticate(@Req() request: RequestWithAccountData) {
    return this.authenticationService.getAccountById(request.user.id);
  }
}
