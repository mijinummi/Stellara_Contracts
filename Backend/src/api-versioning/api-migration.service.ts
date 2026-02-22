import { Injectable, Logger } from '@nestjs/common';
import { ApiVersioningService } from './api-versioning.service';

export interface MigrationRule {
  fromVersion: string;
  toVersion: string;
  transformer: (data: any) => any;
  description: string;
}

export interface MigrationResult {
  success: boolean;
  transformedData: any;
  warnings: string[];
  errors: string[];
}

@Injectable()
export class ApiMigrationService {
  private readonly logger = new Logger(ApiMigrationService.name);
  private readonly migrationRules: MigrationRule[] = [];

  constructor(private readonly versioningService: ApiVersioningService) {}

  /**
   * Register a migration rule
   */
  registerMigrationRule(rule: MigrationRule) {
    this.migrationRules.push(rule);
    this.logger.debug(
      `Registered migration rule: ${rule.fromVersion} -> ${rule.toVersion}`,
    );
  }

  /**
   * Migrate data from one version to another
   */
  migrate(
    data: any,
    fromVersion: string,
    toVersion: string,
    options: { strict?: boolean } = {},
  ): MigrationResult {
    const result: MigrationResult = {
      success: true,
      transformedData: data,
      warnings: [],
      errors: [],
    };

    const strict = options.strict ?? true;

    try {
      // Find applicable migration rules
      const rules = this.getMigrationPath(fromVersion, toVersion);

      if (rules.length === 0) {
        if (strict) {
          result.success = false;
          result.errors.push(
            `No migration path found from ${fromVersion} to ${toVersion}`,
          );
        }
        return result;
      }

      // Apply transformations sequentially
      let currentData = data;
      for (const rule of rules) {
        try {
          currentData = rule.transformer(currentData);
          this.logger.debug(`Applied migration: ${rule.description}`);
        } catch (error) {
          const errorMsg = `Migration failed at rule '${rule.description}': ${error.message}`;
          if (strict) {
            result.success = false;
            result.errors.push(errorMsg);
            return result;
          } else {
            result.warnings.push(errorMsg);
          }
        }
      }

      result.transformedData = currentData;
    } catch (error) {
      result.success = false;
      result.errors.push(`Migration process failed: ${error.message}`);
    }

    return result;
  }

  /**
   * Get migration path between versions
   */
  private getMigrationPath(
    fromVersion: string,
    toVersion: string,
  ): MigrationRule[] {
    // Simple path finding - in a real implementation, this would use a graph algorithm
    const path: MigrationRule[] = [];
    let currentVersion = fromVersion;

    while (currentVersion !== toVersion) {
      const nextRule = this.migrationRules.find(
        (rule) =>
          rule.fromVersion === currentVersion &&
          rule.toVersion !== currentVersion,
      );

      if (!nextRule) {
        break;
      }

      path.push(nextRule);
      currentVersion = nextRule.toVersion;

      // Prevent infinite loops
      if (path.length > this.migrationRules.length) {
        break;
      }
    }

    return currentVersion === toVersion ? path : [];
  }

  /**
   * Get all available migration rules
   */
  getAvailableMigrations(): MigrationRule[] {
    return [...this.migrationRules];
  }

  /**
   * Check if migration is possible between versions
   */
  canMigrate(fromVersion: string, toVersion: string): boolean {
    return this.getMigrationPath(fromVersion, toVersion).length > 0;
  }

  /**
   * Register common migration patterns
   */
  registerCommonMigrations() {
    // Example: Add default fields when migrating to newer versions
    this.registerMigrationRule({
      fromVersion: 'v1',
      toVersion: 'v2',
      transformer: (data) => {
        // Add new fields with default values
        return {
          ...data,
          metadata: data.metadata || {},
          createdAt: data.createdAt || new Date().toISOString(),
        };
      },
      description: 'Add metadata and createdAt fields for v2 compatibility',
    });

    // Example: Rename fields
    this.registerMigrationRule({
      fromVersion: 'v1',
      toVersion: 'v1.1',
      transformer: (data) => {
        // Rename userId to user_id
        const { userId, ...rest } = data;
        return {
          ...rest,
          user_id: userId,
        };
      },
      description: 'Rename userId field to user_id',
    });

    // Example: Transform data structure
    this.registerMigrationRule({
      fromVersion: 'v1.1',
      toVersion: 'v2',
      transformer: (data) => {
        // Transform flat structure to nested
        return {
          user: {
            id: data.user_id,
            name: data.username,
          },
          preferences: {
            theme: data.theme || 'light',
            notifications: data.notifications_enabled !== false,
          },
        };
      },
      description: 'Transform flat user data to nested structure',
    });
  }
}
