/**
 * Vans Collection
 * ---------------
 * Purpose : Vehicle master and route context
 * Used by : BACK_OFFICE / ADMIN / LOGISTICS
 *
 * Contains:
 * - Van identity and registration details
 * - Province master association
 * - Capacity in cases and manufacture year
 * - Associated routes (date-based)
 * - Operational status
 *
 * Notes:
 * - Employee van availability is configured on the Position master
 * - Routes can be assigned with date ranges
 * - Soft deletes preserve audit history
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { VanBreakdownReason, VanStatus } from 'src/shared/enums/van.enums';

export type VanDocument = HydratedDocument<Van>;

/* ======================================================
 * ROUTE ASSIGNMENT SUB SCHEMA
 * ====================================================== */

@Schema({ _id: false, timestamps: false })
export class VanRoute {
  @Prop({ required: true, type: String })
  routeId!: string;

  @Prop({ required: false, type: String })
  day?: string;

  @Prop({ required: true, type: Date })
  fromDate!: Date;

  @Prop({ required: true, type: Date })
  toDate!: Date;
}

export const VanRouteSchema = SchemaFactory.createForClass(VanRoute);

/* ======================================================
 * VAN SCHEMA
 * ====================================================== */

@Schema({ timestamps: true })
export class Van {
  /* ======================================================
   * IDENTITY
   * ====================================================== */

  @Prop({ required: true, unique: true, index: true, type: String })
  vanId!: string;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: true, unique: true, index: true, type: String })
  vanNumber!: string;

  @Prop({
    required: false,
    unique: true,
    sparse: true,
    type: String,
    ref: 'Employee',
  })
  driverEmployeeId?: string;

  @Prop({ required: false, index: true, type: String })
  driverName?: string;

  @Prop({
    required: false,
    index: true,
    type: String,
    ref: 'Province',
  })
  provinceId?: string;

  @Prop({ type: [String], default: [], index: true })
  categoryIds!: string[];

  /* ======================================================
   * SPECIFICATIONS
   * ====================================================== */

  /** Maximum van load capacity measured in cases. */
  @Prop({ required: false, type: Number })
  capacity?: number;

  @Prop({ required: false, type: Number })
  madeYear?: number;

  /* ======================================================
   * ASSOCIATIONS
   * ====================================================== */

  /**
   * Routes associated with this van (date-based)
   */
  @Prop({
    type: [VanRouteSchema],
    default: [],
  })
  associatedRoutes!: VanRoute[];

  /* ======================================================
   * STATUS
   * ====================================================== */

  @Prop({
    type: String,
    enum: VanStatus,
    default: VanStatus.ACTIVE,
    required: true,
  })
  status!: VanStatus;

  @Prop({ type: String, enum: VanBreakdownReason })
  breakdownReason?: VanBreakdownReason;
}

export const VanSchema = SchemaFactory.createForClass(Van);
