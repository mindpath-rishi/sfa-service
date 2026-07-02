import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ShopVisitType } from 'src/shared/enums/shop-visit.enums';

export enum InteractionStatus {
  ARRIVED = 'ARRIVED',
  CONVERTED = 'CONVERTED',
  ABANDONED = 'ABANDONED',
}

export enum InteractionAbandonReason {
  TIMEOUT = 'TIMEOUT',
  CUSTOMER_CHANGED = 'CUSTOMER_CHANGED',
}

export type InteractionLogDocument = HydratedDocument<InteractionLog>;

@Schema({ timestamps: true, collection: 'interaction_logs' })
export class InteractionLog {
  @Prop({ required: true, unique: true, index: true })
  interactionId!: string;

  @Prop({ required: true, index: true })
  customerId!: string;

  @Prop({ required: true, index: true })
  employeeId!: string;

  @Prop({ required: true })
  routeSessionId!: string;

  @Prop({ required: true })
  workSessionId!: string;

  @Prop({ required: true })
  vanId!: string;

  @Prop({ type: Object, required: true })
  customerLocation!: { latitude: number; longitude: number };

  @Prop({ type: Object, required: true })
  arrivalLocation!: { latitude: number; longitude: number; accuracy?: number };

  @Prop({ required: true })
  distanceMeters!: number;

  @Prop({ required: true })
  configuredRadiusMeters!: number;

  @Prop({ enum: ShopVisitType, required: true })
  visitType!: ShopVisitType;

  @Prop({ type: Date, required: true })
  arrivalTime!: Date;

  @Prop({
    enum: InteractionStatus,
    default: InteractionStatus.ARRIVED,
    index: true,
  })
  status!: InteractionStatus;

  @Prop()
  visitId?: string;

  @Prop({ type: Date })
  abandonedAt?: Date;

  @Prop({ enum: InteractionAbandonReason })
  abandonReason?: InteractionAbandonReason;
}

export const InteractionLogSchema =
  SchemaFactory.createForClass(InteractionLog);

InteractionLogSchema.index(
  { employeeId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: InteractionStatus.ARRIVED },
  },
);
