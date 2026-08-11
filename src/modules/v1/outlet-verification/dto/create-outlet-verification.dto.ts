import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateOutletVerificationDto {
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  customerId!: string;
}
