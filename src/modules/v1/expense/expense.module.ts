import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Expense,
  ExpenseSchema,
} from 'src/core/database/mongo/schema/expense.schema';
import {
  ExpenseRate,
  ExpenseRateSchema,
  WithdrawalCharge,
  WithdrawalChargeSchema,
} from 'src/core/database/mongo/schema/expense-config.schema';
import { ExpenseController } from './expense.controller';
import { ExpenseService } from './expense.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Expense.name, schema: ExpenseSchema },
      { name: ExpenseRate.name, schema: ExpenseRateSchema },
      { name: WithdrawalCharge.name, schema: WithdrawalChargeSchema },
    ]),
  ],
  controllers: [ExpenseController],
  providers: [ExpenseService],
  exports: [ExpenseService],
})
export class ExpenseModule {}
