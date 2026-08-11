import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { VanChangeRequestStatus } from 'src/shared/enums/van-change-request.enums';

export class VanChangeRequestQueryDto extends PaginationDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  workSessionId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  requestedVanId?: string;

  @ApiPropertyOptional({ enum: VanChangeRequestStatus })
  @IsOptional()
  @IsEnum(VanChangeRequestStatus)
  status?: VanChangeRequestStatus;
}
