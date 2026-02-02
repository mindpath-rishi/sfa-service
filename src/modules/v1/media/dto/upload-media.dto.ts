import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  IsBooleanString,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';

import {
  MEDIA_OWNER_TYPE,
  MEDIA_PURPOSE,
  MEDIA_TYPE,
} from 'src/shared/constants/media.constants';

export class UploadMediaDto {
  /* ================= OWNER ================= */
  @IsOptional()
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Upload file (image/pdf/etc)',
  })
  file: any;

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

  /* ================= MEDIA TYPE ================= */

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

  /* ================= OPTIONAL UI / SEO ================= */

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
   * ✅ Accept in 2 ways:
   * 1) tags="banner,offer,home"
   * 2) tags=["banner","offer"]
   */
  @ApiPropertyOptional({
    example: 'banner,offer,home',
    description: 'Comma separated tags OR array format',
  })
  @IsOptional()
  tags?: string | string[];

  /* ================= SORT / PRIMARY ================= */

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsNumberString()
  sortOrder?: string;

  /**
   * ✅ In multipart/form-data, boolean comes as string:
   * isPrimary="true" | "false"
   */
  @ApiPropertyOptional({ example: 'false' })
  @IsOptional()
  @IsBooleanString()
  isPrimary?: string;
}
