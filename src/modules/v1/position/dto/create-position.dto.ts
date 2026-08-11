import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { PositionStatus } from 'src/shared/enums/position.enums';

export class CreatePositionDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  parentCategoryId?: string[];

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  countryId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  provinceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marketId?: string;

  @ApiProperty({ description: 'Role inherited by employees in this position' })
  @IsNotEmpty()
  @IsString()
  roleId!: string;

  @ApiPropertyOptional({
    example: 'EID-1A2B3C4D',
    nullable: true,
    description:
      'Employee mapped to this position. Set null when updating to remove the mapping.',
  })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({
    description: 'Parent position ID in the reporting hierarchy',
  })
  @IsOptional()
  @IsString()
  reportTo?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Van IDs assigned to this position',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  vanIds?: string[];

  @ApiPropertyOptional({
    example: false,
    description:
      'Allow the employee mapped to this position to work offline. Available only for sales positions.',
  })
  @IsOptional()
  @IsBoolean()
  offlineAccessAllowed?: boolean;

  @ApiPropertyOptional({
    example: PositionStatus.ACTIVE,
    enum: PositionStatus,
  })
  @IsOptional()
  @IsEnum(PositionStatus)
  status?: PositionStatus;
}
