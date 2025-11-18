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
  UseGuards,
} from '@nestjs/common';
import { AdminsService } from './admins.service';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { JwtGuard } from 'src/authentication/jwt.guard';

@UseGuards(JwtGuard)
@Controller('admins')
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  @Patch(':id')
  async editAdminProfile(
    @Param('id', ParseIntPipe) accountId: number,
    @Body() updateAdminDto: UpdateAdminDto,
  ) {
    return this.adminsService.editAdminProfile(accountId, updateAdminDto);
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
