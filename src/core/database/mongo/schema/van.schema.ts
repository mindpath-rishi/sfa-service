/**
 * Vans Collection
 * ---------------
 * Purpose : Vehicle master and assignment context
 * Used by : BACK_OFFICE / ADMIN / LOGISTICS
 *
 * Contains:
 * - Van identity and registration details
 * - Capacity and manufacture year
 * - Associated users
 * - Associated routes (date-based)
 * - Operational status
 *
 * Notes:
 * - Vans are assigned to employees/drivers
 * - Routes can be assigned with date ranges
 * - Soft deletes preserve audit history
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { VanStatus } from 'src/shared/enums/van.enums';

export type VanDocument = HydratedDocument<Van>;

/* ======================================================
 * ROUTE ASSIGNMENT SUB SCHEMA
 * ====================================================== */

@Schema({ _id: false, timestamps: false })
export class VanRoute {
  @Prop({ required: true, type: String })
  routeId: string;

  @Prop({ required: true, type: Date })
  fromDate: Date;

  @Prop({ required: true, type: Date })
  toDate: Date;
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
  vanId: string;

  @Prop({ required: true, type: String })
  name: string;

  @Prop({ required: true, unique: true, index: true, type: String })
  vanNumber: string;

  /* ======================================================
   * SPECIFICATIONS
   * ====================================================== */

  @Prop({ required: false, type: Number })
  capacity?: number;

  @Prop({ required: false, type: Number })
  madeYear?: number;

  /* ======================================================
   * ASSOCIATIONS
   * ====================================================== */

  @Prop({
    type: [String],
    default: [],
  })
  associatedUsers: string[];

  /**
   * Routes associated with this van (date-based)
   */
  @Prop({
    type: [VanRouteSchema],
    default: [],
  })
  associatedRoutes: VanRoute[];

  /* ======================================================
   * STATUS
   * ====================================================== */

  @Prop({
    type: String,
    enum: VanStatus,
    default: VanStatus.ACTIVE,
    required: true,
  })
  status: VanStatus;
}

export const VanSchema = SchemaFactory.createForClass(Van);