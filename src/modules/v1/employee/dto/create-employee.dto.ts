/**
 * Create Employee DTO
 * -------------------
 * Purpose : Define and validate payload for creating a new employee
 * Used by : EMPLOYEE CREATE APIs / ADMIN USER MANAGEMENT
 *
 * Supports:
 * - Basic employee identity details
 * - Secure authentication credentials
 * - Fine-grained permission overrides
 *
 * Notes:
 * - All validations are enforced at request level
 * - Permission overrides are applied on top of role permissions
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsNotEmpty,
  Matches,
  MinLength,
  IsArray,
  ArrayUnique,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { UserStatus } from '../../user/user.enum';
import { EmployeeType } from 'src/shared/enums/employee.enums';

/**
 * Permission Overrides DTO
 * -----------------------
 * Purpose : Define permission-level overrides for an employee
 * Used by : EMPLOYEE ACCESS CONTROL / AUTHORIZATION LAYER
 *
 * Notes:
 * - Overrides are applied after role permissions
 * - `allow` grants extra permissions
 * - `deny` explicitly revokes permissions
 */
class PermissionOverridesDto {
  /**
   * Allowed Permissions
   * -------------------
   * Purpose : Explicit permissions granted to the employee
   */
  @ApiProperty({
    description: 'Permissions explicitly granted to the employee',
    example: ['employee.read', 'employee.update'],
  })
  @IsOptional()
  @IsArray({ message: 'allow must be an array of strings' })
  @IsString({ each: true, message: 'allow permissions must be strings' })
  @ArrayUnique({ message: 'allow permissions must be unique' })
  allow?: string[];

  /**
   * Denied Permissions
   * -----------------
   * Purpose : Explicit permissions revoked from the employee
   */
  @ApiProperty({
    description: 'Permissions explicitly revoked from the employee',
    example: ['employee.delete'],
  })
  @IsOptional()
  @IsArray({ message: 'deny must be an array of strings' })
  @IsString({ each: true, message: 'deny permissions must be strings' })
  @ArrayUnique({ message: 'deny permissions must be unique' })
  deny?: string[];
}

/**
 * Create Employee Payload
 * ----------------------
 * Purpose : Validate request body for employee creation
 */
export class CreateEmployeeDto {
  @ApiPropertyOptional({
    enum: EmployeeType,
    default: EmployeeType.STAFF,
    description:
      'Staff use positions and app access; supporting staff do not receive either.',
  })
  @IsOptional()
  @IsEnum(EmployeeType)
  employeeType?: EmployeeType;

  @ApiPropertyOptional({
    example: 'EID-12345678',
    description:
      'Optional employee identifier. A unique identifier is generated when omitted.',
  })
  @IsOptional()
  @IsString({ message: 'Employee ID must be a string' })
  @IsNotEmpty({ message: 'Employee ID cannot be empty' })
  employeeId?: string;

  @ApiPropertyOptional({
    example: 'MAN-001',
    description: 'Optional employee MAN number',
  })
  @IsOptional()
  @IsString({ message: 'MAN number must be a string' })
  manNumber?: string;

  /**
   * Mobile Number
   * -------------
   * Purpose : Primary contact number for the employee
   */
  @ApiProperty({
    example: '9876543210',
    description: 'Employee mobile number',
  })
  @IsString({ message: 'Mobile must be a string' })
  @IsNotEmpty({ message: 'Mobile is required' })
  @Matches(/^[0-9]{8,15}$/, {
    message: 'Mobile must contain only digits (8–15 characters)',
  })
  mobile!: string;

  /**
   * Login ID
   * --------
   * Purpose : Unique login identifier for the employee
   */
  @ApiPropertyOptional({
    example: 'UserId',
    description: 'Required only for staff employees',
  })
  @ValidateIf((value) => value.employeeType !== EmployeeType.SUPPORTING_STAFF)
  @IsString({ message: 'Login ID must be a string' })
  @IsNotEmpty({ message: 'Login ID is required' })
  loginId?: string;

  /**
   * Full Name
   * ---------
   * Purpose : Employee full name
   */
  @ApiPropertyOptional({
    example: 'John Doe',
    description: 'Employee full name',
  })
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name is required' })
  name!: string;

  /**
   * Email Address
   * -------------
   * Purpose : Official email for communication and login
   */
  @ApiProperty({
    example: 'john.doe@company.com',
    description: 'Employee email address',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email?: string;

  @ApiPropertyOptional({ example: 'MID-001' })
  @IsOptional()
  @IsString()
  profileImageMediaId?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/profile.jpg' })
  @IsOptional()
  @IsString()
  profileImageUrl?: string;

  /**
   * Password
   * --------
   * Purpose : Initial password for employee account
   *
   * Rules:
   * - Minimum 8 characters
   * - May use the standard initial password, or include uppercase,
   *   lowercase, number, and special character
   */
  @ApiPropertyOptional({
    description:
      'Required only for staff. Use Sfa@2026 or a strong password with uppercase, lowercase, number, and special character',
    example: 'Sfa@2026',
  })
  @ValidateIf((value) => value.employeeType !== EmployeeType.SUPPORTING_STAFF)
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?:Sfa@2026|(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).+)$/, {
    message:
      'Password must be Sfa@2026 or include uppercase, lowercase, number, and special character',
  })
  password?: string;

  @ApiPropertyOptional({
    enum: UserStatus,
    description: 'Employee account status',
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  /**
   * Permission Overrides
   * --------------------
   * Purpose : Apply fine-grained permission changes on top of role permissions
   *
   * Notes:
   * - Optional
   * - Overrides are evaluated after role permissions
   */
  @ApiPropertyOptional({
    description: 'Fine-grained permission overrides for the employee',
    type: PermissionOverridesDto,
  })
  @IsOptional()
  permissionOverrides?: PermissionOverridesDto;
}
