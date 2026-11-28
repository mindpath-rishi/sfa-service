import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
  MaxLength,
} from 'class-validator';

export class OfflinePeriodDto {
  @ApiPropertyOptional({ example: '2026-11-24T08:10:00.000Z' })
  @IsDateString()
  from!: string;

  @ApiPropertyOptional({ example: '2026-11-24T08:42:00.000Z' })
  @IsDateString()
  to!: string;
}

export class TrackingHealthDto {
  @ApiPropertyOptional({
    description: 'Location permission is "Allow all the time"',
  })
  @IsOptional()
  @IsBoolean()
  backgroundLocation?: boolean;

  @ApiPropertyOptional({
    description: 'Battery usage Unrestricted (Android only)',
  })
  @IsOptional()
  @IsBoolean()
  batteryUnrestricted?: boolean;

  @ApiPropertyOptional({
    description: 'User confirmed Autostart is on (phones that have it)',
  })
  @IsOptional()
  @IsBoolean()
  autostartConfirmed?: boolean;
}

export class DeviceHeartbeatDto {
  @ApiPropertyOptional({ example: 76, description: 'Battery % (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCharging?: boolean;

  @ApiPropertyOptional({ enum: ['ONLINE', 'OFFLINE'] })
  @IsOptional()
  @IsIn(['ONLINE', 'OFFLINE'])
  networkStatus?: 'ONLINE' | 'OFFLINE';

  @ApiPropertyOptional({
    description: 'When the app was last used on the device',
  })
  @IsOptional()
  @IsDateString()
  lastActiveAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workSessionId?: string;

  @ApiPropertyOptional({
    description: 'Version of the tracking settings the phone has',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  trackingVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiPropertyOptional({
    type: [OfflinePeriodDto],
    description:
      'Offline periods captured on the device since the last heartbeat',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OfflinePeriodDto)
  offlinePeriods?: OfflinePeriodDto[];

  @ApiPropertyOptional({ type: TrackingHealthDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TrackingHealthDto)
  trackingHealth?: TrackingHealthDto;
}
