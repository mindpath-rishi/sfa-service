import { CustomerStatus } from 'src/shared/enums/customer.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { Type } from 'class-transformer';

class AddressDto {
  @ApiProperty({ example: '123 Main Street' })
  @IsNotEmpty()
  @IsString()
  @Length(3, 150)
  line1!: string;

  @ApiProperty({ example: 'Near City Mall', required: false })
  @IsOptional()
  @IsString()
  @Length(0, 150)
  line2?: string;
}
export class CustomerQueryDto extends PaginationDto {
  /**
   * SearchText
   * ----------
   * Search by name, code, or identifier
   */
  @ApiPropertyOptional({
    description: 'Search by name, code, or identifier',
    example: 'search term',
  })
  @IsOptional()
  @IsString()
  searchText?: string;

  @ApiPropertyOptional({ type: String, description: 'Reference ID' })
  @IsOptional()
  @IsString()
  customerCategoryId?: string;

  @ApiPropertyOptional({ type: String, description: 'Reference ID' })
  @IsOptional()
  @IsString()
  channelId?: string;

  @ApiPropertyOptional({ type: String, description: 'Reference ID' })
  @IsOptional()
  @IsString()
  outletTypeId?: string;

  @ApiPropertyOptional({ type: String, description: 'Reference ID' })
  @IsOptional()
  @IsString()
  marketId?: string;

  @ApiPropertyOptional({ type: String, description: 'Reference ID' })
  @IsOptional()
  @IsString()
  provinceId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  outletName?: string;

  @ApiPropertyOptional({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;

  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'name',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: ['asc', 'desc'],
    example: 'asc',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  /**
   * Status
   * ------
   * Reference of customer category
   */
  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @ApiPropertyOptional({
    type: [String],
    isArray: true,
    description: 'Filter by multiple customerIds',
    example: ['CUST-001', 'CUST-002'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customerIds?: string[];
}
