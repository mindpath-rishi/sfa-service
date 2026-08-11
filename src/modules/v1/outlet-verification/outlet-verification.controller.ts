import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from 'src/core/decorators/permission.decorator';
import { API_MODULE, V1 } from 'src/shared/constants/api.constants';
import { CreateOutletVerificationDto } from './dto/create-outlet-verification.dto';
import { OutletVerificationQueryDto } from './dto/outlet-verification-query.dto';
import { UpdateOutletVerificationDto } from './dto/update-outlet-verification.dto';
import { OutletVerificationService } from './outlet-verification.service';

@ApiTags('Outlet verification')
@Controller({ path: API_MODULE.OUTLET_VERIFICATION, version: V1 })
export class OutletVerificationController {
  constructor(private readonly service: OutletVerificationService) {}

  @Permissions('CUSTOMER_CREATE')
  @Post()
  create(@Body() dto: CreateOutletVerificationDto) {
    return this.service.create(dto);
  }

  @Permissions('CUSTOMER_VIEW')
  @Get()
  findAll(@Query() query: OutletVerificationQueryDto) {
    return this.service.findAll(query);
  }

  @Permissions('CUSTOMER_VIEW')
  @Get(':outletVerificationId')
  findOne(@Param('outletVerificationId') id: string) {
    return this.service.findByOutletId(id);
  }

  @Permissions('CUSTOMER_UPDATE')
  @Patch(':outletVerificationId')
  update(
    @Param('outletVerificationId') id: string,
    @Body() dto: UpdateOutletVerificationDto,
  ) {
    return this.service.update(id, dto);
  }

  @Permissions('CUSTOMER_UPDATE')
  @Patch(':outletVerificationId/approve')
  approve(@Param('outletVerificationId') id: string) {
    return this.service.review(id, true);
  }

  @Permissions('CUSTOMER_UPDATE')
  @Patch(':outletVerificationId/reject')
  reject(
    @Param('outletVerificationId') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.service.review(id, false, body.reason);
  }

  @Permissions('CUSTOMER_DELETE')
  @Delete(':outletVerificationId')
  delete(@Param('outletVerificationId') id: string) {
    return this.service.delete(id);
  }
}
