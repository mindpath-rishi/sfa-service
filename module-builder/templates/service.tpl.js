module.exports = ({ Entity, ENTITY, entity, fields }) => {
  const uniqueFields = fields.filter((f) => f.isUnique && f.source === 'user');
  const hasUniqueFields = uniqueFields.length > 0;

  const referenceFields = fields.filter(
    (f) => f.refType && f.source === 'user',
  );
  const hasReferenceFields = referenceFields.length > 0;

  const businessIdField = fields.find(
    (f) =>
      f.name.endsWith('Id') &&
      !f.name.startsWith('_') &&
      f.name !== 'id' &&
      (f.isRequired || f.isUnique),
  );

  const businessIdFieldName = businessIdField
    ? businessIdField.name
    : `${entity}Id`;

  const needsTextNormalization = fields.some(
    (f) => f.name === 'name' && f.tsType === 'string' && f.source === 'user',
  );

  return `
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import { ${Entity}, ${Entity}Schema } from 'src/core/database/mongo/schema/${entity}.schema';

import { ${ENTITY} } from './${entity}.constants';
import { Create${Entity}Dto } from './dto/create-${entity}.dto';
import { Update${Entity}Dto } from './dto/update-${entity}.dto';
import { ${Entity}QueryDto } from './dto/${entity}-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
${
  needsTextNormalization
    ? `import { TextNormalizer } from 'src/shared/utils/text-normalizer.utils';
import { NormalizeType } from 'src/shared/enums/normalize.enums';`
    : ''
}

@Injectable()
export class ${Entity}Service extends MongoRepository<${Entity}> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(${Entity}.name, ${Entity}Schema));
  }

  async create(payload: Create${Entity}Dto) {
    try {
      return await this.withTransaction(async (session) => {
        ${
          needsTextNormalization
            ? `if (payload.name) {
          payload.name = TextNormalizer.normalize(payload.name, NormalizeType.TITLE);
        }`
            : ''
        }

        const filter: FilterQuery<${Entity}> = {};

        ${
          hasUniqueFields
            ? uniqueFields
                .map(
                  (f) => `
        if (payload.${f.name}) filter.${f.name} = payload.${f.name};`,
                )
                .join('')
            : ''
        }

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(${ENTITY}.DUPLICATE);
        }

        if (existing?.isDeleted) {
          await this.updateById(
            existing._id.toString(),
            {
              ...payload,
              status: 'ACTIVE',
              isDeleted: false,
            },
            { session },
          );

          return {
            statusCode: HttpStatus.OK,
            message: ${ENTITY}.CREATED,
            data: { ${businessIdFieldName}: existing.${businessIdFieldName} },
          };
        }

        const doc = await this.save(
          {
            ${businessIdFieldName}: IdGenerator.generate('${ENTITY.slice(0, 4)}', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: ${ENTITY}.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: ${Entity}QueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<${Entity}> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ ${businessIdFieldName}: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: ${ENTITY}.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findBy${businessIdFieldName.charAt(0).toUpperCase() + businessIdFieldName.slice(1)}(${businessIdFieldName}: string) {
    const doc = await this.findOne({ ${businessIdFieldName} }, { lean: true });

    if (!doc) throw new NotFoundException(${ENTITY}.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: ${ENTITY}.FETCHED,
      data: doc,
    };
  }

  async update(${businessIdFieldName}: string, dto: Update${Entity}Dto) {
    try {
      return await this.withTransaction(async (session) => {
        ${
          needsTextNormalization
            ? `if (dto.name) {
          dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
        }`
            : ''
        }

        const doc = await this.updateOne(
          { ${businessIdFieldName} },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(${ENTITY}.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: ${ENTITY}.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(${businessIdFieldName}: string) {
    const existing = await this.findOne({ ${businessIdFieldName} });

    if (!existing) throw new NotFoundException(${ENTITY}.NOT_FOUND);

    await this.softDelete({ ${businessIdFieldName} });

    return {
      statusCode: HttpStatus.OK,
      message: ${ENTITY}.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(${ENTITY}.DUPLICATE);
    }
    throw error;
  }
}
`;
};
