import { Test, TestingModule } from '@nestjs/testing';
import { FactoriesController } from './factories.controller';
import { FactoriesModule } from './factories.module';
import { AuthenticationModule } from 'src/authentication/authentication.module';

describe('FactoriesController', () => {
  let controller: FactoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [FactoriesModule, AuthenticationModule],
    }).compile();

    controller = module.get<FactoriesController>(FactoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
