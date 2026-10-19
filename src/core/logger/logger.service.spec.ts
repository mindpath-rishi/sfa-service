import { PinoLogger } from 'nestjs-pino';
import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  let pino: { info: jest.Mock; debug: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let logger: LoggerService;

  beforeEach(() => {
    pino = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    logger = new LoggerService(pino as unknown as PinoLogger);
  });

  it('logs the error passed as the second argument', () => {
    const err = new Error('boom');
    logger.error('failed', err, { orderId: 'O1' });

    expect(pino.error).toHaveBeenCalledWith({ orderId: 'O1', err }, 'failed');
  });

  it('extracts the error from a meta object instead of dropping it', () => {
    const err = new Error('ORA-00942');
    logger.error('Oracle query failed', { error: err, sql: 'SELECT 1' });

    expect(pino.error).toHaveBeenCalledWith(
      { sql: 'SELECT 1', err },
      'Oracle query failed',
    );
  });

  it('keeps non-Error throwables', () => {
    logger.error('failed', 'plain string');

    expect(pino.error).toHaveBeenCalledWith(
      { err: { message: 'plain string', value: 'plain string' } },
      'failed',
    );
  });

  it('tags logs with its own context, independent of other instances', () => {
    const other = new LoggerService(pino as unknown as PinoLogger);
    logger.setContext('MongoDB');
    other.setContext('Redis');

    logger.info('ready');
    other.warn('reconnecting', { attempt: 2 });

    expect(pino.info).toHaveBeenCalledWith({ context: 'MongoDB' }, 'ready');
    expect(pino.warn).toHaveBeenCalledWith(
      { context: 'Redis', attempt: 2 },
      'reconnecting',
    );
  });
});
