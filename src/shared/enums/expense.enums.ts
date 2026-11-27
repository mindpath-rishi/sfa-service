/* ======================================================
 * ENUMS
 * ====================================================== */

/** Employee classification for advance expense (UPC / Local) */
export enum ExpenseTag {
  UPC = 'UPC',
  LOCAL = 'LOCAL',
}

/** Expense option offered per tag */
export enum ExpenseOption {
  FOOD_AND_NIGHT_STAY = 'FOOD_AND_NIGHT_STAY',
  DAILY_EXPENSE = 'DAILY_EXPENSE',
}

export const EXPENSE_OPTION_BY_TAG: Record<ExpenseTag, ExpenseOption> = {
  [ExpenseTag.UPC]: ExpenseOption.FOOD_AND_NIGHT_STAY,
  [ExpenseTag.LOCAL]: ExpenseOption.DAILY_EXPENSE,
};

export enum ExpenseStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SYNCED_TO_ERP = 'SYNCED_TO_ERP',
}
