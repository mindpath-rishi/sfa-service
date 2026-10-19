import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { BackOfficeOnly } from 'src/core/decorators/back-office-only.decorator';
import { API_MODULE, V1 } from 'src/shared/constants/api.constants';
import { BulkImportService } from './bulk-import.service';

const MAX_FILE_MB = Math.max(1, Number(process.env.BULK_IMPORT_MAX_FILE_MB) || 25);

const attachment = (res: Response, fileName: string, mimeType: string) => {
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
};

/**
 * One endpoint family for every MIS bulk upload. The server reads the file,
 * processes it in the background and returns a result file with Status and
 * Remark on every row.
 */
@ApiTags('Bulk Import')
@BackOfficeOnly()
@Controller({ path: API_MODULE.BULK_IMPORT, version: V1 })
export class BulkImportController {
  constructor(private readonly bulkImport: BulkImportService) {}

  @Get('types')
  @ApiOperation({ summary: 'Upload types, their columns and limits' })
  types() {
    return this.bulkImport.types();
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Upload history (newest first)' })
  list(
    @Query('type') type?: string,
    @Query('mine') mine?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bulkImport.list({ type, mine: mine === 'true', page: Number(page) || 1, limit: Number(limit) || 20 });
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Job status, progress and summary' })
  job(@Param('jobId') jobId: string) {
    return this.bulkImport.get(jobId);
  }

  @Get('jobs/:jobId/result')
  @ApiOperation({ summary: 'Download the result file (Status + Remark per row)' })
  async result(@Param('jobId') jobId: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.bulkImport.file(jobId, 'result');
    attachment(res, file.fileName, file.mimeType);
    return new StreamableFile(file.stream);
  }

  @Get('jobs/:jobId/file')
  @ApiOperation({ summary: 'Download the original uploaded file' })
  async input(@Param('jobId') jobId: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.bulkImport.file(jobId, 'input');
    attachment(res, file.fileName, file.mimeType);
    return new StreamableFile(file.stream);
  }

  @Get(':type/template')
  @ApiOperation({ summary: 'Download the upload template' })
  async template(@Param('type') type: string, @Query() options: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const file = await this.bulkImport.template(type, options);
    attachment(res, file.fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return new StreamableFile(file.buffer);
  }

  @Post(':type')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_MB * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, entity: { type: 'string' } } } })
  @ApiOperation({ summary: 'Upload a file; returns the job to poll' })
  start(@Param('type') type: string, @UploadedFile() file: Express.Multer.File, @Query() query: Record<string, string>) {
    return this.bulkImport.start(type, file, query);
  }
}
