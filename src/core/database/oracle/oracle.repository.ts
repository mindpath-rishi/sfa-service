import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as oracledb from 'oracledb';
import { LoggerService } from 'src/core/logger/logger.service';
import { ORACLE_POOL } from './oracle.provider';

export interface OracleQueryOptions extends oracledb.ExecuteOptions {
  autoCommit?: boolean;
  maxRows?: number;
}

@Injectable()
export class OracleRepository {
  constructor(
    @Inject(ORACLE_POOL)
    private readonly pool: oracledb.Pool | null,

    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('OracleRepository');
  }

  /**
   * Check OracleDB availability.
   * Useful when Oracle DB is optional.
   */
  isEnabled(): boolean {
    return !!this.pool;
  }

  /**
   * Get raw Oracle connection from pool.
   * Use this only when you need custom transaction handling.
   */
  async getConnection(): Promise<oracledb.Connection> {
    try {
      if (!this.pool) {
        throw new ServiceUnavailableException(
          'OracleDB is disabled or Oracle connection pool is not available',
        );
      }

      return await this.pool.getConnection();
    } catch (error) {
      this.logger.error('Failed to get Oracle connection from pool', error);
      throw error;
    }
  }

  /**
   * Execute SELECT query and return rows.
   */
  async query<T = any>(
    sql: string,
    binds: oracledb.BindParameters = {},
    options: OracleQueryOptions = {},
  ): Promise<T[]> {
    let connection: oracledb.Connection | undefined;

    try {
      connection = await this.getConnection();

      const result = await connection.execute<T>(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: false,
        ...options,
      } as oracledb.ExecuteOptions);

      return (result.rows ?? []) as T[];
    } catch (error) {
      this.logger.error('Oracle query execution failed', {
        error,
        sql,
        binds,
      });

      throw error;
    } finally {
      await this.closeConnection(connection);
    }
  }

  /**
   * Execute INSERT / UPDATE / DELETE query.
   */
  async execute(
    sql: string,
    binds: oracledb.BindParameters = {},
    options: OracleQueryOptions = {},
  ): Promise<oracledb.Result<any>> {
    let connection: oracledb.Connection | undefined;

    try {
      connection = await this.getConnection();

      const result = await connection.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: options.autoCommit ?? true,
        ...options,
      } as oracledb.ExecuteOptions);

      return result;
    } catch (error) {
      this.logger.error('Oracle execute failed', {
        error,
        sql,
        binds,
      });

      throw error;
    } finally {
      await this.closeConnection(connection);
    }
  }

  /**
   * Execute single row SELECT query.
   */
  async findOne<T = any>(
    sql: string,
    binds: oracledb.BindParameters = {},
    options: OracleQueryOptions = {},
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, binds, {
      ...options,
      maxRows: 1,
    });

    return rows.length ? rows[0] : null;
  }

  /**
   * Insert and return affected rows count.
   */
  async insert(
    sql: string,
    binds: oracledb.BindParameters = {},
    options: OracleQueryOptions = {},
  ): Promise<number> {
    const result = await this.execute(sql, binds, {
      ...options,
      autoCommit: true,
    });

    return result.rowsAffected ?? 0;
  }

  /**
   * Update and return affected rows count.
   */
  async update(
    sql: string,
    binds: oracledb.BindParameters = {},
    options: OracleQueryOptions = {},
  ): Promise<number> {
    const result = await this.execute(sql, binds, {
      ...options,
      autoCommit: true,
    });

    return result.rowsAffected ?? 0;
  }

  /**
   * Delete and return affected rows count.
   */
  async delete(
    sql: string,
    binds: oracledb.BindParameters = {},
    options: OracleQueryOptions = {},
  ): Promise<number> {
    const result = await this.execute(sql, binds, {
      ...options,
      autoCommit: true,
    });

    return result.rowsAffected ?? 0;
  }

  /**
   * Execute many rows insert/update.
   */
  async executeMany<T = any>(
    sql: string,
    binds: T[],
    options: oracledb.ExecuteManyOptions = {},
  ): Promise<oracledb.Results<any>> {
    let connection: oracledb.Connection | undefined;

    try {
      connection = await this.getConnection();

      const result = await connection.executeMany(sql, binds, {
        autoCommit: true,
        ...options,
      });

      return result;
    } catch (error) {
      this.logger.error('Oracle executeMany failed', {
        error,
        sql,
      });

      throw error;
    } finally {
      await this.closeConnection(connection);
    }
  }

  /**
   * Run multiple queries in one transaction.
   */
  async transaction<T = any>(
    callback: (connection: oracledb.Connection) => Promise<T>,
  ): Promise<T> {
    let connection: oracledb.Connection | undefined;

    try {
      connection = await this.getConnection();

      const result = await callback(connection);

      await connection.commit();

      return result;
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          this.logger.error('Oracle rollback failed', rollbackError);
        }
      }

      this.logger.error('Oracle transaction failed', error);

      throw error;
    } finally {
      await this.closeConnection(connection);
    }
  }

  /**
   * Safe connection close.
   */
  private async closeConnection(
    connection?: oracledb.Connection,
  ): Promise<void> {
    if (!connection) return;

    try {
      await connection.close();
    } catch (error) {
      this.logger.error('Failed to close Oracle connection', error);
    }
  }
}