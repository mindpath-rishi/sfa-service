import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { SyncService } from '../sync/sync.service';

const MAX_PAGES = 100; // 500 records per page → up to 50,000 records
const MAX_ROWS = 200;

/**
 * "What does this salesman's phone get?" — runs the same full download the
 * app runs on first sync and summarises it, so missing outlets, prices or
 * schemes can be explained without the phone.
 */
@Injectable()
export class SyncPreviewService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly syncService: SyncService,
  ) {}

  async preview(employeeId: string, entity?: string, search?: string) {
    const position = await this.connection
      .collection('position_master')
      .findOne(
        { employeeId, isDeleted: { $ne: true } },
        {
          sort: { updatedAt: -1 },
          projection: { vanIds: 1, roleId: 1, offlineAccessAllowed: 1 },
        },
      );
    if (!position)
      throw new BadRequestException(
        `${employeeId} has no position, so the phone gets no data`,
      );
    const vanId = (position.vanIds ?? [])[0];

    const counts: Record<string, { total: number; deleted: number }> = {};
    const rows: Record<string, unknown>[] = [];
    const needle = search?.trim().toLowerCase();
    let cursor: string | undefined;
    let pages = 0;
    let truncated = false;

    do {
      const page = await this.syncService.download(
        employeeId,
        undefined,
        cursor,
        vanId,
      );
      for (const record of page.records) {
        const entry = (counts[record.entity] ??= { total: 0, deleted: 0 });
        entry.total += 1;
        if (record.deletedAt) entry.deleted += 1;

        if (entity && record.entity === entity && rows.length < MAX_ROWS) {
          if (
            !needle ||
            JSON.stringify(record.payload).toLowerCase().includes(needle)
          ) {
            rows.push({
              uuid: record.uuid,
              updatedAt: record.updatedAt,
              deletedAt: record.deletedAt,
              ...record.payload,
            });
          }
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
      pages += 1;
      if (pages >= MAX_PAGES && cursor) {
        truncated = true;
        break;
      }
    } while (cursor);

    return {
      statusCode: HttpStatus.OK,
      message: 'Phone data preview',
      data: {
        employeeId,
        vanId: vanId ?? null,
        offlineAccessAllowed: position.offlineAccessAllowed === true,
        truncated,
        entities: Object.entries(counts)
          .map(([name, count]) => ({ entity: name, ...count }))
          .sort((a, b) => a.entity.localeCompare(b.entity)),
        entity: entity ?? null,
        rows,
      },
    };
  }
}
