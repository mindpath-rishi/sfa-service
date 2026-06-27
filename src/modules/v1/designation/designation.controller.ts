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
import { DESIGNATION } from './designation.constants';
import { DesignationService } from './designation.service';
import { CreateDesignationDto } from './dto/create-designation.dto';
import { DesignationQueryDto } from './dto/designation-query.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';

@ApiTags('Designation')
@FeatureFlag(API_MODULE_ENABLE_KEYS.DESIGNATION)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.DESIGNATION,
  version: V1,
})
export class DesignationController {
  constructor(private readonly service: DesignationService) {}

  @Permissions('DESIGNATION_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create designation' })
  @ApiBody({ type: CreateDesignationDto })
  @ApiSuccessResponse(
    { designationId: 'DESIG-001' },
    DESIGNATION.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateDesignationDto) {
    return this.service.create(dto);
  }

  @Get()
  @Permissions('DESIGNATION_VIEW')
  async findAll(@Query() query: DesignationQueryDto) {
    return this.service.findAll(query);
  }

  @Permissions('DESIGNATION_VIEW')
  @Get(':designationId')
  @ApiParam({ name: 'designationId' })
  async findOne(@Param('designationId') designationId: string) {
    return this.service.findByDesignationId(designationId);
  }

  @Permissions('DESIGNATION_UPDATE')
  @Patch(':designationId')
  async update(
    @Param('designationId') designationId: string,
    @Body() dto: UpdateDesignationDto,
  ) {
    return this.service.update(designationId, dto);
  }

  @Permissions('DESIGNATION_DELETE')
  @Delete(':designationId')
  async delete(@Param('designationId') designationId: string) {
    return this.service.delete(designationId);
  }
}
