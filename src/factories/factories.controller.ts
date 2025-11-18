import { Body, Controller, Post } from '@nestjs/common';
import { FactoriesService } from './factories.service';
import { CreateFactoryDto } from './dto/create-factory-dto';

@Controller('factories')
export class FactoriesController {
  constructor(private readonly factoriesService: FactoriesService) {}

  @Post('register')
  async factoryRegisterHandler(@Body() factoryData: CreateFactoryDto) {
    return await this.factoriesService.factoryRegister(factoryData);
  }
}
