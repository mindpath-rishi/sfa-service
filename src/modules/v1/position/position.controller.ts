import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import { Permissions } from 'src/core/decorators/permission.decorator';
import {
  ApiInternalErrorResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from 'src/core/swagger/api-error.response.swagger';
import { ApiSuccessResponse } from 'src/core/swagger/api.response.swagger';
import {
  API_MODULE,
  API_MODULE_ENABLE_KEYS,
  V1,
} from 'src/shared/constants/api.constants';
import { POSITION } from './position.constants';
import { PositionService } from './position.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { PositionQueryDto } from './dto/position-query.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

@ApiTags('Position')
@FeatureFlag(API_MODULE_ENABLE_KEYS.POSITION)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.POSITION,
  version: V1,
})
export class PositionController {
  constructor(private readonly service: PositionService) {}

  @Permissions('POSITION_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create position' })
  @ApiBody({ type: CreatePositionDto })
  @ApiSuccessResponse(
    {
      positionId: 'P00001',
      employeeId: 'EID-1A2B3C4D',
      employee: {
        employeeId: 'EID-1A2B3C4D',
        name: 'John Doe',
      },
    },
    POSITION.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreatePositionDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions('POSITION_VIEW')
  async findAll(@Query() query: PositionQueryDto) {
    return this.service.findAll(query);
  }

  @Permissions('POSITION_VIEW')
  @Get(':positionId')
  @ApiParam({ name: 'positionId' })
  async findOne(@Param('positionId') positionId: string) {
    return this.service.findByPositionId(positionId);
  }

  @Permissions('POSITION_UPDATE')
  @Patch(':positionId')
  @ApiOperation({ summary: 'Update position and employee mapping' })
  @ApiBody({ type: UpdatePositionDto })
  async update(
    @Param('positionId') positionId: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.service.update(positionId, dto);
  }

  @Permissions('POSITION_DELETE')
  @Delete(':positionId')
  async delete(@Param('positionId') positionId: string) {
    return this.service.delete(positionId);
  }
}
