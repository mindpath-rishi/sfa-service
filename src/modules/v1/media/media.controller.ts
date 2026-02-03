/**
 * Media Controller
 * ----------------
 * Purpose : Exposes HTTP endpoints for media management
 * Used by : ADMIN PANEL / CMS / MOBILE APPS / PUBLIC APIs
 *
 * Responsibilities:
 * - Accept HTTP requests
 * - Validate required inputs (e.g., file presence)
 * - Delegate business logic to MediaService
 *
 * Notes:
 * - All business logic lives in MediaService
 * - Controller remains thin by design
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import { Public } from 'src/core/decorators/public.decorator';
import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';

import {
  API_MODULE,
  API_MODULE_ENABLE_KEYS,
  V1,
} from 'src/shared/constants/api.constants';

import { MediaQueryDto } from './dto/media-query.dto';
import { UploadMediaDto } from './dto/upload-media.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { MediaService } from './media.service';

@Public()
@ApiTags('Media')
@FeatureFlag(API_MODULE_ENABLE_KEYS.MEDIA)
@Controller({
  path: API_MODULE.MEDIA,
  version: V1,
})
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  /**
   * Upload Media File
   * -----------------
   * Purpose : Upload a file and create a media record
   * Used by : PRODUCT IMAGES / BANNERS / DOCUMENT UPLOADS
   *
   * Flow:
   * - Accept multipart file
   * - Validate file presence
   * - Delegate upload + creation to MediaService
   *
   * Notes:
   * - Duplicate detection is handled in service
   * - Upload limits are enforced in service
   */
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload file and create media record' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadMediaDto })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadMediaDto,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.mediaService.uploadAndCreate(file, body, req.user);
  }

  /**
   * Get Media List
   * --------------
   * Purpose : Fetch paginated media records
   * Used by : MEDIA GALLERY / CMS LISTING / ADMIN SCREENS
   *
   * Supports:
   * - Pagination
   * - Owner-based filtering
   * - Media type & purpose filtering
   * - Text search
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  findAll(@Query() query: MediaQueryDto) {
    return this.mediaService.findAll(query);
  }

  /**
   * Get Media by ID
   * ---------------
   * Purpose : Fetch a single media record
   * Used by : MEDIA PREVIEW / DETAIL VIEW
   *
   * Params:
   * - mediaId : Unique media identifier
   */
  @Get(':mediaId')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'mediaId', example: 'MID-001' })
  findOne(@Param('mediaId') mediaId: string) {
    return this.mediaService.findByMediaId(mediaId);
  }

  /**
   * Update Media
   * ------------
   * Purpose : Update media metadata and optionally replace file
   * Used by : CMS EDIT SCREENS
   *
   * Supports:
   * - Metadata updates (title, tags, purpose, type)
   * - File replacement with checksum validation
   * - Group change validation and limits
   *
   * Notes:
   * - If file is uploaded, old storage files are deleted
   * - Duplicate checksum is prevented
   */
  @Patch(':mediaId')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateMediaDto })
  @UseInterceptors(FileInterceptor('file'))
  async update(
    @Param('mediaId') mediaId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UpdateMediaDto,
    @Req() req: any,
  ) {
    return this.mediaService.updateMedia(
      mediaId,
      dto,
      file,
      req.user,
    );
  }

  /**
   * Delete Media (Hard Delete)
   * -------------------------
   * Purpose : Permanently remove media from storage and database
   * Used by : ADMIN / CMS CLEANUP FLOWS
   *
   * Flow:
   * - Delete physical file(s) from storage
   * - Remove database record
   *
   * Notes:
   * - This is a hard delete (not recoverable)
   */
  @Delete(':mediaId')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('mediaId') mediaId: string) {
    return this.mediaService.hardDelete(mediaId);
  }
}
