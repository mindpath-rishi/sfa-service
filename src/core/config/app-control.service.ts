import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppControlService {
  constructor(private readonly config: ConfigService) {}

  /* ==================== GENERIC ROUTE CHECK ==================== */

  isRouteEnabled(featureKey: string): boolean {
    const envValue: any = process.env[featureKey];
    return envValue === 'true';
  }
}
