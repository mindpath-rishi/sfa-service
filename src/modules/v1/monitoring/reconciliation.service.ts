import { HttpStatus, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { FeatureDebugService } from '../feature-debug/feature-debug.service';

export const RECONCILIATION = 'reconciliation_reports';
const MAX_FINDINGS = 1_000;

/**
 * Nightly run of every feature check over the previous day, kept so trends
 * are visible: a count that grows night after night is a bug, not noise.
 */
@Injectable()
export class ReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly featureDebug: FeatureDebugService,
  ) {}

  private get reports() {
    return this.connection.collection(RECONCILIATION);
  }

  async onModuleInit() {
    await this.reports
      .createIndex({ startedAt: -1 })
      .catch((error) => this.logger.warn(`Reconciliation index: ${error?.message}`));
  }

  async run(trigger: 'schedule' | 'manual' = 'schedule', days = 1) {
    const startedAt = new Date();
    const scan = await this.featureDebug.scan(undefined, days);
    const features = scan.data.features.map((feature) => ({
      feature: feature.feature,
      label: feature.label,
      failures: feature.failures,
      warnings: feature.warnings,
      error: feature.error,
      problems: feature.findings.reduce<Record<string, number>>((counts, finding) => {
        counts[finding.problem] = (counts[finding.problem] ?? 0) + 1;
        return counts;
      }, {}),
    }));
    const findings = scan.data.features
      .flatMap((feature) => feature.findings.map((finding) => ({ feature: feature.feature, ...finding })))
      .slice(0, MAX_FINDINGS);

    const report = {
      reportId: IdGenerator.generate('RECO', 10),
      trigger,
      days,
      startedAt,
      finishedAt: new Date(),
      tookMs: Date.now() - startedAt.getTime(),
      totals: {
        failures: features.reduce((sum, feature) => sum + feature.failures, 0),
        warnings: features.reduce((sum, feature) => sum + feature.warnings, 0),
      },
      features,
      findings,
    };
    await this.reports.insertOne(report);
    this.logger.log(`Reconciliation ${report.reportId}: ${report.totals.failures} failures, ${report.totals.warnings} warnings (${report.tookMs} ms)`);
    return report;
  }

  async list(days = 30) {
    const since = new Date(Date.now() - days * 86400_000);
    const items = await this.reports
      .find({ startedAt: { $gte: since } }, { projection: { findings: 0 } })
      .sort({ startedAt: -1 })
      .toArray();
    return { statusCode: HttpStatus.OK, message: 'Reconciliation reports fetched', data: items };
  }

  async get(reportId: string) {
    const report = await this.reports.findOne({ reportId });
    if (!report) throw new NotFoundException('Report not found');
    return { statusCode: HttpStatus.OK, message: 'Reconciliation report fetched', data: report };
  }
}
