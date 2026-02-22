import { Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiVersioningService } from './api-versioning.service';

@Injectable()
export class VersionRoutingService {
  private readonly logger = new Logger(VersionRoutingService.name);

  constructor(
    private readonly versioningService: ApiVersioningService,
    private readonly reflector: Reflector,
  ) {}

  /**
   * Check if the current route matches the requested API version
   */
  isRouteVersionCompatible(context: any): boolean {
    const request = context.switchToHttp().getRequest();
    const version = request.apiVersion;

    if (!version) {
      // No version specified, allow route
      return true;
    }

    // Get version metadata from controller/handler
    const controllerVersion = this.reflector.get(
      'api-version',
      context.getClass(),
    );
    const handlerVersion = this.reflector.get(
      'api-version',
      context.getHandler(),
    );

    // If no version specified on controller or handler, assume it supports all versions
    if (!controllerVersion && !handlerVersion) {
      return true;
    }

    const versionString = this.versioningService.getVersionString(version);

    // Check handler version first (more specific)
    if (handlerVersion) {
      if (this.isVersionMatch(versionString, handlerVersion.version)) {
        return true;
      }
    }

    // Check controller version
    if (controllerVersion) {
      if (this.isVersionMatch(versionString, controllerVersion.version)) {
        return true;
      }
    }

    return false;
  }

  private isVersionMatch(
    requestedVersion: string,
    supportedVersions: string | string[],
  ): boolean {
    const versions = Array.isArray(supportedVersions)
      ? supportedVersions
      : [supportedVersions];

    return versions.some((version) => {
      // Handle exact matches
      if (version === requestedVersion) {
        return true;
      }

      // Handle major version matches (e.g., 'v1' matches 'v1.2.3')
      if (version.startsWith('v') && !version.includes('.')) {
        const majorVersion = version;
        return requestedVersion.startsWith(majorVersion);
      }

      return false;
    });
  }

  /**
   * Get version information for the current request
   */
  getRequestVersionInfo(context: any): {
    requestedVersion: string | null;
    controllerVersion: any;
    handlerVersion: any;
    isCompatible: boolean;
  } {
    const request = context.switchToHttp().getRequest();
    const version = request.apiVersion;

    const controllerVersion = this.reflector.get(
      'api-version',
      context.getClass(),
    );
    const handlerVersion = this.reflector.get(
      'api-version',
      context.getHandler(),
    );

    return {
      requestedVersion: version
        ? this.versioningService.getVersionString(version)
        : null,
      controllerVersion,
      handlerVersion,
      isCompatible: this.isRouteVersionCompatible(context),
    };
  }
}
