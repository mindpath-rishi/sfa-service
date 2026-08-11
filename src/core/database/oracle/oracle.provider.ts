import * as oracledb from 'oracledb';
import { oracleConfig, OracleConfigOptions } from 'src/core/config/oracle.config';
import { LoggerService } from 'src/core/logger/logger.service';

export const ORACLE_POOL = 'ORACLE_POOL';

let oracleClientInitialized = false;

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

    /**
     * Enable Oracle Thick Mode when ORACLE_THICK_MODE=true.
     * Required when DB user has old password verifier like 0x939.
     */
    if (process.env.ORACLE_THICK_MODE === 'true' && !oracleClientInitialized) {
      try {
        oracledb.initOracleClient({
          libDir: process.env.ORACLE_CLIENT_LIB_DIR,
        });

        oracleClientInitialized = true;

        logger.info(
          `OracleDB Thick mode enabled. Client path: ${process.env.ORACLE_CLIENT_LIB_DIR}`,
        );
      } catch (error: any) {
        /**
         * NJS-078 means Oracle Client was already initialized.
         * It can happen during hot reload / repeated bootstrap.
         */
        if (error?.code !== 'NJS-078') {
          logger.error('OracleDB Thick mode initialization failed', error);
          return null;
        }

        oracleClientInitialized = true;
      }
    } else {
      logger.info(`OracleDB driver mode: ${oracledb.thin ? 'THIN' : 'THICK'}`);
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
      logger.warn('OracleDB credentials missing. Skipping Oracle pool creation.');
      return null;
    }

    try {
      const pool = await oracledb.createPool(oracleConfig(config, logger));

      logger.info('OracleDB connection pool created successfully');
      logger.info(
        `OracleDB pool config: min=${config.poolMin}, max=${config.poolMax}, increment=${config.poolIncrement}`,
      );
      logger.info(
        `OracleDB driver mode after pool create: ${oracledb.thin ? 'THIN' : 'THICK'}`,
      );

      return pool;
    } catch (error) {
      logger.error('OracleDB connection pool creation failed', error);
      return null;
    }
  },
};