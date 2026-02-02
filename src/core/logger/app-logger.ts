import { LoggerService } from './logger.service';

export class AppLogger {
  private static logger: LoggerService;

  static init(logger: LoggerService) {
    AppLogger.logger = logger;
  }

  static info(message: string, meta?: Record<string, any>) {
    AppLogger.logger?.info(message, meta);
  }

  static debug(message: string, meta?: Record<string, any>) {
    AppLogger.logger?.debug(message, meta);
  }

  static warn(message: string, meta?: Record<string, any>) {
    AppLogger.logger?.warn(message, meta);
  }

  static error(message: string, error?: unknown, meta?: Record<string, any>) {
    AppLogger.logger?.error(message, error, meta);
  }
}
