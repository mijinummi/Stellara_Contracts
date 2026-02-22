import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiVersioningService } from './api-versioning.service';

export interface DeprecationConfig {
  version: string;
  deprecationDate: Date;
  sunsetDate: Date;
  migrationGuide: string;
  warningThresholdDays: number;
}

@Injectable()
export class ApiDeprecationService {
  private readonly logger = new Logger(ApiDeprecationService.name);
  private readonly deprecations: DeprecationConfig[] = [];

  constructor(
    private readonly versioningService: ApiVersioningService,
    private readonly configService: ConfigService,
  ) {
    this.loadDeprecationConfig();
  }

  private loadDeprecationConfig() {
    // Load from environment or config files
    const deprecationConfig = this.configService.get<DeprecationConfig[]>(
      'API_DEPRECATIONS',
      [],
    );
    this.deprecations.push(...deprecationConfig);
  }

  /**
   * Check if a version is deprecated
   */
  isDeprecated(versionString: string): boolean {
    const deprecation = this.deprecations.find(
      (d) => d.version === versionString,
    );
    if (!deprecation) return false;

    const now = new Date();
    return now >= deprecation.deprecationDate;
  }

  /**
   * Check if a version is past its sunset date
   */
  isSunset(versionString: string): boolean {
    const deprecation = this.deprecations.find(
      (d) => d.version === versionString,
    );
    if (!deprecation) return false;

    const now = new Date();
    return now >= deprecation.sunsetDate;
  }

  /**
   * Get deprecation information for a version
   */
  getDeprecationInfo(versionString: string): DeprecationConfig | null {
    return this.deprecations.find((d) => d.version === versionString) || null;
  }

  /**
   * Calculate days until sunset
   */
  getDaysUntilSunset(versionString: string): number | null {
    const deprecation = this.getDeprecationInfo(versionString);
    if (!deprecation) return null;

    const now = new Date();
    const diffTime = deprecation.sunsetDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Check if warning should be shown (close to sunset)
   */
  shouldShowWarning(versionString: string): boolean {
    const deprecation = this.getDeprecationInfo(versionString);
    if (!deprecation) return false;

    const daysUntilSunset = this.getDaysUntilSunset(versionString);
    if (daysUntilSunset === null) return false;

    return daysUntilSunset <= deprecation.warningThresholdDays;
  }

  /**
   * Add a new deprecation
   */
  addDeprecation(
    config: Omit<DeprecationConfig, 'warningThresholdDays'> & {
      warningThresholdDays?: number;
    },
  ) {
    const deprecation: DeprecationConfig = {
      ...config,
      warningThresholdDays: config.warningThresholdDays || 30,
    };

    this.deprecations.push(deprecation);
    this.logger.warn(`API version ${config.version} marked for deprecation`, {
      deprecationDate: config.deprecationDate,
      sunsetDate: config.sunsetDate,
      migrationGuide: config.migrationGuide,
    });
  }

  /**
   * Get all active deprecations
   */
  getActiveDeprecations(): DeprecationConfig[] {
    const now = new Date();
    return this.deprecations.filter(
      (d) => now >= d.deprecationDate && now < d.sunsetDate,
    );
  }

  /**
   * Get all sunset versions
   */
  getSunsetVersions(): DeprecationConfig[] {
    const now = new Date();
    return this.deprecations.filter((d) => now >= d.sunsetDate);
  }

  /**
   * Generate deprecation warning message
   */
  generateDeprecationWarning(versionString: string): string | null {
    if (!this.isDeprecated(versionString)) return null;

    const deprecation = this.getDeprecationInfo(versionString);
    if (!deprecation) return null;

    const daysUntilSunset = this.getDaysUntilSunset(versionString);

    if (this.isSunset(versionString)) {
      return `API version ${versionString} has been removed. Please migrate to a supported version.`;
    }

    if (daysUntilSunset !== null && daysUntilSunset <= 0) {
      return `API version ${versionString} is deprecated and will be removed soon. Please migrate immediately.`;
    }

    if (daysUntilSunset !== null) {
      return `API version ${versionString} is deprecated and will be removed in ${daysUntilSunset} days. Please migrate to a newer version.`;
    }

    return `API version ${versionString} is deprecated. Please refer to the migration guide.`;
  }
}
