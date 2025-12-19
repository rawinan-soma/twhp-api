import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/authentication/jwt.guard';
import type { RequestWithAccountData } from 'src/authentication/request-with-account-data.interface';
import { Roles } from 'src/authentication/roles.decorator';
import { Role } from 'src/authentication/roles.enum';
import { RolesGuard } from 'src/authentication/roles.guard';
import { UpdateFactoryDto } from 'src/factories/dto/update-factory.dto';
import { FactoriesService } from 'src/factories/factories.service';
import { EnrollsService } from 'src/enrolls/enrolls.service';
import { AdminsService } from './admins.service';
import { UpdateAdminDto } from './dto/update-admin.dto';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { GetFactoriesResponseDto } from './dto/getAllFactoriesResponse.dto';
import { GetEnrollResponseDto } from 'src/enrolls/dto/getEnrollsResponse.dto';

@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.DOED)
@ApiCookieAuth()
@Controller('admins')
export class AdminsController {
  constructor(
    private readonly adminsService: AdminsService,
    private readonly factoriesService: FactoriesService,
    private readonly enrollsService: EnrollsService,
  ) {}

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'update ข้อมูล admin' })
  @ApiOkResponse({
    schema: {
      default: {
        account_id: 1,
        first_name: 'aaa',
        last_name: 'bbb',
        phone_number: '0999999999',
        email: 'mail@mail.com',
      },
    },
  })
  @ApiBadRequestResponse({
    examples: {
      adminNotFound: {
        summary: 'ไม่มีข้อมูล admin',
        value: { message: 'admin not found' },
      },
      badRequest: {
        summary: 'bad request อื่นๆ',
        value: { message: 'bad request อื่นๆ' },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    schema: { default: { message: 'unexpected error' } },
  })
  @ApiUnauthorizedResponse({
    schema: { default: { message: 'unauthorized' } },
  })
  async editAdminProfile(
    @Req() request: RequestWithAccountData,
    @Body() updateAdminDto: UpdateAdminDto,
  ) {
    return this.adminsService.editAdminProfile(request.user.id, updateAdminDto);
  }

  @Patch('factory/:id')
  @ApiOperation({
    summary: 'update ข้อมูลสถานประกอบการ',
  })
  @HttpCode(200)
  @ApiOkResponse({
    schema: { default: { message: 'factory updated successfully' } },
  })
  @ApiBadRequestResponse({
    examples: {
      notFound: {
        summary: 'ไม่มีข้อมูลสปก.',
        value: { message: 'factory not found' },
      },
      other: {
        summary: 'bad request อื่นๆ',
        value: { message: 'bad request อื่นๆ' },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    schema: { default: { message: 'unexpected error' } },
  })
  @ApiUnauthorizedResponse({
    schema: { default: { message: 'unauthorized' } },
  })
  async editFactoryProfile(
    @Param('id', ParseIntPipe) accountId: number,
    @Body() dto: UpdateFactoryDto,
  ) {
    return await this.factoriesService.updateFactoryData(accountId, dto);
  }

  @Patch('factory/validate/:id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'อนุมัติการลงทะเบียนของสถานประกอบการ',
  })
  @ApiOkResponse({
    schema: {
      default: { factory_id: 1, factory_name: 'โรงงานลำไย', is_validate: true },
    },
  })
  @ApiBadRequestResponse({
    content: {
      'application/json': {
        examples: {
          factoryNotFound: {
            summary: 'ไม่มีสถานประกอบการ',
            value: { message: 'factory not found' },
          },
          factoryAlreadyValidated: {
            summary: 'สถานประกอบการนั้นยืนยันไปแล้ว',
            value: { message: 'factory already validated' },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    schema: { default: { message: 'unauthorized' } },
  })
  @ApiInternalServerErrorResponse({
    schema: { default: { message: 'unexpected error' } },
  })
  async validateFactoryRegister(@Param('id', ParseIntPipe) factoryId: number) {
    return this.adminsService.validateFactoryRegister(factoryId);
  }

  @Delete('factory/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'ลบข้อมูลสถานประกอบการ',
  })
  @ApiOkResponse({
    schema: { default: { message: 'factory deleted successfully' } },
  })
  @ApiBadRequestResponse({
    examples: {
      factoryNotFound: {
        summary: 'ไม่มีสถานประกอบการ',
        value: { message: 'factory not found' },
      },
      other: {
        summary: 'bad request อื่นๆ',
        value: { message: 'bad request อื่นๆ' },
      },
    },
  })
  @ApiUnauthorizedResponse({
    schema: { default: { message: 'unauthorized' } },
  })
  @ApiInternalServerErrorResponse({
    schema: { default: { message: 'unexpected error' } },
  })
  async deleteFactory(@Param('id', ParseIntPipe) factoryId: number) {
    return await this.adminsService.deleteFactory(factoryId);
  }

  @Get('factories')
  @ApiOperation({
    summary: 'ดึงข้อมูลสถานประกอบการทุกแห่ง เลือกได้ว่าจะเอาอนุมัติแล้วหรือไม่',
  })
  @ApiQuery({ name: 'validated', required: true, type: Boolean })
  @ApiQuery({ name: 'enrolled', required: false, type: Boolean })
  @ApiOkResponse({ type: GetFactoriesResponseDto, isArray: true })
  @ApiUnauthorizedResponse({
    schema: { default: { message: 'unauthorized' } },
  })
  @ApiInternalServerErrorResponse({
    schema: { default: { message: 'unexpected error' } },
  })
  // TODO: Test new query
  async getAllFactory(
    @Query('validated', ParseBoolPipe) validated: boolean,
    @Query('enrolled', new ParseBoolPipe({ optional: true }))
    enrolled?: boolean,
  ) {
    return this.adminsService.getAllFactories(validated, enrolled);
  }

  @Get('factory/:id')
  @ApiOkResponse({ type: GetFactoriesResponseDto })
  @ApiOperation({
    summary: 'ดึงข้อมูลสถานประกอบการตามเลขสถานประกอบการ',
  })
  @ApiBadRequestResponse({
    examples: {
      factoryNotFound: {
        summary: 'ไม่มีสถานประกอบการ',
        value: { message: 'factory not found' },
      },
      other: {
        summary: 'bad request อื่นๆ',
        value: { message: 'bad request อื่นๆ' },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    schema: { default: { message: 'unexpected error' } },
  })
  @ApiUnauthorizedResponse({
    schema: { default: { message: 'unauthorized' } },
  })
  async getFactoryById(@Param('id', ParseIntPipe) factoryId: number) {
    return this.adminsService.getFactoryById(factoryId);
  }

  @Get('enrolls')
  @ApiOperation({
    summary: 'ดึงข้อมูลการลงทะเบียนเข้าสู่โครงการประเมินทั้งหมด',
  })
  @ApiOkResponse({ type: GetEnrollResponseDto, isArray: true })
  @ApiInternalServerErrorResponse({
    schema: { default: { message: 'unexpected error' } },
  })
  @ApiUnauthorizedResponse({
    schema: { default: { message: 'unauthorized' } },
  })
  async getAllEnrolls() {
    return await this.enrollsService.getAllEnrolls();
  }

  @Get('enroll/:enroll_id')
  @ApiOperation({
    summary: 'ดึงข้อมูลการลงทะเบียนเข้าสู่โครงการประเมินตามเลขการลงทะเบียน',
  })
  @ApiOkResponse({ type: GetEnrollResponseDto })
  @ApiBadRequestResponse({
    examples: {
      enrollNotFound: {
        summary: 'ไม่มีการลงทะเบียน',
        value: { message: 'enroll not found' },
      },
      other: {
        summary: 'bad request อื่นๆ',
        value: { message: 'bad request อื่นๆ' },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    schema: { default: { message: 'unexpected error' } },
  })
  @ApiUnauthorizedResponse({
    schema: { default: { message: 'unauthorized' } },
  })
  async getEnrollById(@Param('enroll_id', ParseIntPipe) enrollId: number) {
    return await this.enrollsService.getEnrollById(enrollId);
  }
}
