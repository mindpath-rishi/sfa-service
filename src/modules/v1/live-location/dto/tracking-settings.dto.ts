import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const ACCURACY_MODES = ['HIGH', 'BALANCED', 'LOW'] as const;

/** Settings applied on the phone (also used for per-user overrides). */
export class DeviceTrackingSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  trackingEnabled?: boolean;

  @ApiPropertyOptional({ enum: ACCURACY_MODES }) @IsOptional() @IsIn(ACCURACY_MODES)
  accuracyMode?: (typeof ACCURACY_MODES)[number];

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(600)
  foregroundIntervalSec?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000)
  foregroundDistanceM?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  backgroundEnabled?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(900)
  backgroundIntervalSec?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000)
  backgroundDistanceM?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(10) @Max(2000)
  maxAccuracyM?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(5) @Max(900)
  heartbeatSec?: number;
}

export class TrackingSettingsDto extends DeviceTrackingSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(50)
  storageToleranceM?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(15) @Max(900)
  storageKeepAliveSec?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  roadSnapEnabled?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(120)
  stopMinMinutes?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(10) @Max(500)
  stopRadiusM?: number;
}

export class TrackingOverrideDto {
  @ApiPropertyOptional() @IsString() @IsNotEmpty()
  employeeId!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  employeeName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300)
  note?: string;

  @ApiPropertyOptional({ type: DeviceTrackingSettingsDto })
  @ValidateNested()
  @Type(() => DeviceTrackingSettingsDto)
  settings!: DeviceTrackingSettingsDto;
}

export class RestoreTrackingSettingsDto {
  @ApiPropertyOptional({ description: 'Why the version is restored' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class UpdateTrackingSettingsDto {
  @ApiPropertyOptional({ description: 'Reason for the change (shown in version history)' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @ApiPropertyOptional({ type: TrackingSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TrackingSettingsDto)
  settings?: TrackingSettingsDto;

  @ApiPropertyOptional({ type: [TrackingOverrideDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => TrackingOverrideDto)
  overrides?: TrackingOverrideDto[];
}
