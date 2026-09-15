import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { V1 } from 'src/shared/constants/api.constants';
import { ScriptService } from './script.service';

@ApiTags('Scripts')
@Controller({
  path: 'scripts',
  version: V1,
})
export class ScriptController {
  constructor(private readonly scriptService: ScriptService) {}

  @Post('productivity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prepare productivity reports' })
  prepareProductivityReports() {
    return this.scriptService.prepareProductivityReports();
  }
}
