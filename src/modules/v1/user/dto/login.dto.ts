import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Agent } from 'src/modules/v1/user/user.enum';

export class LoginDto {
  @ApiProperty({
    example: '9876543210',
    description: 'Registered mobile number',
  })
  @IsString({ message: 'Mobile must be a string' })
  @IsNotEmpty({ message: 'Mobile is required' })
  @MinLength(5, { message: 'Mobile must be at least 5 characters' })
  @MaxLength(15, { message: 'Mobile must not exceed 15 characters' })
  mobile: string;

  @ApiProperty({
    example: 'Passw0rd@123',
    description: 'User password',
  })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;
}
