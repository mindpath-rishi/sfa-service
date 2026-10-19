import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { GridFSBucket, ObjectId, type Db } from 'mongodb';
import { Connection } from 'mongoose';
import { RequestContextStore, type RequestContext } from 'src/core/context/request-context';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { CustomerService } from '../customer/customer.service';
import { EmployeeService } from '../employee/employee.service';
import { MasterBulkService } from '../master-bulk/master-bulk.service';
import { ProductService } from '../product/product.service';
import { RouteService } from '../route/route.service';
import { TargetService } from '../target/target.service';
import { SUCCESS_STATUSES, type ImportContext, type ImportDefinition, type RowOutcome } from './bulk-import.types';
import { employeesDefinition } from './definitions/employees.definition';
import { focusedPacksDefinition } from './definitions/focused-packs.definition';
import { mastersDefinition } from './definitions/masters.definition';
import { outletsDefinition } from './definitions/outlets.definition';
import { routesDefinition } from './definitions/routes.definition';
import { focusedPackTargetsDefinition, targetsDefinition } from './definitions/targets.definition';
import { buildResultWorkbook } from './result-workbook';
import { readSheet, requireHeaders, validateItem } from './sheet.utils';

export const JOBS = 'bulk_import_jobs';
const BUCKET = 'bulk_import_files';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const RETENTION_DAYS = Math.max(1, Number(process.env.BULK_IMPORT_RETENTION_DAYS) || 30);
/** A job not touched for this long was cut off by a restart. */
const STALE_AFTER_MS = 15 * 60_000;

type JobStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Every MIS bulk upload runs here: the file is read and validated on the
 * server, processed in the background through the module's own bulk logic,
 * and returned as a result workbook with Status and Remark on every row.
 */
