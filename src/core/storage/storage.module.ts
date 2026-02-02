import { Module } from '@nestjs/common';
import { CloudStorageProvider } from './cloud.storage.provider';
import { LocalStorageProvider } from './local.storage.provider';
export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useClass:
        process.env.STORAGE_DRIVER === 'CLOUD'
          ? CloudStorageProvider
          : LocalStorageProvider,
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
