/**
 * Login DTOs
 * ----------
 * Purpose : Define and validate login request payload
 * Used by : AUTHENTICATION / LOGIN FLOWS
 *
 * Supports:
 * - User authentication via loginId and password
 * - Device-level session binding
 * - Security auditing and push notification setup
 *
 * Notes:
 * - Device information is mandatory for login
 * - Passwords are transmitted in plain text and hashed internally
 */

import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsObject,
  ValidateNested,
  IsOptional,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Device Info DTO
 * ---------------
 * Purpose : Capture client device metadata at login time
 * Used by : SESSION MANAGEMENT / SECURITY / PUSH NOTIFICATIONS
 *
 * Notes:
 * - Device ID should be stable across sessions
 * - Push token is applicable for mobile clients only
 */
export class DeviceInfoDto {
  /**
   * Device ID
   * ---------
   * Purpose : Stable unique identifier for the client device
   */
  @ApiProperty({
    example: 'b9f7a2c2-1c9b-4e91',
    description: 'Unique device identifier (UUID or stable ID)',
  })
  @IsString({ message: 'Device ID must be a string' })
  @IsNotEmpty({ message: 'Device ID is required' })
  deviceId!: string;

  /**
   * Device Type
   * -----------
   * Purpose : Identify client platform
   *
   * Allowed values:
   * - web
   * - android
   * - ios
   */
  @ApiProperty({
    example: 'web',
    description: 'Device type',
    enum: ['web', 'android', 'ios'],
  })
  @IsString()
  @IsIn(['web', 'android', 'ios'], {
    message: 'Device type must be web, android, or ios',
  })
  deviceType!: 'web' | 'android' | 'ios';

  /**
   * Operating System
   * ----------------
   * Purpose : Identify client OS
   */
  @ApiProperty({
    example: 'Linux',
    description: 'Operating system',
    required: false,
  })
  @IsOptional()
  @IsString()
  os?: string;

  /**
   * Operating System Version
   * ------------------------
   * Purpose : Capture OS version details
   */
  @ApiProperty({
    example: 'Ubuntu 22.04',
    description: 'Operating system version',
    required: false,
  })
  @IsOptional()
  @IsString()
  osVersion?: string;

  /**
   * Browser Info
   * ------------
   * Purpose : Capture browser name and version (web clients only)
   */
  @ApiProperty({
    example: 'Chrome 120',
    description: 'Browser name/version (web only)',
    required: false,
  })
  @IsOptional()
  @IsString()
  browser?: string;

  /**
   * Application Version
   * -------------------
   * Purpose : Identify client application build/version
   */
  @ApiProperty({
    example: '1.3.0',
    description: 'Application version',
    required: false,
  })
  @IsOptional()
  @IsString()
  appVersion?: string;

  /**
   * Push Notification Token
   * -----------------------
   * Purpose : Enable push notifications for mobile clients
   *
   * Notes:
   * - Applicable for Android and iOS devices
   */
  @IsOptional()
  @IsString()
  fcmToken?: string;
}

/**
 * Login Request DTO
 * -----------------
 * Purpose : Authenticate user and bind session to a device
 * Used by : LOGIN / AUTHENTICATION APIs
 *
 * Flow:
 * - Validate credentials
 * - Validate device information
 * - Create authenticated session
 */
export class LoginDto {
  /**
   * Login ID
   * --------
   * Purpose : Unique user identifier
   *
   * Examples:
   * - Username
   * - Employee code
   * - Customer code
   */
  @ApiProperty({
    example: 'EMP00123',
    description: 'Login ID / Username / Employee or Customer Code',
  })
  @IsString({ message: 'Login ID must be a string' })
  @IsNotEmpty({ message: 'Login ID is required' })
  @MinLength(3, { message: 'Login ID must be at least 3 characters' })
  @MaxLength(50, { message: 'Login ID must not exceed 50 characters' })
  loginId!: string;

  /**
   * Password
   * --------
   * Purpose : User authentication secret
   *
   * Notes:
   * - Plain text in request
   * - Securely hashed internally
   */
  @ApiProperty({
    example: 'Passw0rd@123',
    description: 'User password',
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password!: string;

  /**
   * Device Information
   * ------------------
   * Purpose : Bind login session to a specific device
   *
   * Notes:
   * - Mandatory for all login requests
   */
  @ApiProperty({
    description: 'Device information',
    type: DeviceInfoDto,
  })
  @IsObject({ message: 'Device info must be an object' })
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  deviceInfo!: DeviceInfoDto;
}
