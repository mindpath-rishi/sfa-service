import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';
import { ChannelStatus } from 'src/shared/enums/channel.enums';

export class CreateChannelDto {
  /**
   * CreateChannelDto
   * =================
   * DTO for creating Channel
   */
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({ enum: ChannelStatus, enumName: 'ChannelStatus' })
  @IsOptional()
  @IsEnum(ChannelStatus)
  status?: ChannelStatus;
}
