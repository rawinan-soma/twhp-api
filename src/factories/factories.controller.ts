import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FactoriesService } from './factories.service';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { JwtGuard } from 'src/authentication/jwt.guard';
import { Public } from 'src/authentication/public.decorator';
import type { RequestWithAccountData } from 'src/authentication/request-with-account-data.interface';
import { UpdateFactoryDto } from './dto/update-factory.dto';
import { RolesGuard } from 'src/authentication/roles.guard';
import { Roles } from 'src/authentication/roles.decorator';
import { Role } from 'src/authentication/roles.enum';
import { EnrollsService } from 'src/enrolls/enrolls.service';
import { CreateEnrollDto } from 'src/enrolls/dto/create-enroll.dto';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.FACTORY)
@Controller('factories')
export class FactoriesController {
  constructor(
    private readonly factoriesService: FactoriesService,
    private readonly enrollsService: EnrollsService,
  ) {}

  @ApiBody({ type: CreateFactoryDto })
  @Public()
  @Post('register')
  @ApiOperation({ summary: 'ลงทะเบียนสถานประกอบการใหม่' })
  @ApiCreatedResponse({
    schema: {
      default: {
        message: 'factory created successfully',
        factory: {
          factory_id: '12345667890',
          name: 'โรงงานลำไย',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    examples: {
      factoryAlreadyExists: {
        summary: 'factory already exists',
        value: { message: 'factory already exists' },
      },
      invalidLocation: {
        summary: 'ระบุตำบลผิด',
        value: { message: 'invalide subdistrict id' },
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
  async factoryRegisterHandler(@Body() factoryData: CreateFactoryDto) {
    return await this.factoriesService.factoryRegister(factoryData);
  }

  @ApiBody({ type: UpdateFactoryDto })
  @ApiCookieAuth()
  @Patch()
  @ApiOperation({ summary: 'อัพเดตข้อมูลสถานประกอบการ' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    schema: { default: { message: 'factory updated successfully' } },
  })
  @ApiBadRequestResponse({
    examples: {
      notFound: {
        summary: 'ไม่พบข้อมูลสปก.',
        value: { message: 'factory not found' },
      },
      invalidLocation: {
        summary: 'ระบุตำบลผิด',
        value: { message: 'invalid subdistrict id' },
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
  async updateFactoryHandler(
    @Req() request: RequestWithAccountData,
    @Body() dto: UpdateFactoryDto,
  ) {
    return await this.factoriesService.updateFactoryData(request.user.id, dto);
  }

  @Post('enroll')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'สมัครเข้าร่วมโครงการประเมิน' })
  @ApiCreatedResponse({
    schema: {
      default: {
        message: 'create enrollment successfully.',
        enrollment: {
          enroll_id: 1,
          factory_id: 123124134,
          enrollment_date: new Date(Date.now()).toISOString(),
        },
      },
    },
  })
  @ApiBadRequestResponse({
    examples: {
      existingEnroll: {
        summary: 'มีการสมัครแล้วในปีงบประมาณนั้น',
        value: { message: 'already enroll in this fiscal year' },
      },
      badrequest: {
        summary: 'bad request อื่นๆ',
        value: { message: 'bad request' },
      },
    },
  })
  @ApiUnauthorizedResponse({
    schema: { default: { message: 'unauthorized' } },
  })
  @ApiInternalServerErrorResponse({
    schema: { default: { message: 'unexpected error' } },
  })
  async createNewEnrollment(
    @Req() request: RequestWithAccountData,
    @Body() dto: CreateEnrollDto,
  ) {
    return await this.enrollsService.createEnrollment(dto, request.user.id);
  }

  @Get('enroll')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'เรียกดูการเข้าร่วมโครงการในปีงบประมาณนั้น' })
  async getEnrollmentinFiscalYear(@Req() request: RequestWithAccountData) {
    return await this.enrollsService.getEnrollmentInFiscalYear(request.user.id);
  }
}
