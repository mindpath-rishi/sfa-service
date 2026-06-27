import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DesignationStatus } from 'src/shared/enums/designation.enums';

export class CreateDesignationDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  countryId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  provinceId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  marketId!: string;

  @ApiPropertyOptional({ example: DesignationStatus.ACTIVE, enum: DesignationStatus })
  @IsOptional()
  @IsEnum(DesignationStatus)
  status?: DesignationStatus;
}
