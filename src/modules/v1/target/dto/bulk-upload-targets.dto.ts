import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateTargetDto } from './create-target.dto';

export class BulkUploadTargetsDto {
  @ApiProperty({ type: [CreateTargetDto], description: 'Target rows to create' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CreateTargetDto)
  items!: CreateTargetDto[];
}
