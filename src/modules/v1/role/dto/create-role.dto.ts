import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsArray,
  IsOptional,
  ArrayUnique,
} from 'class-validator';
import { UserRole } from 'src/shared/enums/app.enum';

export class CreateRoleDto {
  @ApiProperty({
    enum: UserRole,
    example: UserRole.ADMIN,
    description: 'Role name',
  })
  @IsEnum(UserRole)
  name: UserRole;

  @ApiProperty({
    example: 'Administrator role with full access',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: ['USER_CREATE', 'USER_UPDATE', 'ORDER_VIEW'],
    description: 'List of permissions',
    isArray: true,
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions: string[];
}
