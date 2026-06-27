import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { IsArray, ArrayMinSize, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { V1 } from 'src/shared/constants/api.constants';
import { MasterBulkService } from './master-bulk.service';

class MasterBulkItemDto {
  @IsObject()
  value!: Record<string, unknown>;
}

class MasterBulkUploadDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MasterBulkItemDto)
  items!: MasterBulkItemDto[];
}

@ApiTags('Master Bulk Upload')
@Controller({ path: 'master', version: V1 })
export class MasterBulkController {
  constructor(private readonly service: MasterBulkService) {}

  @Post('bulk-upload/:entity')
  bulkUpload(@Param('entity') entity: string, @Body() dto: MasterBulkUploadDto) {
    return this.service.upload(entity, dto.items.map((item) => item.value));
  }

  @Get('export/:entity')
  async export(@Param('entity') entity: string, @Query('fileType') fileType: 'xlsx' | 'csv' | 'pdf' = 'xlsx', @Query('type') type: string | undefined, @Res() res: Response) {
    const file = await this.service.export(entity, fileType, type);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.buffer);
  }

  @Get('bulk-template/:entity')
  async template(@Param('entity') entity: string, @Query('type') type: string | undefined, @Res() res: Response) {
    const file = await this.service.template(entity, type);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.send(file.buffer);
  }
}
