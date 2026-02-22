import { SetMetadata } from '@nestjs/common';

export interface ApiVersionOptions {
  /**
   * API version(s) this controller/endpoint supports
   * Can be a single version or array of versions
   * e.g., 'v1', ['v1', 'v2'], 'v1.2.3'
   */
  version: string | string[];

  /**
   * Whether this is a deprecated version
   */
  deprecated?: boolean;

  /**
   * Sunset date for deprecated versions
   */
  sunsetDate?: Date;

  /**
   * URL to migration guide
   */
  migrationGuide?: string;
}

/**
 * Decorator to specify API version for controllers and endpoints
 *
 * @example
 * ```typescript
 * @ApiVersion('v1')
 * @Controller('auth')
 * export class AuthController {}
 *
 * @ApiVersion(['v1', 'v2'])
 * @Get('profile')
 * getProfile() {}
 * ```
 */
export const ApiVersion = (options: string | string[] | ApiVersionOptions) => {
  const versionOptions: ApiVersionOptions =
    typeof options === 'string' || Array.isArray(options)
      ? { version: options }
      : options;

  return SetMetadata('api-version', versionOptions);
};

/**
 * Decorator for deprecated API versions
 *
 * @example
 * ```typescript
 * @ApiVersionDeprecated('v1', {
 *   sunsetDate: new Date('2027-03-01'),
 *   migrationGuide: 'https://docs.stellara.network/migration/v1-to-v2'
 * })
 * @Get('old-endpoint')
 * getOldEndpoint() {}
 * ```
 */
export const ApiVersionDeprecated = (
  version: string | string[],
  options: Omit<ApiVersionOptions, 'version' | 'deprecated'> = {},
) => {
  return ApiVersion({
    version,
    deprecated: true,
    ...options,
  });
};
