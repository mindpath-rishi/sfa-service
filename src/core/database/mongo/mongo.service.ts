import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model, Schema } from 'mongoose';

@Injectable()
export class MongoService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  getModel<T>(name: string, schema: Schema<T>): Model<T> {
    return (
      this.connection.models[name] ??
      this.connection.model<T>(name, schema)
    );
  }
}
