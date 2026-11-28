import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SyncIssuesQueryDto {
  /** CONFLICT = server changed since the phone's copy (VERSION_CONFLICT). */
  @ApiPropertyOptional({
    enum: ['CONFLICT', 'ERROR', 'ALL'],
    default: 'CONFLICT',
  })
  @IsOptional()
  @IsIn(['CONFLICT', 'ERROR', 'ALL'])
  type?: 'CONFLICT' | 'ERROR' | 'ALL';

  /** OPEN = nobody decided yet; WAITING = decided, device has not retried. */
  @ApiPropertyOptional({ enum: ['OPEN', 'WAITING', 'ALL'], default: 'ALL' })
  @IsOptional()
  @IsIn(['OPEN', 'WAITING', 'ALL'])
  state?: 'OPEN' | 'WAITING' | 'ALL';

  @ApiPropertyOptional({ description: 'Salesman employee id' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ownerId?: string;

  @ApiPropertyOptional({ example: 'orders' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entity?: string;

  @ApiPropertyOptional({ description: 'Text in the error message' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ description: 'Defaults to 30 days ago' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ResolveSyncIssueDto {
  @ApiProperty({
    enum: ['APPLY_CLIENT', 'DISCARD'],
    description:
      "APPLY_CLIENT: overwrite the server with the salesman's change. DISCARD: drop the change on the device and keep the server copy.",
  })
  @IsIn(['APPLY_CLIENT', 'DISCARD'])
  action!: 'APPLY_CLIENT' | 'DISCARD';

  @ApiPropertyOptional({ description: 'Why this decision was taken' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
