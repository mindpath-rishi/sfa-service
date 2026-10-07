export enum SchemeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  EXPIRED = 'EXPIRED',
}

export enum SchemeType {
  DISCOUNT_PERCENT = 'DISCOUNT_PERCENT',
  DISCOUNT_VALUE = 'DISCOUNT_VALUE',
  BUY_X_GET_Y = 'BUY_X_GET_Y',
  FREE_ITEM = 'FREE_ITEM',
  /** Group buys `groupMinCases` cases -> `freeQty` of `freeProductId`, per multiple */
  GROUP_FREE_QTY = 'GROUP_FREE_QTY',
  /** Group buys `groupMinCases` cases -> `freePercent`% of each line's qty free */
  GROUP_FREE_PERCENT = 'GROUP_FREE_PERCENT',
  /**
   * Combo: buy every product in `comboItems` in its required quantity
   * (e.g. A x3 + B x1) -> `freeQty` of `freeProductId`, per full set bought
   */
  COMBO_FREE_QTY = 'COMBO_FREE_QTY',
}

/** Group scheme types: qualify on the combined quantity of all products in scope */
export const GROUP_SCHEME_TYPES: readonly SchemeType[] = [
  SchemeType.GROUP_FREE_QTY,
  SchemeType.GROUP_FREE_PERCENT,
  SchemeType.COMBO_FREE_QTY,
];

export enum SchemeFreeUnit {
  CASE = 'CASE',
  PIECE = 'PIECE',
}
