/**
 * Update Media DTO
 * ----------------
 * Purpose : Update media metadata and optionally replace the file
 * Used by : MEDIA UPDATE / CMS / ADMIN FLOWS
 *
 * Allows:
 * - Replacing the media file
 * - Updating media type and purpose
 * - Modifying UI, SEO, and ordering attributes
 *
 * Notes:
 * - All fields are optional
 * - Upload limits are validated at service layer
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBooleanString,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  MEDIA_PURPOSE,
  MEDIA_TYPE,
} from 'src/shared/constants/media.constants';

export class UpdateMediaDto {
  /* ======================================================
   * FILE
   * ====================================================== */

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Optional file to replace existing media file',
  })
  @IsOptional()
  file?: any;

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
    example: MEDIA_PURPOSE.MAIN,
  })
  @IsOptional()
  @IsIn(Object.values(MEDIA_PURPOSE))
  purpose?: string;

  /* ======================================================
   * UI & SEO
   * ====================================================== */

  @ApiPropertyOptional({ example: 'New banner title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Alt text for SEO' })
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiPropertyOptional({ example: '/products/P001' })
  @IsOptional()
  @IsString()
  navigationUrl?: string;

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

  @ApiPropertyOptional({ example: 'false' })
  @IsOptional()
  @IsBooleanString()
  isPrimary?: string;
}
