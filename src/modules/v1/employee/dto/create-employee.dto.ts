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
} from 'class-validator';

class PermissionOverridesDto {
  @ApiPropertyOptional({
    description: 'Explicitly allowed permissions',
    example: ['employee.read', 'employee.update'],
  })
  @IsOptional()
  @IsArray({ message: 'allow must be an array of strings' })
  @IsString({ each: true, message: 'allow permissions must be strings' })
  @ArrayUnique({ message: 'allow permissions must be unique' })
  allow?: string[];

  @ApiPropertyOptional({
    description: 'Explicitly denied permissions',
    example: ['employee.delete'],
  })
  @IsOptional()
  @IsArray({ message: 'deny must be an array of strings' })
  @IsString({ each: true, message: 'deny permissions must be strings' })
  @ArrayUnique({ message: 'deny permissions must be unique' })
  deny?: string[];
}

export class CreateEmployeeDto {
  /* ======================================================
   * MOBILE (REQUIRED)
   * ====================================================== */

  @ApiProperty({
    example: '9876543210',
    description: 'Employee mobile number',
    required: true,
  })
  @IsString({ message: 'Mobile must be a string' })
  @IsNotEmpty({ message: 'Mobile is required' })
  @Matches(/^[0-9]{8,15}$/, {
    message: 'Mobile must contain only digits (8–15 characters)',
  })
  mobile: string;

  /* ======================================================
   * NAME (REQUIRED)
   * ====================================================== */

  @ApiProperty({
    example: 'John Doe',
    description: 'Employee full name',
    required: true,
  })
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  /* ======================================================
   * EMAIL (REQUIRED)
   * ====================================================== */

  @ApiProperty({
    example: 'john.doe@company.com',
    description: 'Employee email address',
    required: true,
  })
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email: string;

  /* ======================================================
   * PASSWORD (REQUIRED)
   * ====================================================== */

  @ApiProperty({
    description:
      'Strong password (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char)',
    example: 'Passw0rd@123',
    required: true,
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
    {
      message:
        'Password must include uppercase, lowercase, number, and special character',
    },
  )
  password: string;

  /* ======================================================
   * ROLE (REQUIRED)
   * ====================================================== */

  @ApiProperty({
    example: 'ROLE_ADMIN',
    description: 'Role identifier assigned to the employee',
    required: true,
  })
  @IsString({ message: 'roleId must be a string' })
  @IsNotEmpty({ message: 'roleId is required' })
  roleId: string;

  /* ======================================================
   * PERMISSION OVERRIDES (OPTIONAL)
   * ====================================================== */

  @ApiPropertyOptional({
    description: 'Fine-grained permission overrides for the employee',
    type: PermissionOverridesDto,
  })
  @IsOptional()
  permissionOverrides?: PermissionOverridesDto;
}
