import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const VERSION = /^\d+(\.\d+){0,3}$/;

export const DEVICE_COMMANDS = ['SEND_DIAGNOSTICS', 'FORCE_RESYNC', 'LOGOUT'] as const;
export type DeviceCommand = (typeof DEVICE_COMMANDS)[number];

/* ==================== PHONE → SERVER ==================== */

export class HeartbeatDto {
  @ApiProperty() @IsString() @MaxLength(128) deviceId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) appVersion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) buildNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) platform?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) osVersion?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) deviceModel?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() freeStorageMb?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() offlineMode?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) networkType?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() lastDownloadAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() lastUploadAt?: string;

  @ApiPropertyOptional({ description: '{ pending, failed, syncing, oldestPendingAt }' })
  @IsOptional()
  @IsObject()
  queue?: { pending?: number; failed?: number; syncing?: number; oldestPendingAt?: string };

  @ApiPropertyOptional({ description: '{ location, backgroundLocation, notifications } as granted/denied/undetermined' })
  @IsOptional()
  @IsObject()
  permissions?: Record<string, string>;
}

export class MobileErrorDto {
  @ApiProperty({ enum: ['warn', 'error', 'fatal', 'info'] }) @IsIn(['warn', 'error', 'fatal', 'info']) level!: string;
  @ApiProperty() @IsString() @MaxLength(2000) message!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(8000) stack?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) context?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(256) screen?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() time?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) reqId?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() meta?: Record<string, unknown>;
}

export class MobileErrorsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(128) deviceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) appVersion?: string;

  @ApiProperty({ type: [MobileErrorDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MobileErrorDto)
  errors!: MobileErrorDto[];
}

export class DiagnosticReportDto {
  @ApiProperty() @IsString() @MaxLength(128) deviceId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) commandId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) appVersion?: string;

  @ApiPropertyOptional({ description: 'Recent app log lines, newest last' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  logs?: string[];

  @ApiPropertyOptional({ description: 'Sync queue rows (no payloads)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsObject({ each: true })
  queue?: Record<string, unknown>[];

  @ApiPropertyOptional() @IsOptional() @IsObject() diagnostics?: Record<string, unknown>;
}

export class CompleteCommandDto {
  @ApiProperty() @IsBoolean() success!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) message?: string;
}

/* ==================== MIS (SUPER ADMIN) ==================== */

export class DevicesQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) appVersion?: string;

  @ApiPropertyOptional({ enum: ['STALE', 'QUEUE', 'PERMISSIONS', 'OUTDATED', 'STORAGE'] })
  @IsOptional()
  @IsIn(['STALE', 'QUEUE', 'PERMISSIONS', 'OUTDATED', 'STORAGE'])
  issue?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class CreateCommandDto {
  @ApiProperty() @IsString() @MaxLength(64) userId!: string;
  @ApiProperty({ enum: DEVICE_COMMANDS }) @IsIn(DEVICE_COMMANDS) command!: DeviceCommand;
  @ApiPropertyOptional({ description: 'Only this device; omit for any device of the user' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

export class AppConfigDto {
  @ApiPropertyOptional({ example: '1.0.2', description: 'Below this, the app must update (empty = no minimum)' })
  @IsOptional()
  @IsString()
  @Matches(new RegExp(`^$|${VERSION.source}`), { message: 'minAppVersion must look like 1.2.3' })
  minAppVersion?: string;

  @ApiPropertyOptional({ example: '1.0.3', description: 'Newest release; older apps are told an update is available' })
  @IsOptional()
  @IsString()
  @Matches(new RegExp(`^$|${VERSION.source}`), { message: 'latestAppVersion must look like 1.2.3' })
  latestAppVersion?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) updateMessage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) storeUrl?: string;
}

export class DebugLoggingDto {
  @ApiProperty() @IsString() @MaxLength(64) userId!: string;
  @ApiPropertyOptional({ default: 60, minimum: 5, maximum: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  minutes?: number;
}
