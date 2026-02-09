import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, HydratedDocument, Model, Schema } from 'mongoose';

@Injectable()
export class MongoService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  getModel<T>(name: string, schema: any): Model<HydratedDocument<T>> {
    return this.connection.model<HydratedDocument<T>>(name, schema);
  }
}
