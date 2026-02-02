import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { UserStatus } from 'src/modules/v1/user/user.enum';

export type EmployeeDocument = Employee & Document;

@Schema({ timestamps: true })
export class Employee {
  @Prop({ required: true, trim: true })
  employeeId: string;

  @Prop({ required: true, trim: true })
  mobile: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  roleId: string;

  @Prop({
    type: {
      allow: { type: [String], default: [] },
      deny: { type: [String], default: [] },
    },
    default: { allow: [], deny: [] },
  })
  permissionOverrides: {
    allow: string[];
    deny: string[];
  };

  @Prop({
    type: String,
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);

