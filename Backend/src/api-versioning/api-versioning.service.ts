import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ApiVersion {
  major: number;
  minor: number;
  patch: number;
  status: 'stable' | 'deprecated' | 'development' | 'removed';
  sunsetDate?: Date;
  migrationGuide?: string;
}

export interface VersionConfig {
  defaultVersion: string;
  supportedVersions: ApiVersion[];
  versionPrefix: string;
}

@Injectable()
export class ApiVersioningService {
  private readonly logger = new Logger(ApiVersioningService.name);
  private readonly config: VersionConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();
  }

  private loadConfig(): VersionConfig {
    return {
      defaultVersion: this.configService.get<string>(
        'API_DEFAULT_VERSION',
        'v1',
      ),
      supportedVersions: [
        {
          major: 1,
          minor: 0,
          patch: 0,
          status: 'stable',
        },
        // Future versions can be added here
        // {
        //   major: 2,
        //   minor: 0,
        //   patch: 0,
        //   status: 'development',
        // },
      ],
      versionPrefix: this.configService.get<string>('API_VERSION_PREFIX', 'v'),
    };
  }

  /**
   * Parse version string (e.g., "v1", "v1.2", "v1.2.3") into ApiVersion object
   */
  parseVersion(versionString: string): ApiVersion | null {
    if (!versionString) return null;

    const match = versionString.match(/^v(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
    if (!match) return null;

    const [, major, minor = '0', patch = '0'] = match;

    const version: ApiVersion = {
      major: parseInt(major, 10),
      minor: parseInt(minor, 10),
      patch: parseInt(patch, 10),
      status: 'stable', // Default status
    };

    // Find the actual version configuration
    const configVersion = this.config.supportedVersions.find(
      (v) =>
        v.major === version.major &&
        v.minor === version.minor &&
        v.patch === version.patch,
    );

    return configVersion ? { ...version, ...configVersion } : null;
  }

  /**
   * Extract version from request (URL path, headers, query params)
   */
  extractVersionFromRequest(request: any): ApiVersion | null {
    // 1. Check URL path: /v1/endpoint
    const pathVersion = this.extractVersionFromPath(request.path);
    if (pathVersion) return pathVersion;

    // 2. Check Accept header: application/vnd.stellara.v2+json
    const acceptVersion = this.extractVersionFromAcceptHeader(
      request.headers['accept'],
    );
    if (acceptVersion) return acceptVersion;

    // 3. Check custom header: API-Version: 2
    const headerVersion = this.extractVersionFromHeader(
      request.headers['api-version'],
    );
    if (headerVersion) return headerVersion;

    // 4. Check query parameter: ?version=2
    const queryVersion = this.extractVersionFromQuery(request.query?.version);
    if (queryVersion) return queryVersion;

    // 5. Return default version
    return this.parseVersion(this.config.defaultVersion);
  }

  private extractVersionFromPath(path: string): ApiVersion | null {
    const versionMatch = path.match(/^\/(v\d+(?:\.\d+)?(?:\.\d+)?)/);
    if (versionMatch) {
      return this.parseVersion(versionMatch[1]);
    }
    return null;
  }

  private extractVersionFromAcceptHeader(
    acceptHeader: string,
  ): ApiVersion | null {
    if (!acceptHeader) return null;

    const versionMatch = acceptHeader.match(
      /application\/vnd\.stellara\.([v\d.]+)\+json/,
    );
    if (versionMatch) {
      return this.parseVersion(versionMatch[1]);
    }
    return null;
  }

  private extractVersionFromHeader(headerValue: string): ApiVersion | null {
    if (!headerValue) return null;
    return this.parseVersion(`v${headerValue}`);
  }

  private extractVersionFromQuery(queryValue: string): ApiVersion | null {
    if (!queryValue) return null;
    return this.parseVersion(`v${queryValue}`);
  }

  /**
   * Check if version is supported
   */
  isVersionSupported(version: ApiVersion): boolean {
    return this.config.supportedVersions.some(
      (v) =>
        v.major === version.major &&
        v.minor === version.minor &&
        v.patch === version.patch,
    );
  }

  /**
   * Check if version is deprecated
   */
  isVersionDeprecated(version: ApiVersion): boolean {
    const configVersion = this.config.supportedVersions.find(
      (v) =>
        v.major === version.major &&
        v.minor === version.minor &&
        v.patch === version.patch,
    );
    return configVersion?.status === 'deprecated';
  }

  /**
   * Get version string representation
   */
  getVersionString(version: ApiVersion): string {
    return `v${version.major}.${version.minor}.${version.patch}`;
  }

  /**
   * Get all supported versions
   */
  getSupportedVersions(): ApiVersion[] {
    return this.config.supportedVersions;
  }

  /**
   * Get latest stable version
   */
  getLatestStableVersion(): ApiVersion | null {
    const stableVersions = this.config.supportedVersions.filter(
      (v) => v.status === 'stable',
    );
    if (stableVersions.length === 0) return null;

    return stableVersions.reduce((latest, current) => {
      if (current.major > latest.major) return current;
      if (current.major === latest.major && current.minor > latest.minor)
        return current;
      if (
        current.major === latest.major &&
        current.minor === latest.minor &&
        current.patch > latest.patch
      )
        return current;
      return latest;
    });
  }

  /**
   * Generate version response headers
   */
  generateVersionHeaders(version: ApiVersion): Record<string, string> {
    const headers: Record<string, string> = {
      'API-Version': this.getVersionString(version),
    };

    if (this.isVersionDeprecated(version)) {
      headers['API-Deprecated'] = 'true';
      const configVersion = this.config.supportedVersions.find(
        (v) =>
          v.major === version.major &&
          v.minor === version.minor &&
          v.patch === version.patch,
      );
      if (configVersion?.sunsetDate) {
        headers['API-Sunset'] = configVersion.sunsetDate.toUTCString();
      }
      if (configVersion?.migrationGuide) {
        headers['API-Migration-Guide'] = configVersion.migrationGuide;
      }
    }

    return headers;
  }
}
