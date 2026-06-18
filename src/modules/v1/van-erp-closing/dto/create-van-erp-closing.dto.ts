import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsDate,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { VanErpClosingStatus } from 'src/shared/enums/van-erp-closing.enums';

export class CreateVanErpClosingDto {
  /**
   * CreateVanErpClosingDto
   * =================
   * DTO for creating VanErpClosing
   */
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  stockId!: string;

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  date!: Date;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  vanId!: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  productId!: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  qtyInCase!: number;

  @ApiPropertyOptional({
    enum: VanErpClosingStatus,
    enumName: 'VanErpClosingStatus',
  })
  @IsOptional()
  @IsEnum(VanErpClosingStatus)
  status?: VanErpClosingStatus;
}
