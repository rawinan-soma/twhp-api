import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateFactoryDto } from './create-factory.dto';

export class UpdateFactoryDto extends PartialType(
  OmitType(CreateFactoryDto, ['username'] as const),
) {}
