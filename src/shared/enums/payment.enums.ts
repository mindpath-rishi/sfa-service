/* ======================================================
 * ENUMS
 * ====================================================== */

export enum PaymentMode {
  CASH = 'CASH',
  UPI = 'UPI',
  CARD = 'CARD',
  BANK = 'BANK',
  CHEQUE = 'CHEQUE',
  CREDIT = 'CREDIT',
  WALLET = 'WALLET'
}

export enum PaymentStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
}
