import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, HydratedDocument, Model } from 'mongoose';

@Injectable()
export class MongoService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  getModel<T>(name: string, schema: any): Model<HydratedDocument<T>> {
    return this.connection.model<HydratedDocument<T>>(name, schema);
  }

  /** Native database handle, for collections without a mongoose model (time series, caches). */
  getDb() {
    return this.connection.db!;
  }
}
