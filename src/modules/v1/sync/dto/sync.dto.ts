import { Type } from 'class-transformer';
import { IsArray, IsIn, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

export class SyncOperationDto {
  @IsString() queueId!: string;
  @IsString() entity!: string;
  @IsIn(['CREATE', 'UPDATE', 'DELETE']) operation!: 'CREATE' | 'UPDATE' | 'DELETE';
  @IsString() localId!: string;
  @IsObject() payload!: Record<string, unknown>;
}

export class SyncUploadDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncOperationDto)
  operations!: SyncOperationDto[];
}

export class SyncDownloadDto {
  @IsOptional() @IsString() lastSync?: string;
  @IsOptional() @IsString() cursor?: string;
}

