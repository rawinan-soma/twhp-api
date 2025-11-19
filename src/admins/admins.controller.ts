import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminsService } from './admins.service';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { JwtGuard } from 'src/authentication/jwt.guard';
import type { RequestWithAccountData } from 'src/authentication/request-with-account-data.interface';
import { Roles } from 'src/authentication/roles.decorator';
import { RolesGuard } from 'src/authentication/roles.guard';
import { Role } from 'src/authentication/roles.enum';
import { UpdateFactoryDto } from 'src/factories/dto/update-factory-dto';
import { FactoriesService } from 'src/factories/factories.service';

@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.DOED)
@Controller('admins')
export class AdminsController {
  constructor(
    private readonly adminsService: AdminsService,
    private readonly factoriesService: FactoriesService,
  ) {}

  @Patch()
  async editAdminProfile(
    @Req() request: RequestWithAccountData,
    @Body() updateAdminDto: UpdateAdminDto,
  ) {
    return this.adminsService.editAdminProfile(request.user.id, updateAdminDto);
  }

  @Patch('factory/:id')
  async editFactoryProfile(
    @Param('id', ParseIntPipe) accountId: number,
    @Body() dto: UpdateFactoryDto,
  ) {
    return await this.factoriesService.updateFactoryData(accountId, dto);
  }

  @Patch('factory/validate/:id')
  @HttpCode(200)
  async validateFactoryRegister(@Param('id', ParseIntPipe) factoryId: number) {
    return this.adminsService.validateFactoryRegister(factoryId);
  }

  @Delete('factory/:id')
  async deleteFactory(@Param('id', ParseIntPipe) factoryId: number) {
    return await this.adminsService.deleteFactory(factoryId);
  }

  @Get('factories')
  async getAllFactory(@Query('validated', ParseBoolPipe) validated: boolean) {
    return this.adminsService.getAllFactories(validated);
  }

  @Get('factory')
  async getFactoryById(@Query('factory_id', ParseIntPipe) factoryId: number) {
    return this.adminsService.getFactoryById(factoryId);
  }
}
