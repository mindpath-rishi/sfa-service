import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Db } from 'mongodb';
import { Connection } from 'mongoose';
import type {
  DebugFinding,
  FeatureInspector,
  InspectInput,
} from './feature-debug.types';
import { dayInspector } from './inspectors/day.inspector';
import { paymentInspector } from './inspectors/payment.inspector';
import { salesInspector } from './inspectors/sales.inspector';
import { salesmanInspector } from './inspectors/salesman.inspector';
import { syncInspector } from './inspectors/sync.inspector';
import { topupInspector } from './inspectors/topup.inspector';
import { vanStockInspector } from './inspectors/van-stock.inspector';

const INSPECTORS: FeatureInspector[] = [
  salesInspector,
  dayInspector,
  syncInspector,
  salesmanInspector,
  vanStockInspector,
  topupInspector,
  paymentInspector,
];

/** Read-only, feature-by-feature health checks for Super Admin. */
@Injectable()
export class FeatureDebugService {
  private readonly logger = new Logger(FeatureDebugService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  private get db(): Db {
    return this.connection.db as unknown as Db;
  }

  features() {
    return {
      statusCode: HttpStatus.OK,
      message: 'Debuggable features',
      data: INSPECTORS.map(
        ({ key, label, description, idLabel, idPlaceholder, acceptsDate }) => ({
          key,
          label,
          description,
          idLabel,
          idPlaceholder,
          acceptsDate: Boolean(acceptsDate),
        }),
      ),
    };
  }

  async inspect(feature: string, input: InspectInput) {
    const inspector = this.get(feature);
    const report = await inspector.inspect(this.db, {
      id: input.id.trim(),
      date: input.date,
    });
    return {
      statusCode: HttpStatus.OK,
      message: 'Inspection complete',
      data: report,
    };
  }

  /** Runs every feature's scan (or one), isolating failures per feature. */
  async scan(feature: string | undefined, days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const inspectors =
      feature && feature !== 'all' ? [this.get(feature)] : INSPECTORS;

    const results = await Promise.all(
      inspectors.map(async (inspector) => {
        const started = Date.now();
        let findings: DebugFinding[] = [];
        let error: string | undefined;
        try {
          findings = await inspector.scan(this.db, since);
        } catch (caught) {
          error = caught instanceof Error ? caught.message : String(caught);
          this.logger.error(
            `Scan of ${inspector.key} failed`,
            caught instanceof Error ? caught.stack : error,
          );
        }
        return {
          feature: inspector.key,
          label: inspector.label,
          tookMs: Date.now() - started,
          error,
          failures: findings.filter((finding) => finding.severity === 'FAIL')
            .length,
          warnings: findings.filter((finding) => finding.severity === 'WARN')
            .length,
          findings: findings.sort((a, b) =>
            a.severity === b.severity ? 0 : a.severity === 'FAIL' ? -1 : 1,
          ),
        };
      }),
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Scan complete',
      data: { days, since, features: results },
    };
  }

  private get(feature: string) {
    const inspector = INSPECTORS.find((entry) => entry.key === feature);
    if (!inspector) throw new NotFoundException(`Unknown feature "${feature}"`);
    return inspector;
  }
}
