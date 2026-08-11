/**
 * Create Role DTO
 * ---------------
 * Purpose : Define and validate payload for creating a new role
 * Used by : ROLE MANAGEMENT / ACCESS CONTROL CONFIGURATION
 *
 * Supports:
 * - Role identity and description
 * - Permission assignment
 * - Operational constraints (e.g., max associated vans)
 *
 * Notes:
 * - Role name uniqueness is enforced at persistence level
 * - Permissions are mapped to system-defined permission codes
 */

import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsOptional,
  ArrayUnique,
  MaxLength,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { Status } from 'src/shared/enums/app.enums';

export class CreateRoleDto {
  /**
   * Role Name
   * ---------
   * Purpose : Logical identifier for the role
   *
   * Constraints:
   * - Must be unique (enforced at DB level)
   * - Max length : 50 characters
   */
  @ApiProperty({
    example: 'OPERATIONS_MANAGER',
    description: 'Role name',
  })
  @IsString()
  @MaxLength(50)
  name!: string;

  /**
   * Role Description
   * ----------------
   * Purpose : Human-readable explanation of the role
   *
   * Notes:
   * - Optional
   * - Used for UI clarity and admin understanding
   */
  @ApiProperty({
    example: 'Manages daily operations and delivery staff',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  /**
   * Permissions
   * -----------
   * Purpose : Define permissions granted to this role
   *
   * Rules:
   * - Must be an array of permission codes
   * - Values must be unique
   */
  @ApiProperty({
    example: ['USER_CREATE', 'ORDER_ASSIGN', 'VAN_VIEW'],
    description: 'List of permissions',
    isArray: true,
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions!: string[];

  @ApiProperty({
    example: 'ACTIVE',
    enum: Status,
    required: false,
  })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  @ApiProperty({
    example: false,
    description: 'Whether this is a system admin role',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isSystemAdmin?: boolean;
}
