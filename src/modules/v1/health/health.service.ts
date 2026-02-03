/**
 * Health Module
 * -------------
 * Purpose : Register health check endpoints
 * Used by : MONITORING SYSTEMS / LOAD BALANCERS / DEVOPS TOOLS
 *
 * Responsibilities:
 * - Expose HealthController
 *
 * Notes:
 * - This module is intentionally lightweight
 * - No providers or imports required
 */

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
