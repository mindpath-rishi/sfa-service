import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { StockUnloadRequestStatus } from 'src/shared/enums/stock-unload-request.enums';

export class StockUnloadRequestQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ enum: StockUnloadRequestStatus })
  @IsOptional()
  @IsEnum(StockUnloadRequestStatus)
  status?: StockUnloadRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  searchText?: string;
}
