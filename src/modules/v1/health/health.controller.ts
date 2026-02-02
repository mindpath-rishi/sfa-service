import { Controller, Get } from '@nestjs/common';
import { API_MODULE, V1 } from 'src/shared/constants/api.constants';

@Controller({
  path: API_MODULE.HEALTH,
  version: V1,
})
export class HealthController {
  @Get()
  check() {
    return {
      status: 'OK',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
