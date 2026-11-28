import { Global, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import * as oracledb from 'oracledb';
import { OracleProvider } from './oracle.provider';
import { OracleRepository } from './oracle.repository';

@Global()
@Module({
  providers: [OracleProvider, OracleRepository],
  exports: [OracleRepository],
})
export class OracleModule implements OnApplicationShutdown {
  private readonly logger = new Logger('OracleDB');

  async onApplicationShutdown(signal?: string) {
    try {
      const pool = oracledb.getPool();

      if (pool) {
        await pool.close(10);
        this.logger.log(`OracleDB pool closed. Signal: ${signal}`);
      }
    } catch (error) {
      this.logger.error(
        'Error while closing OracleDB pool',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
