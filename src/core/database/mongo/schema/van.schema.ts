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
 * - Operational status
 *
 * Notes:
 * - Vans are assigned to employees/drivers
 * - Soft deletes preserve audit history
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { VanStatus } from 'src/shared/enums/van.enums';

export type VanDocument = HydratedDocument<Van>;

@Schema({ timestamps: true })
export class Van {
  /* ======================================================
   * IDENTITY
   * ====================================================== */

  // Unique business identifier for van
  @Prop({ required: true, unique: true, index: true })
  vanId: string;

  // Display name of van
  @Prop({ required: true })
  name: string;

  // Vehicle registration / van number
  @Prop({ required: true, unique: true, index: true })
  vanNumber: string;

  /* ======================================================
   * SPECIFICATIONS
   * ====================================================== */

  // Load capacity (example: 1000 kg)
  @Prop({ required: false, type: Number })
  capacity?: number;

  // Manufacturing year
  @Prop({ required: false, type: Number })
  madeYear?: number;

  /* ======================================================
   * ASSOCIATIONS
   * ====================================================== */

  // Users associated with this van
  // Users associated with this van
  @Prop({
    type: [String],
    default: [],
  })
  associatedUsers: string[];

  /* ======================================================
   * STATUS
   * ====================================================== */

  // Van operational status
  @Prop({
    type: String,
    enum: VanStatus,
    default: VanStatus.ACTIVE,
    required: true,
  })
  status: VanStatus;
}

export const VanSchema = SchemaFactory.createForClass(Van);
