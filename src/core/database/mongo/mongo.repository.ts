import {
  Model,
  ClientSession,
  UpdateQuery,
  QueryOptions,
  ProjectionType,
} from 'mongoose';
import {
  PaginatedResult,
  PaginationOptions,
  RepoOptions,
} from 'src/shared/interfaces/mongo-repository.interface';

/**
 * Safe replacement for removed mongoose FilterQuery
 */
export type FilterQuery<T> = Partial<T> & Record<string, any>;

/* ======================================================
 * ADVANCED BASE MONGO REPOSITORY
 * ====================================================== */

export abstract class MongoRepository<T> {
  protected constructor(protected readonly model: Model<T>) {}

  /* ======================================================
   * CREATE
   * ====================================================== */

  async save(data: Partial<T>, options?: RepoOptions): Promise<T> {
    const doc = new this.model(data);
    await doc.save({ session: options?.session });
    return doc;
  }

  async bulkCreate(data: Partial<T>[], options?: RepoOptions): Promise<T[]> {
    return this.model.insertMany(data, {
      session: options?.session,
    }) as Promise<T[]>;
  }

  /* ======================================================
   * READ
   * ====================================================== */

  async findOne(
    filter: FilterQuery<T>,
    options?: RepoOptions,
  ): Promise<T | null> {
    return this.model
      .findOne(this.applySoftDelete(filter, options))
      .setOptions(options ?? {})
      .exec();
  }

  async findOneWithSelect(
    filter: FilterQuery<T>,
    select: ProjectionType<T>,
    options?: RepoOptions,
  ): Promise<T | null> {
    return this.model
      .findOne(this.applySoftDelete(filter, options))
      .select(select)
      .setOptions(options ?? {})
      .exec();
  }

  async findById(id: string, options?: RepoOptions): Promise<T | null> {
    return this.model
      .findById(id)
      .setOptions(options ?? {})
      .exec();
  }

  async find(filter: FilterQuery<T> = {}, options?: RepoOptions): Promise<T[]> {
    const query = this.model
      .find(this.applySoftDelete(filter, options))
      .setOptions(options ?? {});

    if (options?.sort) {
      query.sort(options.sort);
    }

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
    return Boolean(await this.model.exists(filter).setOptions(options ?? {}));
  }

  /* ======================================================
   * PAGINATION
   * ====================================================== */

  async paginate(
    filter: FilterQuery<T>,
    options: PaginationOptions & RepoOptions,
  ): Promise<PaginatedResult<T>> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, options.limit ?? 10);
    const skip = (page - 1) * limit;

    const query = this.applySoftDelete(filter, options);

    const [items, total] = await Promise.all([
      this.model
        .find(query)
        .sort(options.sort)
        .skip(skip)
        .limit(limit)
        .setOptions(options ?? {})
        .exec(),
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
      update,
      { session: options?.session } as any,
    );

    return !!res && res.modifiedCount > 0;
  }

  async updateById(
    id: string,
    update: UpdateQuery<T>,
    options?: RepoOptions,
  ): Promise<boolean> {
    const res = await this.model.updateOne({ _id: id } as any, update, {
      session: options?.session,
    });

    return !!res && res.modifiedCount > 0;
  }

  async upsert(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: RepoOptions,
  ): Promise<T | null> {
    return this.model.findOneAndUpdate(filter, update, {
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
      {
        isDeleted: true,
        deletedAt: new Date(),
      } as any,
      { session: options?.session } as any,
    );

    return !!res && res.modifiedCount > 0;
  }

  async restore(
    filter: FilterQuery<T>,
    options?: RepoOptions,
  ): Promise<boolean> {
    const res = await this.model.updateOne(
      { ...filter, isDeleted: true } as any,
      {
        isDeleted: false,
        deletedAt: null,
      } as any,
      { session: options?.session } as any,
    );

    return !!res && res.modifiedCount > 0;
  }

  async deleteById(id: string, options?: RepoOptions): Promise<boolean> {
    const res = await this.model.deleteOne({ _id: id } as any, {
      session: options?.session,
    });

    return !!res && res.deletedCount === 1;
  }

  /* ======================================================
   * TRANSACTIONS
   * ====================================================== */

  async withTransaction<R>(
    fn: (session: ClientSession) => Promise<R>,
  ): Promise<R> {
    const session = await this.model.db.startSession();
    session.startTransaction();

    try {
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
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
    return {
      ...filter,
      isDeleted: false,
    };
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
      update,
      { session: options?.session } as any,
    );

    return res?.modifiedCount ?? 0;
  }

  /* ======================================================
   * BULK UPDATE (DIFFERENT UPDATES)
   * ====================================================== */

  async bulkUpdate(
    operations: {
      filter: FilterQuery<T>;
      update: UpdateQuery<T>;
    }[],
    options?: RepoOptions,
  ): Promise<number> {
    if (!operations.length) return 0;

    const bulkOps: any = operations.map((op) => ({
      updateOne: {
        filter: this.applySoftDelete(op.filter, options),
        update: op.update,
      },
    }));

    const res = await this.model.bulkWrite(bulkOps, {
      session: options?.session,
    });

    return res.modifiedCount ?? 0;
  }

  async countDocuments(
    filter: FilterQuery<T> = {},
    options?: RepoOptions,
  ): Promise<number> {
    return this.model
      .countDocuments(this.applySoftDelete(filter, options))
      .setOptions(options ?? {})
      .exec();
  }

  async deleteDocument(filter: FilterQuery<T> = {} as any): Promise<T | null> {
    return this.model.findOneAndDelete(filter).lean();
  }
}
