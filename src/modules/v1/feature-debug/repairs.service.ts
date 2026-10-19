import { BadRequestException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
import { repairsTotal } from 'src/core/metrics/app-metrics';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { DiagnosticsService } from '../diagnostics/diagnostics.service';
import { SaleService } from '../sale/sale.service';
import { VanInventoryTopupService } from '../van-inventory-topup/van-inventory-topup.service';
import type { RepairAction } from './feature-debug.types';
import { startOfDay } from './inspectors/shared';

export const REPAIR_LOGS = 'debug_repair_logs';

/**
 * Fixes for problems the Feature Debugger finds. Every run needs a reason
 * and is recorded (who, what, why, result) in debug_repair_logs.
 */
@Injectable()
export class RepairsService {
  private readonly logger = new Logger(RepairsService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly saleService: SaleService,
    private readonly topupService: VanInventoryTopupService,
    private readonly diagnostics: DiagnosticsService,
  ) {}

  private col(name: string) {
    return this.connection.collection(name);
  }

  async run(action: RepairAction, id: string, reason: string) {
    const context = RequestContextStore.getStore();
    const by = { employeeId: context?.userId, name: context?.name };
    const repairId = IdGenerator.generate('REPR', 10);
    const startedAt = new Date();

    try {
      const result = await this.execute(action, id.trim(), by);
      await this.col(REPAIR_LOGS).insertOne({ repairId, action, targetId: id, reason, by, startedAt, result, status: 'DONE' });
      repairsTotal.labels(action, 'done').inc();
      this.logger.log(`Repair ${action} on ${id} by ${by.employeeId}: ${JSON.stringify(result)} — ${reason}`);
      return { statusCode: HttpStatus.OK, message: 'Repair done', data: { repairId, action, id, result } };
    } catch (error) {
      const message = (error as Error)?.message ?? String(error);
      await this.col(REPAIR_LOGS).insertOne({ repairId, action, targetId: id, reason, by, startedAt, error: message, status: 'FAILED' });
      repairsTotal.labels(action, 'failed').inc();
      this.logger.warn(`Repair ${action} on ${id} by ${by.employeeId} failed: ${message}`);
      throw error;
    }
  }

  async history(targetId?: string) {
    const rows = await this.col(REPAIR_LOGS)
      .find(targetId ? { targetId } : {}, { projection: { _id: 0 } })
      .sort({ startedAt: -1 })
      .limit(100)
      .toArray();
    return { statusCode: HttpStatus.OK, message: 'Repair history', data: rows };
  }

  private async execute(action: RepairAction, id: string, by: Record<string, unknown>) {
    switch (action) {
      case 'END_DAY':
        return this.endDay(id, by);
      case 'CLOSE_ARRIVALS':
        return this.closeArrivals({ employeeId: id });
      case 'REVERSE_DUPLICATE_DEDUCTION':
        return this.reverseDuplicateDeduction(id, by);
      case 'RETRY_ERP_SALE':
        return this.saleService.retrySaleToERP(id);
      case 'RETRY_ERP_TOPUPS': {
        const response: any = await this.topupService.syncTopupRequestsToERP();
        return response?.data ?? response;
      }
      case 'FORCE_RESYNC':
      case 'REQUEST_DIAGNOSTICS':
      case 'LOGOUT_DEVICES': {
        const command = action === 'FORCE_RESYNC' ? 'FORCE_RESYNC' : action === 'LOGOUT_DEVICES' ? 'LOGOUT' : 'SEND_DIAGNOSTICS';
        const response = await this.diagnostics.createCommand({ userId: id, command });
        return { commandId: response.data.commandId, command };
      }
      case 'DEBUG_LOGGING': {
        const response = await this.diagnostics.enableDebugLogging({ userId: id, minutes: 60 });
        return response.data;
      }
      default:
        throw new BadRequestException(`Unknown repair action ${action as string}`);
    }
  }

  /* ==================== ACTIONS ==================== */

  private async endDay(workSessionId: string, by: Record<string, unknown>) {
    const session = await this.col('work_sessions').findOne({ workSessionId });
    if (!session) throw new NotFoundException(`Work session ${workSessionId} not found`);
    if (session.status === 'COMPLETED') throw new BadRequestException('This day is already ended');

    const now = new Date();
    // Bumping version + updatedAt makes phones download the change.
    await this.col('work_sessions').updateOne(
      { _id: session._id },
      { $set: { status: 'COMPLETED', dayEndTime: now, endedBy: { ...by, source: 'ADMIN_REPAIR' }, updatedAt: now }, $inc: { version: 1 } },
    );
    const routes = await this.col('route_sessions').updateMany(
      { workSessionId, status: 'ACTIVE' },
      { $set: { status: 'COMPLETED', isActive: false, endTime: now, updatedAt: now }, $inc: { version: 1 } },
    );
    const arrivals = await this.closeArrivals({ workSessionId });
    return { workSessionId, routesCompleted: routes.modifiedCount, ...arrivals };
  }

  private async closeArrivals(filter: Record<string, unknown>) {
    const now = new Date();
    const result = await this.col('interaction_logs').updateMany(
      { ...filter, status: 'ARRIVED' },
      { $set: { status: 'ABANDONED', abandonedAt: now, abandonReason: 'TIMEOUT', updatedAt: now }, $inc: { version: 1 } },
    );
    return { arrivalsClosed: result.modifiedCount };
  }

  private async reverseDuplicateDeduction(saleId: string, by: Record<string, unknown>) {
    const transactions = await this.col('inventory_transactions')
      .find({ referenceNo: saleId, transactionType: 'SALE', status: 'POSTED', isDeleted: { $ne: true } })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();

    const byProduct = new Map<string, typeof transactions>();
    for (const tx of transactions) byProduct.set(String(tx.productId), [...(byProduct.get(String(tx.productId)) ?? []), tx]);

    const reversed: { productId: string; quantity: number; transactionId: string }[] = [];
    const now = new Date();
    for (const [productId, rows] of byProduct) {
      for (const extra of rows.slice(1)) {
        const quantity = Number(extra.quantity ?? 0);
        // Mark first: if anything below fails, a re-run will not reverse it twice.
        const marked = await this.col('inventory_transactions').updateOne(
          { _id: extra._id, status: 'POSTED' },
          { $set: { status: 'REVERSED', reversedAt: now, reversedBy: by, remark: `${extra.remark ?? ''} [reversed: duplicate deduction]`.trim(), updatedAt: now } },
        );
        if (!marked.modifiedCount) continue;

        await this.col('inventories').updateOne(
          { vanId: extra.vanId, productId: extra.productId, isDeleted: { $ne: true } },
          { $inc: { quantity }, $set: { updatedAt: now } },
        );
        const day = startOfDay(extra.transactionDate ?? extra.createdAt);
        await this.col('van_daily_stock').updateOne(
          { vanId: extra.vanId, productId: extra.productId, date: { $gte: day, $lt: new Date(day.getTime() + 86400_000) }, isDeleted: { $ne: true } },
          { $inc: { outQty: -quantity, closingQty: quantity }, $set: { updatedAt: now } },
        );
        reversed.push({ productId, quantity, transactionId: String(extra.transactionId) });
      }
    }

    if (!reversed.length) throw new BadRequestException('No duplicate deduction found for this sale');
    return { saleId, reversed };
  }
}
