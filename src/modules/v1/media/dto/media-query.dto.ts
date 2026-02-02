import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import {
  MEDIA_OWNER_TYPE,
  MEDIA_PURPOSE,
  MEDIA_TYPE,
} from 'src/shared/constants/media.constants';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class MediaQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: Object.values(MEDIA_OWNER_TYPE),
    example: 'PRODUCT',
    description: 'Module/entity type that owns the media',
  })
  @IsOptional()
  @IsEnum(Object.values(MEDIA_OWNER_TYPE))
  ownerType?: string;

  @ApiPropertyOptional({
    example: 'P001',
    description:
      'Owner record id (productId/customerId/employeeId/orderId etc.)',
  })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiPropertyOptional({
    example: 'V001',
    description: 'Optional sub owner id (variantId etc.)',
  })
  @IsOptional()
  @IsString()
  subOwnerId?: string;

  @ApiPropertyOptional({
    enum: Object.values(MEDIA_TYPE),
    example: 'IMAGE',
    description: 'Type of media (IMAGE/VIDEO/DOCUMENT etc.)',
  })
  @IsOptional()
  @IsEnum(Object.values(MEDIA_TYPE))
  mediaType?: string;

  @ApiPropertyOptional({
    enum: Object.values(MEDIA_PURPOSE),
    example: 'GALLERY',
    description: 'Purpose of the media (MAIN/PROFILE/RECEIPT etc.)',
  })
  @IsOptional()
  @IsEnum(Object.values(MEDIA_PURPOSE))
  purpose?: string;

  @ApiPropertyOptional({
    example: 'invoice',
    description: 'Search by url, storageKey, fileName, mimeType',
  })
  @IsOptional()
  @IsString()
  searchText?: string;
}
