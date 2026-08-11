import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  OutletVerification,
  OutletVerificationSchema,
} from 'src/core/database/mongo/schema/outlet-verification.schema';
import { NotificationModule } from '../notification/notification.module';
import { OutletVerificationController } from './outlet-verification.controller';
import { OutletVerificationService } from './outlet-verification.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OutletVerification.name, schema: OutletVerificationSchema },
    ]),
    NotificationModule,
  ],
  controllers: [OutletVerificationController],
  providers: [OutletVerificationService],
  exports: [OutletVerificationService],
})
export class OutletVerificationModule {}
