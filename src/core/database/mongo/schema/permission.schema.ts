import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Status } from 'src/shared/enums/app.enum';

export type PermissionDocument = Permission & Document;

@Schema({ timestamps: true })
export class Permission {
  @Prop({ required: true, unique: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  module: string;

  @Prop({
    type: String,
    enum: Status,
    default: Status.ACTIVE,
    index: true,
  })
  status: Status;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);
