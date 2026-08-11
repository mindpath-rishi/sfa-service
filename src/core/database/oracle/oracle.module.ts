import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import * as oracledb from 'oracledb';
import { OracleProvider } from './oracle.provider';
import { OracleRepository } from './oracle.repository';

@Global()
@Module({
  providers: [OracleProvider, OracleRepository],
  exports: [OracleRepository],
})
export class OracleModule implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string) {
    try {
      const pool = oracledb.getPool();

      if (pool) {
        await pool.close(10);
        console.log(`OracleDB pool closed. Signal: ${signal}`);
      }
    } catch (error) {
      console.error('Error while closing OracleDB pool', error);
    }
  }
}