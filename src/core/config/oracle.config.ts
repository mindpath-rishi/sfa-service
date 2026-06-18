import * as oracledb from 'oracledb';
import { LoggerService } from 'src/core/logger/logger.service';

export interface OracleConfigOptions {
  user: string;
  password: string;
  connectString: string;

  poolMin?: number;
  poolMax?: number;
  poolIncrement?: number;
  poolTimeout?: number;
  queueTimeout?: number;
  stmtCacheSize?: number;
}

export const oracleConfig = (
  config: OracleConfigOptions,
  logger: LoggerService,
): oracledb.PoolAttributes => {
  logger.setContext('OracleDB');

  /* ==================== ORACLE GLOBAL SETTINGS ==================== */

  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.autoCommit = false;

  return {
    user: config.user,
    password: config.password,
    connectString: config.connectString,

    /* ==================== CONNECTION POOL SAFETY ==================== */

    poolMin: config.poolMin ?? 1,
    poolMax: config.poolMax ?? 10,
    poolIncrement: config.poolIncrement ?? 1,

    /**
     * Time in seconds that idle connections stay in the pool.
     */
    poolTimeout: config.poolTimeout ?? 60,

    /**
     * Time in milliseconds a request waits for a free connection.
     */
    queueTimeout: config.queueTimeout ?? 5000,

    /**
     * Statement cache improves repeated query performance.
     */
    stmtCacheSize: config.stmtCacheSize ?? 30,

    /**
     * Enable pool statistics.
     */
    enableStatistics: process.env.NODE_ENV !== 'production',
  };
};