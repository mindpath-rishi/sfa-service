import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequestContextStore } from 'src/core/context/request-context';

import { SyncDownloadDto, SyncUploadDto } from './dto/sync.dto';
import { SyncService } from './sync.service';

@ApiTags('Sync')
@Controller({ path: 'sync', version: '1' })
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('upload')
  async upload(@Body() body: SyncUploadDto) {
    const user = this.salesman();
    await this.assertOfflineAccess(user.id);
    return this.syncService.upload(body.operations, user.id);
  }

  @Get('download')
  async download(@Query() query: SyncDownloadDto) {
    const user = this.salesman();
    await this.assertOfflineAccess(user.id);
    return this.syncService.download(
      user.id,
      query.lastSync,
      query.cursor,
      user.vanId,
    );
  }

  private salesman() {
    const context = RequestContextStore.getStore();
    const id = context?.userId;
    if (!id) throw new UnauthorizedException();

    const roles = [context.role, context.roleId].map((value) =>
      String(value ?? '')
        .trim()
        .toUpperCase(),
    );
    if (!roles.some((role) => ['SALESMAN', 'SALES', 'SALES_EXECUTIVE'].includes(role))) {
      throw new ForbiddenException(
        'Offline synchronization is available only to SALESMAN',
      );
    }
    return { id, vanId: context.vanId };
  }

  private async assertOfflineAccess(employeeId: string) {
    if (!(await this.syncService.hasOfflineAccess(employeeId))) {
      throw new ForbiddenException(
        'Offline access has not been enabled for this salesman',
      );
    }
  }
}
