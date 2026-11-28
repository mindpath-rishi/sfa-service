import { ApiPropertyOptional } from '@nestjs/swagger';
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

export const LOG_LEVEL_FILTERS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevelFilter = (typeof LOG_LEVEL_FILTERS)[number];

export class SystemLogsFilterDto {
  /** Minimum level: `warn` returns warnings, errors and fatals. */
  @ApiPropertyOptional({ enum: LOG_LEVEL_FILTERS })
  @IsOptional()
  @IsIn(LOG_LEVEL_FILTERS)
  level?: LogLevelFilter;

  @ApiPropertyOptional({
    description: 'Start of range (ISO). Defaults to 24 hours ago.',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'End of range (ISO). Defaults to now.' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ description: 'Request id (x-request-id)' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  reqId?: string;

  @ApiPropertyOptional({ example: 'EID18487411' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string;

  @ApiPropertyOptional({ example: 'VAN001' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  vanId?: string;

  @ApiPropertyOptional({
    description: 'API module, e.g. sale, sync, work-session',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  flow?: string;

  @ApiPropertyOptional({
    description: 'Logger context, e.g. MongoDB, SaleService',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  context?: string;

  @ApiPropertyOptional({ enum: ['2xx', '4xx', '5xx'] })
  @IsOptional()
  @IsIn(['2xx', '4xx', '5xx'])
  status?: '2xx' | '4xx' | '5xx';

  @ApiPropertyOptional({ description: 'Text in the message, URL or error' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class SystemLogsQueryDto extends SystemLogsFilterDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class SystemLogsDownloadDto extends SystemLogsFilterDto {
  @ApiPropertyOptional({ enum: ['text', 'json'], default: 'text' })
  @IsOptional()
  @IsIn(['text', 'json'])
  format?: 'text' | 'json';
}

export class SystemLogsSummaryDto {
  @ApiPropertyOptional({ default: 24, maximum: 336 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(336)
  hours?: number;
}
