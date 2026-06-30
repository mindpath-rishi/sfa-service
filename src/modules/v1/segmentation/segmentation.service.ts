import { ConflictException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';
import { Segmentation, SegmentationSchema } from 'src/core/database/mongo/schema/segmentation.schema';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { TextNormalizer } from 'src/shared/utils/text-normalizer.utils';
import { NormalizeType } from 'src/shared/enums/normalize.enums';
import { SegmentationStatus } from 'src/shared/enums/segmentation.enums';
import { CreateSegmentationDto } from './dto/create-segmentation.dto';
import { UpdateSegmentationDto } from './dto/update-segmentation.dto';
import { SegmentationQueryDto } from './dto/segmentation-query.dto';
import { SEGMENTATION } from './segmentation.constants';

@Injectable()
export class SegmentationService extends MongoRepository<Segmentation> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Segmentation.name, SegmentationSchema));
  }

  async create(payload: CreateSegmentationDto) {
    try {
      return await this.withTransaction(async (session) => {
        payload.name = TextNormalizer.normalize(payload.name, NormalizeType.TITLE);
        const existing = await this.findOne({ name: payload.name }, { session, includeDeleted: true });

        if (existing && !existing.isDeleted) throw new ConflictException(SEGMENTATION.DUPLICATE);

        if (existing?.isDeleted) {
          await this.updateById(existing._id.toString(), {
            ...payload,
            status: payload.status ?? SegmentationStatus.ACTIVE,
            isDeleted: false,
          }, { session });
          return { statusCode: HttpStatus.OK, message: SEGMENTATION.CREATED, data: { segmentationId: existing.segmentationId } };
        }

        const doc = await this.save({
          segmentationId: IdGenerator.generate('SEG', 8),
          ...payload,
        }, { session });
        return { statusCode: HttpStatus.CREATED, message: SEGMENTATION.CREATED, data: doc };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: SegmentationQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;
    const filter: FilterQuery<Segmentation> = {};
    if (status) filter.status = status;
    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ segmentationId: regex }, { name: regex }];
    }
    const result = await this.paginate(filter, { page, limit, sort: { createdAt: -1 }, lean: true });
    return { statusCode: HttpStatus.OK, message: SEGMENTATION.FETCHED, data: result.items, meta: result.meta };
  }

  async findBySegmentationId(segmentationId: string) {
    const doc = await this.findOne({ segmentationId }, { lean: true });
    if (!doc) throw new NotFoundException(SEGMENTATION.NOT_FOUND);
    return { statusCode: HttpStatus.OK, message: SEGMENTATION.FETCHED, data: doc };
  }

  async update(segmentationId: string, dto: UpdateSegmentationDto) {
    try {
      if (dto.name) dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
      const doc = await this.model.findOneAndUpdate({ segmentationId, isDeleted: { $ne: true } }, dto, { new: true });
      if (!doc) throw new NotFoundException(SEGMENTATION.NOT_FOUND);
      return { statusCode: HttpStatus.OK, message: SEGMENTATION.UPDATED, data: doc };
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(segmentationId: string) {
    const existing = await this.findOne({ segmentationId });
    if (!existing) throw new NotFoundException(SEGMENTATION.NOT_FOUND);
    await this.softDelete({ segmentationId });
    return { statusCode: HttpStatus.OK, message: SEGMENTATION.DELETED, data: existing };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) throw new ConflictException(SEGMENTATION.DUPLICATE);
    throw error;
  }
}
