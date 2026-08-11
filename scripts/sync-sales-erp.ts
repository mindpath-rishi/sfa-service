import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SaleService } from '../src/modules/v1/sale/sale.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = app.get(SaleService);
    const result = await service.syncPendingSalesToERP();
    console.log(JSON.stringify({ table: 'ORDER_SFA', result }, null, 2));
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
