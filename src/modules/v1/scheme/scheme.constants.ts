export const SCHEME = {
  CREATED: 'Scheme created successfully',
  FETCHED: 'Scheme fetched successfully',
  UPDATED: 'Scheme updated successfully',
  DELETED: 'Scheme deleted successfully',
  NOT_FOUND: 'Scheme not found',
  DUPLICATE: 'Scheme already exists',
  INVALID_PERIOD: 'Scheme start date must be before end date',
  GROUP_SCOPE_REQUIRED:
    'Group schemes need at least one category, sub-category or product',
  PRODUCT_SCOPE_REQUIRED:
    'Select at least one product, category or sub-category for the scheme',
  GEOGRAPHY_SCOPE_REQUIRED:
    'Select at least one province, route or van for the scheme',
  GROUP_MIN_CASES_REQUIRED:
    'Group schemes need a minimum group quantity (cases) above 0',
  GROUP_FREE_QTY_REQUIRED:
    'Group free-qty schemes need a free quantity above 0 and a free product',
  COMBO_ITEMS_REQUIRED:
    'Combo schemes need at least one product with a required quantity above 0',
  COMBO_DUPLICATE_PRODUCT: 'A product can only appear once in a combo',
  COMBO_FREE_QTY_REQUIRED:
    'Combo schemes need a free quantity above 0 and a free product',
};
