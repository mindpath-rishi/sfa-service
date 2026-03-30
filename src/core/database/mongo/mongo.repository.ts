import {
  Model,
  ClientSession,
  UpdateQuery,
  ProjectionType,
  HydratedDocument,
} from 'mongoose';
import {
  PaginatedResult,
  PaginationOptions,
  RepoOptions,
} from 'src/shared/interfaces/mongo-repository.interface';
import { FilterQuery, SoftDelete } from './mongo.interface';

/**
 * Safe replacement for removed mongoose FilterQuery
 */

type Doc<T> = HydratedDocument<T & SoftDelete>;

/* ======================================================
 * ADVANCED BASE MONGO REPOSITORY
 * ====================================================== */

export abstract class MongoRepository<T> {
  protected constructor(protected readonly model: Model<Doc<T>>) {}

  /* ======================================================
   * CREATE
   * ====================================================== */

  async save(data: Partial<T>, options?: RepoOptions): Promise<Doc<T>> {
    const doc = new this.model(data);
    await doc.save({ session: options?.session });
    return doc;
  }

  async bulkCreate(
    data: Partial<T>[],
    options?: RepoOptions,
  ): Promise<Doc<T>[]> {
    return this.model.insertMany(data, {
      session: options?.session,
    }) as unknown as Promise<Doc<T>[]>;
  }

  /* ======================================================
   * READ
   * ====================================================== */

  async findOne(
    filter: FilterQuery<T>,
    options?: RepoOptions,
  ): Promise<Doc<T> | null> {
    return this.model
      .findOne(this.applySoftDelete(filter, options))
      .setOptions(options ?? {})
      .exec();
  }

  async findOneWithSelect(
    filter: FilterQuery<T>,
    select: ProjectionType<T>,
    options?: RepoOptions,
  ): Promise<Doc<T> | null> {
    return this.model
      .findOne(this.applySoftDelete(filter, options))
      .select(select)
      .setOptions(options ?? {})
      .exec();
  }

  async findById(id: string, options?: RepoOptions): Promise<Doc<T> | null> {
    return this.model
      .findById(id)
      .setOptions(options ?? {})
      .exec();
  }

  async find(
    filter: FilterQuery<T> = {},
    options?: RepoOptions,
  ): Promise<Doc<T>[]> {
    const query = this.model
      .find(this.applySoftDelete(filter, options))
      .setOptions(options ?? {});

    if (options?.sort) query.sort(options.sort);

    return query.exec();
  }

  async findLean(
    filter: FilterQuery<T> = {},
    options?: RepoOptions,
  ): Promise<Partial<T>[]> {
    return this.model
      .find(this.applySoftDelete(filter, options))
      .setOptions(options ?? {})
      .lean()
      .exec();
  }

  async exists(
    filter: FilterQuery<T>,
    options?: RepoOptions,
  ): Promise<boolean> {
    return Boolean(
      await this.model.exists(this.applySoftDelete(filter, options)),
    );
  }

  /* ======================================================
   * PAGINATION
   * ====================================================== */

  async paginate(
    filter: FilterQuery<T>,
    options: PaginationOptions & RepoOptions,
  ): Promise<PaginatedResult<Doc<T>>> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, options.limit ?? 10);
    const skip = (page - 1) * limit;

    const query = this.applySoftDelete(filter, options);

    const [items, total] = await Promise.all([
      this.model.find(query).sort(options.sort).skip(skip).limit(limit).exec(),
      this.model.countDocuments(query),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /* ======================================================
   * UPDATE
   * ====================================================== */

  async updateOne(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: RepoOptions,
  ): Promise<boolean> {
    const res = await this.model.updateOne(
      this.applySoftDelete(filter, options),
      update as any,
      { session: options?.session },
    );

    return res.modifiedCount > 0;
  }

  async updateById(
    id: string,
    update: UpdateQuery<T>,
    options?: RepoOptions,
  ): Promise<boolean> {
    const res = await this.model.updateOne({ _id: id } as any, update as any, {
      session: options?.session,
    });

    return res.modifiedCount > 0;
  }

  async upsert(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: RepoOptions,
  ): Promise<Doc<T> | null> {
    return this.model.findOneAndUpdate(filter as any, update as any, {
      upsert: true,
      new: true,
      ...options,
    });
  }

  /* ======================================================
   * DELETE (SOFT + HARD)
   * ====================================================== */

  async softDelete(
    filter: FilterQuery<T>,
    options?: RepoOptions,
  ): Promise<boolean> {
    const res = await this.model.updateOne(
      filter,
      { isDeleted: true },
      { session: options?.session },
    );

    return res.modifiedCount > 0;
  }

  async restore(
    filter: FilterQuery<T>,
    options?: RepoOptions,
  ): Promise<boolean> {
    const res = await this.model.updateOne(
      { ...filter, isDeleted: true } as any,
      { isDeleted: false, deletedAt: null },
      { session: options?.session },
    );

    return res.modifiedCount > 0;
  }

  async deleteById(id: string, options?: RepoOptions): Promise<boolean> {
    const res = await this.model.deleteOne({ _id: id } as any, {
      session: options?.session,
    });

    return res.deletedCount === 1;
  }

  /* ======================================================
   * TRANSACTIONS
   * ====================================================== */

 async withTransaction<R>(
  fn: (session: ClientSession) => Promise<R>,
  existingSession?: ClientSession,
): Promise<R> {
  const session = existingSession || (await this.model.db.startSession());

  const isNewSession = !existingSession;

  if (isNewSession) {
    session.startTransaction();
  }

  try {
    const result = await fn(session);

    if (isNewSession) {
      await session.commitTransaction();
    }

    return result;
  } catch (e) {
    if (isNewSession) {
      await session.abortTransaction();
    }
    throw e;
  } finally {
    if (isNewSession) {
      session.endSession();
    }
  }
}

  /* ======================================================
   * INTERNAL
   * ====================================================== */

  private applySoftDelete(
    filter: FilterQuery<T>,
    options?: RepoOptions,
  ): FilterQuery<T> {
    if (options?.includeDeleted) return filter;
    return { ...filter, isDeleted: false };
  }

  /* ======================================================
   * UPDATE MANY
   * ====================================================== */

  async updateMany(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: RepoOptions,
  ): Promise<number> {
    const res = await this.model.updateMany(
      this.applySoftDelete(filter, options),
      update as any,
      { session: options?.session },
    );

    return res.modifiedCount ?? 0;
  }

  /* ======================================================
   * BULK UPDATE
   * ====================================================== */

  async bulkUpdate(
    operations: {
      filter: FilterQuery<T>;
      update: UpdateQuery<T>;
    }[],
    options?: RepoOptions,
  ): Promise<number> {
    if (!operations.length) return 0;

    const bulkOps = operations.map((op) => ({
      updateOne: {
        filter: this.applySoftDelete(op.filter, options) as any,
        update: op.update as any,
      },
    }));

    const res = await this.model.bulkWrite(bulkOps as any, {
      session: options?.session,
    });

    return res.modifiedCount ?? 0;
  }

  async countDocuments(filter: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(this.applySoftDelete(filter));
  }

  async deleteDocument(
    filter: FilterQuery<T> = {} as any,
  ): Promise<Doc<T> | null> {
    return this.model.findOneAndDelete(filter);
  }
}
