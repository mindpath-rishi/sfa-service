module.exports = ({ Entity, ENTITY, entity, titleCase, fields }) => {
  // Find the business ID field (e.g., transactionId, productId, etc.)
  const businessIdField = fields?.find(
    (f) =>
      (f.name?.endsWith('Id') || f.isBusinessKey) &&
      !f.name?.startsWith('_') &&
      f.name !== 'id' &&
      f.name !== '_id' &&
      (f.isRequired || f.isUnique),
  );

  // Get the business ID field name (default to ${entity}Id if not found)
  const businessIdFieldName = businessIdField
    ? businessIdField.name
    : `${entity}Id`;

  // Create camelCase version for params (ensure first letter is lowercase)
  const camelIdParam =
    businessIdFieldName.charAt(0).toLowerCase() + businessIdFieldName.slice(1);

  // Get the method name for findByBusinessId (e.g., findByTransactionId)
  const findByIdMethodName = `findBy${businessIdFieldName.charAt(0).toUpperCase() + businessIdFieldName.slice(1)}`;

  return `/**
 * ${Entity} Controller
 * ${'-'.repeat(Entity.length + 12)}
 * Purpose : Exposes APIs for managing ${entity}s
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create ${entity}s
 * - Fetch ${entity}s with filters & pagination
 * - Retrieve individual ${entity} details
 * - Update ${entity}
 * - Soft delete ${entity}s
 *
 * Notes:
 * - ${Entity}s act as master reference data
 */

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
import { ApiSuccessResponse } from 'src/core/swagger/api.response.swagger';
import {
  ApiInternalErrorResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from 'src/core/swagger/api-error.response.swagger';

import {
  API_MODULE,
  API_MODULE_ENABLE_KEYS,
  V1,
} from 'src/shared/constants/api.constants';

import { Permissions } from 'src/core/decorators/permission.decorator';

import { ${Entity}Service } from './${entity}.service';
import { Create${Entity}Dto } from './dto/create-${entity}.dto';
import { Update${Entity}Dto } from './dto/update-${entity}.dto';
import { ${Entity}QueryDto } from './dto/${entity}-query.dto';
import { ${ENTITY} } from './${entity}.constants';

@ApiTags('${titleCase}')
@FeatureFlag(API_MODULE_ENABLE_KEYS.${ENTITY})
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.${ENTITY},
  version: V1,
})
export class ${Entity}Controller {
  constructor(private readonly service: ${Entity}Service) {}

  /**
   * Create ${Entity}
   * ${'-'.repeat(Entity.length + 7)}
   */
  @Permissions('${ENTITY}_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create ${entity}' })
  @ApiBody({ type: Create${Entity}Dto })
  @ApiSuccessResponse(
    { ${camelIdParam}: '${ENTITY.slice(0, 4)}-001' },
    ${ENTITY}.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: Create${Entity}Dto) {
    return this.service.create(dto);
  }

  /**
   * Get ${Entity}s
   * ${'-'.repeat(Entity.length + 5)}
   */
  @Get()
  @Permissions('${ENTITY}_VIEW')
  async findAll(@Query() query: ${Entity}QueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get ${Entity} by ID
   * ${'-'.repeat(Entity.length + 10)}
   */
  @Permissions('${ENTITY}_VIEW')
  @Get(':${camelIdParam}')
  @ApiParam({ name: '${camelIdParam}', description: '${Entity} ${businessIdFieldName}' })
  async findOne(@Param('${camelIdParam}') ${camelIdParam}: string) {
    return this.service.${findByIdMethodName}(${camelIdParam});
  }

  /**
   * Update ${Entity}
   * ${'-'.repeat(Entity.length + 8)}
   */
  @Permissions('${ENTITY}_UPDATE')
  @Patch(':${camelIdParam}')
  @ApiParam({ name: '${camelIdParam}', description: '${Entity} ${businessIdFieldName}' })
  async update(
    @Param('${camelIdParam}') ${camelIdParam}: string,
    @Body() dto: Update${Entity}Dto,
  ) {
    return this.service.update(${camelIdParam}, dto);
  }

  /**
   * Delete ${Entity}
   * ${'-'.repeat(Entity.length + 8)}
   */
  @Permissions('${ENTITY}_DELETE')
  @Delete(':${camelIdParam}')
  @ApiParam({ name: '${camelIdParam}', description: '${Entity} ${businessIdFieldName}' })
  async delete(@Param('${camelIdParam}') ${camelIdParam}: string) {
    return this.service.delete(${camelIdParam});
  }
}
`;
};
