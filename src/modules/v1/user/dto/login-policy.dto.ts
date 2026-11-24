import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateLoginPolicyDto {
  @ApiPropertyOptional({ description: 'Signing in on a new device signs out older devices' })
  @IsOptional()
  @IsBoolean()
  singleDeviceLogin?: boolean;

  @ApiPropertyOptional({ description: 'While a day is active, only the device that started it can sign in' })
  @IsOptional()
  @IsBoolean()
  lockDayToDevice?: boolean;

  @ApiPropertyOptional({ description: 'Apply the rules to web (portal) sign-ins too' })
  @IsOptional()
  @IsBoolean()
  applyToWeb?: boolean;
}
