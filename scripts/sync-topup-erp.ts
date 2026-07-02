import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VanInventoryTopupService } from '../src/modules/v1/van-inventory-topup/van-inventory-topup.service';

async function run() {
  const mode = process.argv[2] || 'both';
  if (!['requests', 'stock-take', 'both'].includes(mode)) {
    throw new Error('Usage: sync-topup-erp.ts [requests|stock-take|both]');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = app.get(VanInventoryTopupService);

    if (mode === 'requests' || mode === 'both') {
      const result = await service.syncTopupRequestsToERP();
      console.log(
        JSON.stringify({ table: 'VAN_STOCK_REQUEST', result }, null, 2),
      );
    }

    if (mode === 'stock-take' || mode === 'both') {
      const result = await service.syncTopupApprovalsFromERP();
      console.log(JSON.stringify({ table: 'VAN_STOCK_TAKE', result }, null, 2));
    }
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
