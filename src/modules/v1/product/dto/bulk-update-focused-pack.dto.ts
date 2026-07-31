import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';

export class FocusedPackBulkItemDto {
  @ApiProperty({ example: 'Mango Drink 250ml' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    example: 'SYS-1048',
    description: 'Unique product system code from Product Master',
  })
  @IsString()
  @IsNotEmpty()
  productCode!: string;

  @ApiProperty({ enum: ['Y', 'N'], example: 'Y' })
  @IsString()
  @IsIn(['Y', 'N'])
  isFocusedPack!: 'Y' | 'N';
}

export class BulkUpdateFocusedPackDto {
  @ApiProperty({
    type: [FocusedPackBulkItemDto],
    description: 'Focused Pack values imported from the product workbook',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FocusedPackBulkItemDto)
  items!: FocusedPackBulkItemDto[];
}
