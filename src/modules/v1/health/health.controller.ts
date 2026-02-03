/**
 * Health Controller
 * -----------------
 * Purpose : Expose system health and availability information
 * Used by : LOAD BALANCERS / MONITORING TOOLS / DEVOPS CHECKS
 *
 * Responsibilities:
 * - Provide application uptime
 * - Confirm service availability
 *
 * Notes:
 * - This endpoint is lightweight and fast
 * - No authentication or authorization required
 */

import { Controller, Get } from '@nestjs/common';
import { API_MODULE, V1 } from 'src/shared/constants/api.constants';

@Controller({
  path: API_MODULE.HEALTH,
  version: V1,
})
export class HealthController {
  /**
   * Health Check
   * ------------
   * Purpose : Verify application is running and responsive
   *
   * Returns:
   * - status    : Service health status
   * - uptime    : Process uptime in seconds
   * - timestamp : Current server time (ISO format)
   */
  @Get()
  check() {
    return {
      status: 'OK',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
