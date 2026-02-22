import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ApiVersioningService } from './api-versioning.service';

@Injectable()
export class VersionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(VersionInterceptor.name);

  constructor(private readonly versioningService: ApiVersioningService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const version = request.apiVersion;

    if (version) {
      // Add version headers to response
      const versionHeaders =
        this.versioningService.generateVersionHeaders(version);
      Object.entries(versionHeaders).forEach(([key, value]) => {
        response.setHeader(key, value);
      });

      this.logger.debug(
        `Added version headers for ${this.versioningService.getVersionString(version)}`,
      );
    }

    return next.handle().pipe(
      tap(() => {
        // Additional response processing if needed
      }),
    );
  }
}
