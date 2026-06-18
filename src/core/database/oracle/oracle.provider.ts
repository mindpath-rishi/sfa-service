import * as oracledb from 'oracledb';
import { oracleConfig, OracleConfigOptions } from 'src/core/config/oracle.config';
import { LoggerService } from 'src/core/logger/logger.service';

export const ORACLE_POOL = 'ORACLE_POOL';

export const OracleProvider = {
  provide: ORACLE_POOL,
  inject: [LoggerService],
  useFactory: async (
    logger: LoggerService,
  ): Promise<oracledb.Pool | null> => {
    logger.setContext('OracleDB');

    if (process.env.ORACLE_ENABLED !== 'true') {
      logger.warn('OracleDB is disabled. Skipping Oracle pool creation.');
      return null;
    }

    const config: OracleConfigOptions = {
      user: process.env.ORACLE_USER!,
      password: process.env.ORACLE_PASSWORD!,
      connectString: process.env.ORACLE_CONNECT_STRING!,

      poolMin: Number(process.env.ORACLE_POOL_MIN ?? 1),
      poolMax: Number(process.env.ORACLE_POOL_MAX ?? 10),
      poolIncrement: Number(process.env.ORACLE_POOL_INCREMENT ?? 1),
      poolTimeout: Number(process.env.ORACLE_POOL_TIMEOUT ?? 60),
      queueTimeout: Number(process.env.ORACLE_QUEUE_TIMEOUT ?? 5000),
      stmtCacheSize: Number(process.env.ORACLE_STMT_CACHE_SIZE ?? 30),
    };

    if (!config.user || !config.password || !config.connectString) {
      logger.warn(
        'OracleDB credentials missing. Skipping Oracle pool creation.',
      );
      return null;
    }

    try {
      const pool = await oracledb.createPool(oracleConfig(config, logger));

      logger.info('OracleDB connection pool created successfully');
      logger.info(
        `OracleDB pool config: min=${config.poolMin}, max=${config.poolMax}, increment=${config.poolIncrement}`,
      );

      return pool;
    } catch (error) {
      logger.error('OracleDB connection pool creation failed', error);

      /**
       * Important:
       * Do not throw error if Oracle should be optional.
       * App will continue running without Oracle.
       */
      return null;
    }
  },
};