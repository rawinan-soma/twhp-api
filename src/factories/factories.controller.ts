import { Body, Controller, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { FactoriesService } from './factories.service';
import { CreateFactoryDto } from './dto/create-factory-dto';
import { JwtGuard } from 'src/authentication/jwt.guard';
import { Public } from 'src/authentication/public.decorator';
import type { RequestWithAccountData } from 'src/authentication/request-with-account-data.interface';
import { UpdateFactoryDto } from './dto/update-factory-dto';
import { RolesGuard } from 'src/authentication/roles.guard';
import { Roles } from 'src/authentication/roles.decorator';
import { Role } from 'src/authentication/roles.enum';
import { EnrollsService } from '../enrolls/enrolls.service';
import { CreateEnrollDto } from '../enrolls/dto/create-enroll.dto';

@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.FACTORY)
@Controller('factories')
export class FactoriesController {
  constructor(
    private readonly factoriesService: FactoriesService,
    private readonly enrollsService: EnrollsService,
  ) {}

  @Public()
  @Post('register')
  async factoryRegisterHandler(@Body() factoryData: CreateFactoryDto) {
    return await this.factoriesService.factoryRegister(factoryData);
  }

  @Patch()
  async updateFactoryHandler(
    @Req() request: RequestWithAccountData,
    @Body() dto: UpdateFactoryDto,
  ) {
    return await this.factoriesService.updateFactoryData(request.user.id, dto);
  }

  @Post('enroll')
  async createNewEnrollment(
    @Req() request: RequestWithAccountData,
    @Body() dto: CreateEnrollDto,
  ) {
    return await this.enrollsService.createEnrollment(dto, request.user.id);
  }
}
