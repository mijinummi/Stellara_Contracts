import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { ApiVersioningService } from './api-versioning.service';

@Injectable()
export class VersionGuard implements CanActivate {
  private readonly logger = new Logger(VersionGuard.name);

  constructor(private readonly versioningService: ApiVersioningService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const version = request.apiVersion;

    if (!version) {
      // Allow requests without version (will use default)
      return true;
    }

    // Check if version is supported
    if (!this.versioningService.isVersionSupported(version)) {
      this.logger.warn(
        `Blocked request with unsupported version: ${this.versioningService.getVersionString(version)}`,
      );
      return false;
    }

    // Check if version is deprecated
    if (this.versioningService.isVersionDeprecated(version)) {
      this.logger.debug(
        `Deprecated version used: ${this.versioningService.getVersionString(version)}`,
      );
      // Still allow deprecated versions but log for monitoring
    }

    return true;
  }
}
