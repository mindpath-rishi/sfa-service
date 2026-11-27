/**
 * Expense Reference Tables
 * ------------------------
 * - ExpenseRate      : Per Day Value by employee tag (UPC / Local)
 * - WithdrawalCharge : Withdrawal charge slabs, looked up by base amount
 *                      (Payable days × Per Day Value)
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ExpenseOption, ExpenseTag } from 'src/shared/enums/expense.enums';

export type ExpenseRateDocument = HydratedDocument<ExpenseRate>;

@Schema({ timestamps: true, collection: 'expense_rates' })
export class ExpenseRate {
  @Prop({ required: true, unique: true, type: String, enum: ExpenseTag })
  expenseTag!: ExpenseTag;

  @Prop({ required: true, type: String, enum: ExpenseOption })
  expenseOption!: ExpenseOption;

  @Prop({ required: true, type: Number, min: 0 })
  perDayValue!: number;
}

export const ExpenseRateSchema = SchemaFactory.createForClass(ExpenseRate);

export type WithdrawalChargeDocument = HydratedDocument<WithdrawalCharge>;

@Schema({ timestamps: true, collection: 'withdrawal_charges' })
export class WithdrawalCharge {
  // Inclusive lower bound of base amount
  @Prop({ required: true, type: Number, min: 0 })
  minAmount!: number;

  // Inclusive upper bound of base amount
  @Prop({ required: true, type: Number, min: 0 })
  maxAmount!: number;

  @Prop({ required: true, type: Number, min: 0 })
  charge!: number;
}

export const WithdrawalChargeSchema =
  SchemaFactory.createForClass(WithdrawalCharge);

WithdrawalChargeSchema.index({ minAmount: 1, maxAmount: 1 });
