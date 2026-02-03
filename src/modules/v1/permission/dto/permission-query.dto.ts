import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class PermissionsQueryDto {
  @ApiPropertyOptional({
    example: 'customer',
    description: 'Search permissions by code, name, or module',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  searchText?: string;
}
