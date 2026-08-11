import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { OutletVerificationStatus } from 'src/shared/enums/outlet-verification.enums';

export class OutletVerificationQueryDto extends PaginationDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  requestedByEmployeeId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  assignedReviewerId?: string;

  @ApiPropertyOptional({ enum: OutletVerificationStatus })
  @IsOptional()
  @IsEnum(OutletVerificationStatus)
  status?: OutletVerificationStatus;
}
