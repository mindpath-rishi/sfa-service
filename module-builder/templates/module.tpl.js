module.exports = ({ Entity, entity }) => `
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ${Entity}, ${Entity}Schema } from 'src/core/database/mongo/schema/${entity}.schema';
import { ${Entity}Controller } from './${entity}.controller';
import { ${Entity}Service } from './${entity}.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ${Entity}.name, schema: ${Entity}Schema }]),
  ],
  controllers: [${Entity}Controller],
  providers: [${Entity}Service],
  exports: [${Entity}Service],
})
export class ${Entity}Module {}
`;
