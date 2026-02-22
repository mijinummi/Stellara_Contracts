import { Injectable, Logger, LogLevel, LoggerService } from '@nestjs/common';
import * as winston from 'winston';
import { RequestContext } from './request-context';

/**
 * A Nest logger implementation that emits JSON with a consistent schema and
 * automatically injects the current correlation id when available.
 *
 * Most services should inject the logger via DI instead of calling `new Logger()`
 * so that the global instance is used and context/correlation IDs are available.
 */
@Injectable()
export class StructuredLogger extends Logger implements LoggerService {
  private readonly logger: winston.Logger;

  /**
   * Accept an optional `context` just like Nest's built-in Logger does.
   * Previously callers were passing the class name to the constructor, which
   * failed once the implementation stopped accepting parameters.  We forward
   * the value to the base class and also keep the behaviour of the default
   * no‑argument constructor for consumers that still inject the service via DI.
   */
  constructor(context?: string) {
    // Nest's base Logger API does not accept undefined; call overload based
    // on whether we actually received a string.
    if (context) {
      super(context);
    } else {
      super();
    }

    const formats = [
      winston.format.timestamp(),
      winston.format.printf((info) => {
        const correlationId = RequestContext.get('correlationId');
        const base: any = {
          timestamp: info.timestamp,
          level: info.level,
          message: info.message,
          correlationId,
          context: info.context || this.context,
          ...(info.meta || {}),
        };
        return JSON.stringify(base);
      }),
    ];

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(...formats),
      transports: [new winston.transports.Console()],
    });
  }

  log(message: any, context?: string, meta?: Record<string, any>): any {
    this.logger.info(message, { context, ...meta });
  }
  error(
    message: any,
    trace?: string,
    context?: string,
    meta?: Record<string, any>,
  ): any {
    this.logger.error(message, { trace, context, ...meta });
  }
  warn(message: any, context?: string, meta?: Record<string, any>): any {
    this.logger.warn(message, { context, ...meta });
  }
  debug(message: any, context?: string, meta?: Record<string, any>): any {
    this.logger.debug(message, { context, ...meta });
  }
  verbose(message: any, context?: string, meta?: Record<string, any>): any {
    this.logger.verbose(message, { context, ...meta });
  }
}
