import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateEmployeeDto } from './create-employee.dto';

export class BulkUploadEmployeesDto {
  @ApiProperty({
    type: [CreateEmployeeDto],
    description: 'Employee records to create in bulk',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateEmployeeDto)
  items!: CreateEmployeeDto[];
}
