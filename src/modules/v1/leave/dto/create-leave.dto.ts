import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';
import { LeaveStatus } from 'src/shared/enums/leave.enums';

export class CreateLeaveDto {
  /**
   * CreateLeaveDto
   * =================
   * DTO for creating Leave
   */
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  userName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ enum: LeaveStatus, enumName: 'LeaveStatus' })
  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;
}
