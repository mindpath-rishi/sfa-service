import { Optional } from '@nestjs/common';
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
  @IsOptional()
  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Optional file to replace existing media file',
  })
  file?: any;

  /* ✅ Allow changing mediaType + purpose */
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

  /* ✅ UI fields */
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

  /* ✅ sorting / primary */
  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsNumberString()
  sortOrder?: string;

  @ApiPropertyOptional({ example: 'false' })
  @IsOptional()
  @IsBooleanString()
  isPrimary?: string;
}
