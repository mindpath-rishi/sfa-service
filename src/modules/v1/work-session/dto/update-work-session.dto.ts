import { WorkSessionStatus } from 'src/shared/enums/work-session.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';


export class UpdateWorkSessionDto {
/**
 * UpdateWorkSessionDto
 * =================
 * Data Transfer Object for updating WorkSession records
 * 
 * All fields are optional for partial updates
 * Supports partial updates - omitted fields will retain their existing values
 */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  userName?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  dayStartTime?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  dayEndTime?: Date;

  @ApiPropertyOptional({ enum: WorkSessionStatus, default: WorkSessionStatus.ACTIVE })
  @IsOptional()
  @IsEnum(WorkSessionStatus)
  status?: WorkSessionStatus;

}
