/**
 * Expense Reference Tables
 * ------------------------
 * - ExpenseRate      : Named Per Day Values (admin-managed). Employees are mapped
 *                      to one via Employee.expenseRateId; unmapped employees use
 *                      the rate flagged isDefault.
 * - WithdrawalCharge : Withdrawal charge slabs (percentage of base amount), looked up by base amount
 *                      (Payable days × Per Day Value)
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ExpenseOption } from 'src/shared/enums/expense.enums';

export type ExpenseRateDocument = HydratedDocument<ExpenseRate>;

@Schema({ timestamps: true, collection: 'expense_rates' })
export class ExpenseRate {
  // Business identifier referenced by Employee.expenseRateId
  @Prop({ required: true, unique: true, type: String })
  rateId!: string;

  // Display name (e.g. "UPC", "Local", "Metro"); stored on the expense request
  @Prop({ required: true, unique: true, trim: true, type: String })
  name!: string;

  @Prop({ required: true, type: String, enum: ExpenseOption })
  expenseOption!: ExpenseOption;

  @Prop({ required: true, type: Number, min: 0 })
  perDayValue!: number;

  // Applied to employees without a mapping (at most one rate)
  @Prop({ type: Boolean, default: false })
  isDefault!: boolean;

  // Legacy UPC / LOCAL key from the fixed-tag version (kept for migration)
  @Prop({ type: String })
  expenseTag?: string;
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

  // Charge as a percentage of the base amount (e.g. 2.5 = 2.5%)
  @Prop({ required: true, type: Number, min: 0, max: 100 })
  chargePercent!: number;
}

export const WithdrawalChargeSchema =
  SchemaFactory.createForClass(WithdrawalCharge);

WithdrawalChargeSchema.index({ minAmount: 1, maxAmount: 1 });
