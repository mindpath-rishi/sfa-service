import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { VanBreakdownReason } from 'src/shared/enums/van.enums';

export class UpdateVanBreakdownDto {
  @ApiProperty({
    type: [String],
    example: ['VID-001', 'VID-002'],
    description: 'Van IDs selected by the manager',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  vanIds!: string[];

  @ApiProperty({
    enum: VanBreakdownReason,
    example: VanBreakdownReason.ENGINE_ISSUE,
  })
  @IsEnum(VanBreakdownReason)
  reason!: VanBreakdownReason;
}

/** Manager marks broken-down vans as working again. */
export class ResolveVanBreakdownDto {
  @ApiProperty({ type: [String], example: ['BAC-4530'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  vanIds!: string[];

  @ApiProperty({ required: false, example: 'Engine repaired, vehicle working' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
