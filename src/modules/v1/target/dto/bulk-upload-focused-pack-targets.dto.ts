import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateFocusedPackTargetDto } from './create-focused-pack-target.dto';

export class BulkUploadFocusedPackTargetsDto {
  @ApiProperty({ type: [CreateFocusedPackTargetDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CreateFocusedPackTargetDto)
  items!: CreateFocusedPackTargetDto[];
}
