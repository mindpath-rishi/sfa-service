import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class VanChangeApprovalDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  note?: string;
}
