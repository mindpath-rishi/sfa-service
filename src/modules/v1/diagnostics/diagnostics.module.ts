import { Global, Module } from '@nestjs/common';
import { DiagnosticsAdminController } from './diagnostics-admin.controller';
import { DiagnosticsController } from './diagnostics.controller';
import { DiagnosticsService } from './diagnostics.service';
import { AppVersionGuard } from './app-version.guard';

@Global()
@Module({
  controllers: [DiagnosticsController, DiagnosticsAdminController],
  providers: [DiagnosticsService, AppVersionGuard],
  exports: [DiagnosticsService, AppVersionGuard],
})
export class DiagnosticsModule {}