@Injectable()
export class BulkImportService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BulkImportService.name);
  private readonly definitions: Map<string, ImportDefinition<any>>;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    customers: CustomerService,
    employees: EmployeeService,
    routes: RouteService,
    targets: TargetService,
    products: ProductService,
    masters: MasterBulkService,
  ) {
    const list = [
      outletsDefinition(customers),
      employeesDefinition(employees),
      routesDefinition(routes),
      mastersDefinition(masters),
      focusedPacksDefinition(products),
      targetsDefinition(targets),
      focusedPackTargetsDefinition(targets),
    ];
    this.definitions = new Map(list.map((definition) => [definition.type, definition]));
  }

  private get db(): Db {
    return this.connection.db as unknown as Db;
  }

  private get jobs() {
    return this.db.collection(JOBS);
  }

  private get bucket() {
    return new GridFSBucket(this.db, { bucketName: BUCKET });
  }

  async onModuleInit() {
    await Promise.all([
      this.jobs.createIndex({ jobId: 1 }, { unique: true }),
      this.jobs.createIndex({ type: 1, createdAt: -1 }),
      this.jobs.createIndex({ 'createdBy.employeeId': 1, createdAt: -1 }),
    ]).catch((error) => this.logger.warn(`Bulk import indexes: ${error?.message}`));

    // Jobs cut off by a restart would otherwise spin forever in MIS.
    const interrupted = await this.jobs
      .updateMany(
        { status: { $in: ['QUEUED', 'PROCESSING'] }, updatedAt: { $lt: new Date(Date.now() - STALE_AFTER_MS) } },
        { $set: { status: 'FAILED', error: 'Interrupted by a server restart. Upload the file again.', finishedAt: new Date(), updatedAt: new Date() } },
      )
      .catch(() => null);
    if (interrupted?.modifiedCount) this.logger.warn(`Marked ${interrupted.modifiedCount} interrupted bulk import job(s) as failed`);

    this.cleanupTimer = setInterval(() => void this.cleanup(), 6 * 3600_000);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  /* ==================== API ==================== */

  types() {
    return {
      statusCode: HttpStatus.OK,
      message: 'Bulk import types',
      data: [...this.definitions.values()].map((definition) => ({
        type: definition.type,
        label: definition.label,
        description: definition.description,
        requiredHeaders: definition.requiredHeaders,
        optionalHeaders: definition.optionalHeaders,
        limit: definition.limit,
        options: definition.options ?? [],
      })),
    };
  }

  async template(type: string, options: Record<string, string | undefined>) {
    const definition = this.definition(type);
    return definition.template(this.context(options));
  }

  /** Stores the file, creates the job and starts it in the background. */
  async start(type: string, file: Express.Multer.File | undefined, options: Record<string, string | undefined>) {
    const definition = this.definition(type);
    if (!file?.buffer?.length) throw new BadRequestException('Attach the file to upload (field "file")');
    if (!/\.(xlsx|csv)$/i.test(file.originalname)) throw new BadRequestException('Upload an .xlsx or .csv file');
    for (const option of definition.options ?? []) {
      if (option.required && !options[option.key]) throw new BadRequestException(`${option.label} (${option.key}) is required`);
    }

    // Read once now so a wrong file fails immediately, not as a job.
    const sheet = await readSheet(file.buffer, file.originalname);
    requireHeaders(sheet, definition.requiredHeaders);
    if (!sheet.rows.length) throw new BadRequestException('The file has no data rows');

    const context = RequestContextStore.getStore();
    const now = new Date();
    const jobId = IdGenerator.generate('BULK', 10);
    const inputFileId = await this.saveFile(file.buffer, file.originalname, file.mimetype || XLSX, { jobId, kind: 'input' });
    const job = {
      jobId,
      type,
      label: definition.label + (options.entity ? ` · ${options.entity}` : ''),
      options,
      fileName: file.originalname,
      fileSize: file.size,
      status: 'QUEUED' as JobStatus,
      progress: { processed: 0, total: 0 },
      summary: null as Record<string, number> | null,
      inputFileId,
      createdBy: { employeeId: context?.userId, name: context?.name, role: context?.role },
      createdAt: now,
      updatedAt: now,
    };
    await this.jobs.insertOne(job);

    // Run inside the uploader's context: services read the current user
    // (e.g. "ACTIVE outlets are verified by the uploader").
    const snapshot: RequestContext = { ...(context ?? {}) };
    setImmediate(() => {
      void RequestContextStore.run(snapshot, () => this.run(jobId, definition, file.buffer, file.originalname, options));
    });

    this.logger.log(`Bulk import ${jobId} (${type}) queued: ${file.originalname}, ${sheet.rows.length} rows`);
    return { statusCode: HttpStatus.ACCEPTED, message: 'Upload received; processing started', data: this.publicJob(job) };
  }

  async list(query: { type?: string; mine?: boolean; page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = Math.min(100, query.limit ?? 20);
    const filter: Record<string, unknown> = {};
    if (query.type) filter.type = query.type;
    if (query.mine) filter['createdBy.employeeId'] = RequestContextStore.getStore()?.userId;
    const [items, total] = await Promise.all([
      this.jobs.find(filter, { projection: { _id: 0 } }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      this.jobs.countDocuments(filter),
    ]);
    return {
      statusCode: HttpStatus.OK,
      message: 'Bulk import jobs',
      data: items.map((item) => this.publicJob(item)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async get(jobId: string) {
    return { statusCode: HttpStatus.OK, message: 'Bulk import job', data: this.publicJob(await this.job(jobId)) };
  }

  /** The result workbook (Status + Remark per row) or the original upload. */
  async file(jobId: string, kind: 'result' | 'input') {
    const job = await this.job(jobId);
    const fileId = kind === 'result' ? job.resultFileId : job.inputFileId;
    if (!fileId) {
      throw new BadRequestException(kind === 'result' ? `No result file yet (job is ${job.status})` : 'Original file not kept');
    }
    const base = String(job.fileName).replace(/\.(xlsx|csv)$/i, '');
    return {
      stream: this.bucket.openDownloadStream(new ObjectId(String(fileId))),
      fileName: kind === 'result' ? `${base}-result.xlsx` : job.fileName,
      mimeType: kind === 'result' ? XLSX : String(job.fileName).toLowerCase().endsWith('.csv') ? 'text/csv' : XLSX,
    };
  }

  /* ==================== RUNNER ==================== */

  private async run(jobId: string, definition: ImportDefinition<any>, buffer: Buffer, fileName: string, options: Record<string, string | undefined>) {
    const startedAt = new Date();
    const ctx = this.context(options);
    try {
      await this.update(jobId, { status: 'PROCESSING', startedAt });
      const sheet = await readSheet(buffer, fileName);
      const units = await definition.parse(sheet, ctx);
      if (units.length > definition.limit) {
        throw new BadRequestException(`Maximum ${definition.limit.toLocaleString()} ${definition.label.toLowerCase()} per file (this file has ${units.length.toLocaleString()})`);
      }

      const outcomes = new Map<number, RowOutcome>();
      const apply = (rows: number[], outcome: RowOutcome) => rows.forEach((row) => outcomes.set(row, outcome));

      // 1. Row problems found while reading, then the module's DTO rules.
      const ready: { rows: number[]; payload: unknown }[] = [];
      for (const unit of units) {
        if (unit.errors.length || unit.payload === undefined) {
          apply(unit.rows, { status: 'FAILED', remark: unit.errors.join('; ') || 'Invalid row' });
          continue;
        }
        if (definition.itemDto) {
          const { instance, errors } = await validateItem(definition.itemDto, unit.payload);
          if (errors.length) {
            apply(unit.rows, { status: 'FAILED', remark: errors.join('; ') });
            continue;
          }
          ready.push({ rows: unit.rows, payload: instance });
        } else {
          ready.push({ rows: unit.rows, payload: unit.payload });
        }
      }

      const total = units.length;
      let processed = total - ready.length;
      await this.update(jobId, { progress: { processed, total } });

      // 2. Valid units through the module's bulk method, in batches.
      for (let offset = 0; offset < ready.length; offset += definition.batchSize) {
        const batch = ready.slice(offset, offset + definition.batchSize);
        let results: RowOutcome[];
        try {
          results = await definition.process(batch.map((item) => item.payload), ctx);
        } catch (error) {
          // One failing batch must not lose the rest of the file.
          const message = (error as any)?.response?.message ?? (error as Error)?.message ?? 'Batch failed';
          results = batch.map(() => ({ status: 'FAILED', remark: Array.isArray(message) ? message.join('; ') : String(message) }));
        }
        batch.forEach((item, index) => apply(item.rows, results[index] ?? { status: 'FAILED', remark: 'No result' }));
        processed += batch.length;
        await this.update(jobId, { progress: { processed, total } });
      }

      // 3. Result workbook + summary (counted per Excel row).
      const summary: Record<string, number> = { totalRows: sheet.rows.length };
      for (const row of sheet.rows) {
        const status = outcomes.get(row.rowNumber)?.status ?? 'FAILED';
        summary[status] = (summary[status] ?? 0) + 1;
      }
      summary.succeeded = sheet.rows.filter((row) => SUCCESS_STATUSES.has(outcomes.get(row.rowNumber)?.status ?? '')).length;
      summary.failed = sheet.rows.length - summary.succeeded;

      const finishedAt = new Date();
      const resultBuffer = await buildResultWorkbook({ sheet, outcomes, label: definition.label, fileName, summary, finishedAt });
      const resultFileId = await this.saveFile(resultBuffer, `${fileName}-result.xlsx`, XLSX, { jobId, kind: 'result' });

      await this.update(jobId, { status: 'COMPLETED', summary, resultFileId, finishedAt, tookMs: finishedAt.getTime() - startedAt.getTime() });
      this.logger.log(`Bulk import ${jobId} (${definition.type}) done: ${summary.succeeded} ok, ${summary.failed} failed of ${summary.totalRows} rows`);
    } catch (error) {
      const message = (error as any)?.response?.message ?? (error as Error)?.message ?? String(error);
      await this.update(jobId, { status: 'FAILED', error: Array.isArray(message) ? message.join('; ') : String(message), finishedAt: new Date() }).catch(() => null);
      this.logger.error(`Bulk import ${jobId} (${definition.type}) failed`, error instanceof Error ? error.stack : String(error));
    }
  }

  /* ==================== HELPERS ==================== */

  private definition(type: string) {
    const definition = this.definitions.get(type);
    if (!definition) throw new NotFoundException(`Unknown bulk import type "${type}". Use one of: ${[...this.definitions.keys()].join(', ')}`);
    return definition;
  }

  private context(options: Record<string, string | undefined>): ImportContext {
    return { db: this.db, options };
  }

  private async job(jobId: string) {
    const job = await this.jobs.findOne({ jobId }, { projection: { _id: 0 } });
    if (!job) throw new NotFoundException('Bulk import job not found');
    return job;
  }

  private update(jobId: string, set: Record<string, unknown>) {
    return this.jobs.updateOne({ jobId }, { $set: { ...set, updatedAt: new Date() } });
  }

  private publicJob(job: Record<string, any>) {
    const { inputFileId, resultFileId, _id, ...rest } = job;
    return { ...rest, hasResult: Boolean(resultFileId), hasInput: Boolean(inputFileId) };
  }

  private saveFile(buffer: Buffer, fileName: string, contentType: string, metadata: Record<string, unknown>) {
    return new Promise<string>((resolve, reject) => {
      const upload = this.bucket.openUploadStream(fileName, { metadata: { ...metadata, contentType } });
      upload.on('error', reject);
      upload.on('finish', () => resolve(String(upload.id)));
      upload.end(buffer);
    });
  }

  /** Jobs and their files older than BULK_IMPORT_RETENTION_DAYS (30). */
  private async cleanup() {
    try {
      const before = new Date(Date.now() - RETENTION_DAYS * 86400_000);
      const old = await this.jobs.find({ createdAt: { $lt: before } }, { projection: { jobId: 1, inputFileId: 1, resultFileId: 1 } }).limit(500).toArray();
      for (const job of old) {
        for (const id of [job.inputFileId, job.resultFileId].filter(Boolean)) {
          await this.bucket.delete(new ObjectId(String(id))).catch(() => null);
        }
        await this.jobs.deleteOne({ jobId: job.jobId });
      }
      if (old.length) this.logger.log(`Removed ${old.length} bulk import job(s) older than ${RETENTION_DAYS} days`);
    } catch (error) {
      this.logger.warn(`Bulk import cleanup failed: ${(error as Error).message}`);
    }
  }
}
