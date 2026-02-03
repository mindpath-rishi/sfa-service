/**
 * Media Query DTO
 * ----------------
 * Purpose : Filter and paginate media records
 * Used by : MEDIA LIST / GALLERY / CMS SCREENS
 *
 * Supports:
 * - Owner-based filtering
 * - Media type and purpose filters
 * - Text search
 * - Pagination
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import {
  MEDIA_OWNER_TYPE,
  MEDIA_PURPOSE,
  MEDIA_TYPE,
} from 'src/shared/constants/media.constants';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class MediaQueryDto extends PaginationDto {
  /** Owner entity type (Product, Category, User, etc.) */
  @ApiPropertyOptional({
    enum: Object.values(MEDIA_OWNER_TYPE),
    example: 'PRODUCT',
    description: 'Module/entity type that owns the media',
  })
  @IsOptional()
  @IsEnum(Object.values(MEDIA_OWNER_TYPE))
  ownerType?: string;

  /** Primary owner business identifier */
  @ApiPropertyOptional({
    example: 'P001',
    description:
      'Owner record id (productId/customerId/employeeId/orderId etc.)',
  })
  @IsOptional()
  @IsString()
  ownerId?: string;

  /** Optional secondary owner identifier (e.g. variantId) */
  @ApiPropertyOptional({
    example: 'V001',
    description: 'Optional sub owner id (variantId etc.)',
  })
  @IsOptional()
  @IsString()
  subOwnerId?: string;

  /** Media format filter */
  @ApiPropertyOptional({
    enum: Object.values(MEDIA_TYPE),
    example: 'IMAGE',
    description: 'Type of media (IMAGE/VIDEO/DOCUMENT etc.)',
  })
  @IsOptional()
  @IsEnum(Object.values(MEDIA_TYPE))
  mediaType?: string;

  /** Media usage/purpose filter */
  @ApiPropertyOptional({
    enum: Object.values(MEDIA_PURPOSE),
    example: 'GALLERY',
    description: 'Purpose of the media (MAIN/PROFILE/RECEIPT etc.)',
  })
  @IsOptional()
  @IsEnum(Object.values(MEDIA_PURPOSE))
  purpose?: string;

  /** Free-text search across media metadata */
  @ApiPropertyOptional({
    example: 'invoice',
    description: 'Search by url, storageKey, fileName, mimeType',
  })
  @IsOptional()
  @IsString()
  searchText?: string;
}
