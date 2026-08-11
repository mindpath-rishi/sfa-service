import { ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { SchemeStatus } from 'src/shared/enums/scheme.enums';
import { CreateSchemeDto } from './create-scheme.dto';

/**
 * UpdateSchemeDto
 * =================
 * DTO for updating Scheme
 */
export class UpdateSchemeDto extends PartialType(
  OmitType(CreateSchemeDto, [] as const),
) {
  @ApiPropertyOptional({ enum: SchemeStatus })
  @IsOptional()
  @IsEnum(SchemeStatus)
  status?: SchemeStatus;
}
