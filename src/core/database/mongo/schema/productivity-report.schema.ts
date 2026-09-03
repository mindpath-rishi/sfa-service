import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProductivityReportDocument = HydratedDocument<ProductivityReport>;

@Schema({
  timestamps: true,
  collection: 'productivity_reports',
})
export class ProductivityReport {
  /* ======================================================
   * REPORT IDENTITY
   * ====================================================== */

  /**
   * UTC start of the report day.
   *
   * Example:
   * 2026-08-30T00:00:00.000Z
   */
  @Prop({
    required: true,
    type: Date,
    index: true,
  })
  reportDate!: Date;

  /**
   * Employee for whom this daily report is prepared.
   */
  @Prop({
    required: true,
    type: String,
    index: true,
  })
  employeeId!: string;

  /* ======================================================
   * EMPLOYEE / HIERARCHY
   * ====================================================== */

  @Prop({ type: String, default: '' })
  admin!: string;

  @Prop({ type: String, default: '' })
  categoryManager!: string;

  @Prop({ type: String, default: '' })
  manager!: string;

  @Prop({ type: String, default: '' })
  teamLeader!: string;

  @Prop({ type: String, default: '' })
  salesman!: string;

  @Prop({ type: String, default: '' })
  country!: string;

  @Prop({ type: String, default: '' })
  province!: string;

  @Prop({ type: String, default: '' })
  reportingManager!: string;

  @Prop({ type: String, default: '' })
  positionOfEmployee!: string;

  @Prop({ type: String, default: '' })
  user!: string;

  @Prop({ type: String, default: '' })
  userStatus!: string;

  /* ======================================================
   * ATTENDANCE / RETAILING
   * ====================================================== */

  @Prop({
    type: Number,
    default: 1,
  })
  countTotalDays!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  countRetailingDays!: number;

  /* ======================================================
   * CALL / COVERAGE
   * ====================================================== */

  /**
   * SC = distinct planned outlets in the selected route/beat.
   */
  @Prop({
    type: Number,
    default: 0,
  })
  sc!: number;

  /**
   * TC = total completed shop visits/calls.
   */
  @Prop({
    type: Number,
    default: 0,
  })
  tc!: number;

  /**
   * PC = distinct completed sales/orders.
   */
  @Prop({
    type: Number,
    default: 0,
  })
  pc!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  productivityPercentage!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  avgTc!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  avgPc!: number;

  /* ======================================================
   * OUTLET METRICS
   * ====================================================== */

  /**
   * UPC = unique billed outlets.
   */
  @Prop({
    type: Number,
    default: 0,
  })
  upc!: number;

  /**
   * UTC = unique visited outlets.
   */
  @Prop({
    type: Number,
    default: 0,
  })
  utc!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  zeroOrder!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  notVisited!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  total!: number;

  /* ======================================================
   * SALES
   * ====================================================== */

  @Prop({
    type: Number,
    default: 0,
  })
  lpc!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  avgValuePerPc!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  qtyKgs!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  qtyCases!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  netValue!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  avgValuePerRetailingDay!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  schemeDiscount!: number;

  /* ======================================================
   * FOCUSED OUTLET SALES
   * ====================================================== */

  @Prop({
    type: Number,
    default: 0,
  })
  focusedOutletOrderKgs!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  focusedOutletOrderCases!: number;

  @Prop({
    type: Number,
    default: 0,
  })
  focusedOutletOrderRevenue!: number;

  /* ======================================================
   * NEW OUTLETS
   * ====================================================== */

  @Prop({
    type: Number,
    default: 0,
  })
  newOutlets!: number;

  /* ======================================================
   * RETAILING TIME
   * ====================================================== */

  /**
   * Stored in seconds.
   *
   * Excel/API layer can convert this to HH:mm:ss.
   */
  @Prop({
    type: Number,
    default: 0,
  })
  avgSpentTimeRetailingSeconds!: number;

  /* ======================================================
   * CALCULATION METADATA
   * ====================================================== */

  @Prop({
    type: Date,
    default: Date.now,
  })
  calculatedAt!: Date;

  @Prop({
    type: Number,
    default: 1,
  })
  calculationVersion!: number;
}

export const ProductivityReportSchema =
  SchemaFactory.createForClass(ProductivityReport);

/* ======================================================
 * INDEXES
 * ====================================================== */

/**
 * One employee can have only one productivity report
 * for a particular UTC report date.
 */
ProductivityReportSchema.index(
  {
    reportDate: 1,
    employeeId: 1,
  },
  {
    unique: true,
    name: 'unique_productivity_report_employee_date',
  },
);

/**
 * Useful for future API queries:
 *
 * GET productivity report between dates
 */
ProductivityReportSchema.index(
  {
    reportDate: 1,
    userStatus: 1,
  },
  {
    name: 'idx_productivity_report_date_status',
  },
);
