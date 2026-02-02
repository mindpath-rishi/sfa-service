import { MongooseModuleOptions } from '@nestjs/mongoose';
import mongoose, { Connection } from 'mongoose';
import { LoggerService } from 'src/core/logger/logger.service';
import { timestampsPlugin } from '../database/mongo/plugins/timestamps.plugin';
import { softDeletePlugin } from '../database/mongo/plugins/soft-delete.plugin';
import { auditPlugin } from '../database/mongo/plugins/audit-logs.plugin';
import { EmployeeSchema } from '../database/mongo/schema/employee.schema';
import { RoleSchema } from '../database/mongo/schema/role.schema';

export const mongoConfig = (
  uri: string,
  logger: LoggerService,
): MongooseModuleOptions => ({
  uri,

  /* ==================== CONNECTION SAFETY ==================== */
  bufferCommands: false,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 45000,

  autoIndex: process.env.NODE_ENV !== 'production',

  connectionFactory: (connection: Connection) => {
    logger.setContext('MongoDB');

    /* ==================== GLOBAL PLUGINS ==================== */
    connection.plugin(timestampsPlugin);
    connection.plugin(softDeletePlugin);
    EmployeeSchema.plugin(auditPlugin, 'employees');
    RoleSchema.plugin(auditPlugin, 'roles');

    logger.info(`MongoDB initial readyState: ${connection.readyState}`);

    connection.once('open', () => {
      logger.info('MongoDB connection opened (READY)');
    });

    connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    connection.on('error', (err) => {
      logger.error('MongoDB connection error', err);
    });

    return connection;
  },
});
