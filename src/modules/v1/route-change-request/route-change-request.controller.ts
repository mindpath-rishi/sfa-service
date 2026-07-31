import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import { Permissions } from 'src/core/decorators/permission.decorator';
import {
  API_MODULE,
  API_MODULE_ENABLE_KEYS,
  V1,
} from 'src/shared/constants/api.constants';
import { CreateRouteChangeRequestDto } from './dto/create-route-change-request.dto';
import { RouteChangeRequestService } from './route-change-request.service';

@ApiTags('Route change request')
@FeatureFlag(API_MODULE_ENABLE_KEYS.ROUTE_SESSION)
@Controller({ path: API_MODULE.ROUTE_CHANGE_REQUEST, version: V1 })
export class RouteChangeRequestController {
  constructor(private readonly service: RouteChangeRequestService) {}

  @Permissions('ROUTE_SESSION_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Request a route change from the reporting manager',
  })
  create(@Body() dto: CreateRouteChangeRequestDto) {
    return this.service.create(dto);
  }

  @Permissions('ROUTE_SESSION_UPDATE')
  @Patch(':routeChangeRequestId/approve')
  @ApiParam({ name: 'routeChangeRequestId' })
  approve(@Param('routeChangeRequestId') id: string) {
    return this.service.approve(id);
  }

  @Permissions('ROUTE_SESSION_UPDATE')
  @Patch(':routeChangeRequestId/reject')
  @ApiParam({ name: 'routeChangeRequestId' })
  reject(@Param('routeChangeRequestId') id: string) {
    return this.service.reject(id);
  }
}
