import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsString,
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
