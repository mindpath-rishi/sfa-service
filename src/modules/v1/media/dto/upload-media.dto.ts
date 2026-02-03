/**
 * Upload Media DTO
 * ----------------
 * Purpose : Upload a new media file with metadata
 * Used by : MEDIA UPLOAD / CMS / ADMIN FLOWS
 *
 * Allows:
 * - Uploading media for any supported owner
 * - Optional media classification and UI metadata
 * - Sorting and primary media designation
 *
 * Notes:
 * - Designed for multipart/form-data
 * - Boolean values are received as strings
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  IsBooleanString,
} from 'class-validator';

import {
  MEDIA_OWNER_TYPE,
  MEDIA_PURPOSE,
  MEDIA_TYPE,
} from 'src/shared/constants/media.constants';

export class UploadMediaDto {
  /* ======================================================
   * FILE
   * ====================================================== */
  @IsOptional()
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Upload file (image/pdf/etc)',
  })
  file: any;

  /* ======================================================
   * OWNER
   * ====================================================== */

  @ApiProperty({
    enum: Object.values(MEDIA_OWNER_TYPE),
    example: MEDIA_OWNER_TYPE.PRODUCT,
  })
  @IsIn(Object.values(MEDIA_OWNER_TYPE))
  ownerType: string;

  @ApiProperty({ example: 'P001' })
  @IsString()
  ownerId: string;

  @ApiPropertyOptional({ example: 'V001' })
  @IsOptional()
  @IsString()
  subOwnerId?: string;

  /* ======================================================
   * MEDIA CLASSIFICATION
   * ====================================================== */

  @ApiPropertyOptional({
    enum: Object.values(MEDIA_TYPE),
    example: MEDIA_TYPE.IMAGE,
  })
  @IsOptional()
  @IsIn(Object.values(MEDIA_TYPE))
  mediaType?: string;

  @ApiPropertyOptional({
    enum: Object.values(MEDIA_PURPOSE),
    example: MEDIA_PURPOSE.GALLERY,
  })
  @IsOptional()
  @IsIn(Object.values(MEDIA_PURPOSE))
  purpose?: string;

  /* ======================================================
   * UI & SEO
   * ====================================================== */

  @ApiPropertyOptional({ example: 'Product Banner' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Special offer for this week' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Banner image for product' })
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiPropertyOptional({ example: '/products/P001' })
  @IsOptional()
  @IsString()
  navigationUrl?: string;

  /**
   * Accepts:
   * - Comma-separated string (e.g. "banner,offer")
   * - Array format (e.g. ["banner","offer"])
   */
  @ApiPropertyOptional({
    example: 'banner,offer,home',
    description: 'Comma separated tags OR array format',
  })
  @IsOptional()
  tags?: string | string[];

  /* ======================================================
   * ORDERING & PRIMARY FLAG
   * ====================================================== */

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsNumberString()
  sortOrder?: string;

  /**
   * Boolean flag received as string in multipart/form-data.
   */
  @ApiPropertyOptional({ example: 'false' })
  @IsOptional()
  @IsBooleanString()
  isPrimary?: string;
}
