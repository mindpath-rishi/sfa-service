/**
 * Create Employee DTO
 * -------------------
 * Purpose : Define and validate payload for creating a new employee
 * Used by : EMPLOYEE CREATE APIs / ADMIN USER MANAGEMENT
 *
 * Supports:
 * - Basic employee identity details
 * - Secure authentication credentials
 * - Role assignment
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
} from 'class-validator';
import { UserStatus } from '../../user/user.enum';

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
  @ApiPropertyOptional({
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
  @ApiPropertyOptional({
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
  @ApiProperty({
    example: 'UserId',
    description: 'Employee login ID',
  })
  @IsString({ message: 'Login ID must be a string' })
  @IsNotEmpty({ message: 'Login ID is required' })
  loginId!: string;

  /**
   * Full Name
   * ---------
   * Purpose : Employee full name
   */
  @ApiProperty({
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

  /**
   * Password
   * --------
   * Purpose : Initial password for employee account
   *
   * Rules:
   * - Minimum 8 characters
   * - Must include uppercase, lowercase, number, and special character
   */
  @ApiProperty({
    description:
      'Strong password (min 8 chars, uppercase, lowercase, number, special character)',
    example: 'Passw0rd@123',
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message:
      'Password must include uppercase, lowercase, number, and special character',
  })
  password!: string;

  /**
   * Role ID
   * -------
   * Purpose : Assign role to the employee
   */
  @ApiProperty({
    example: 'ROLE_ADMIN',
    description: 'Role identifier assigned to the employee',
  })
  @IsString({ message: 'roleId must be a string' })
  @IsNotEmpty({ message: 'roleId is required' })
  roleId!: string;

  /**
   * Designation ID
   * --------------
   * Purpose : Assign employee to a designation
   */
  @ApiPropertyOptional({
    example: 'DESIG-001',
    description: 'Designation identifier assigned to the employee',
  })
  @IsOptional()
  @IsString({ message: 'designationId must be a string' })
  designationId?: string;

  /**
   * Reporting Employee
   * ------------------
   * Purpose : Direct manager employeeId for hierarchy mapping
   */
  @ApiPropertyOptional({
    example: 'EID-1A2B3C4D',
    description: 'Direct reporting manager employeeId',
  })
  @IsOptional()
  @IsString({ message: 'reportingEmployeeId must be a string' })
  reportingEmployeeId?: string;

  /**
   * Assigned Van IDs
   * ----------------
   * Purpose : Assign vans to the employee by updating Van.associatedUsers
   *
   * Notes:
   * - This is not stored on the employee document
   */
  @ApiPropertyOptional({
    example: ['VID-001'],
    description:
      'Van IDs assigned to the employee. Stored on van.associatedUsers.',
  })
  @IsOptional()
  @IsArray({ message: 'assignedVanIds must be an array of strings' })
  @IsString({ each: true, message: 'assignedVanIds values must be strings' })
  @ArrayUnique({ message: 'assignedVanIds values must be unique' })
  assignedVanIds?: string[];

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
