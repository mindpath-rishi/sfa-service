import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Permissions } from 'src/core/decorators/permission.decorator';
import { StockUnloadRequestQueryDto } from './dto/stock-unload-request-query.dto';
import { StockUnloadRequestService } from './stock-unload-request.service';

@ApiTags('Stock unload requests')
@Controller({ path: 'stock-unload-request', version: '1' })
export class StockUnloadRequestController {
  constructor(private readonly service: StockUnloadRequestService) {}

  @Permissions('WORK_SESSION_VIEW')
  @Get()
  findAll(@Query() query: StockUnloadRequestQueryDto) {
    return this.service.findAll(query);
  }

  @Permissions('WORK_SESSION_VIEW')
  @Get('me/pending')
  @ApiOperation({
    summary: 'Get current employee pending stock unload request',
  })
  findMyPending() {
    return this.service.findMyPending();
  }

  @Permissions('WORK_SESSION_VIEW')
  @Get(':unloadRequestId')
  @ApiOperation({ summary: 'Get stock unload request with item details' })
  @ApiParam({ name: 'unloadRequestId' })
  findDetail(@Param('unloadRequestId') unloadRequestId: string) {
    return this.service.findDetail(unloadRequestId);
  }

  @Permissions('WORK_SESSION_VIEW')
  @Patch(':unloadRequestId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve stock unload and reset van inventory' })
  @ApiParam({ name: 'unloadRequestId' })
  approve(@Param('unloadRequestId') unloadRequestId: string) {
    return this.service.approve(unloadRequestId);
  }

  @Permissions('WORK_SESSION_VIEW')
  @Patch(':unloadRequestId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject stock unload request' })
  @ApiParam({ name: 'unloadRequestId' })
  reject(@Param('unloadRequestId') unloadRequestId: string) {
    return this.service.reject(unloadRequestId);
  }
}
