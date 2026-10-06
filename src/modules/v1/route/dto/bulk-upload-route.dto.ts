/**
 * Bulk Route Upload DTO
 * ---------------------
 * Purpose : Create or update many routes (with outlets) in one request
 * Used by : ADMIN PANEL bulk route upload
 *
 * Notes:
 * - A route is matched by name; an existing route is updated
 *   (including its outlet list), otherwise a new route is created
 */

import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateRouteDto } from './create-route.dto';

export const ROUTE_BULK_UPLOAD_LIMIT = 500;

export class BulkUploadRouteDto {
  @ApiProperty({ type: () => [CreateRouteDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ROUTE_BULK_UPLOAD_LIMIT)
  @ValidateNested({ each: true })
  @Type(() => CreateRouteDto)
  routes!: CreateRouteDto[];
}
