import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ApiVersioningService } from './api-versioning.service';

@Injectable()
export class VersionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(VersionMiddleware.name);

  constructor(private readonly versioningService: ApiVersioningService) {}

  use(req: Request, res: Response, next: NextFunction) {
    try {
      // Extract version from request
      const version = this.versioningService.extractVersionFromRequest(req);

      if (!version) {
        // No version specified, use default
        const defaultVersion = this.versioningService.parseVersion(
          this.versioningService['config'].defaultVersion,
        );
        if (defaultVersion) {
          (req as any).apiVersion = defaultVersion;
          this.logger.debug(
            `Using default version: ${this.versioningService.getVersionString(defaultVersion)}`,
          );
        }
      } else {
        // Validate version
        if (!this.versioningService.isVersionSupported(version)) {
          return this.handleUnsupportedVersion(req, res, version);
        }

        (req as any).apiVersion = version;
        this.logger.debug(
          `API version detected: ${this.versioningService.getVersionString(version)}`,
        );
      }

      // Add version information to request context
      (req as any).versionInfo = {
        detected: version
          ? this.versioningService.getVersionString(version)
          : 'default',
        supported: this.versioningService
          .getSupportedVersions()
          .map((v) => this.versioningService.getVersionString(v)),
        isDeprecated: version
          ? this.versioningService.isVersionDeprecated(version)
          : false,
      };
    } catch (error) {
      this.logger.error('Error in version middleware', error.stack);
      // Continue without version info rather than failing the request
    }

    next();
  }

  private handleUnsupportedVersion(req: Request, res: Response, version: any) {
    const versionString = this.versioningService.getVersionString(version);
    const supportedVersions = this.versioningService
      .getSupportedVersions()
      .map((v) => this.versioningService.getVersionString(v));
    const latestVersion = this.versioningService.getLatestStableVersion();
    const latestVersionString = latestVersion
      ? this.versioningService.getVersionString(latestVersion)
      : null;

    this.logger.warn(`Unsupported API version requested: ${versionString}`);

    res.status(400).json({
      error: 'InvalidAPIVersion',
      message: `API version '${versionString}' is not supported`,
      supported_versions: supportedVersions,
      latest_version: latestVersionString,
      timestamp: new Date().toISOString(),
    });
  }
}
