import { Module } from '@nestjs/common';
import { ApiVersioningService } from './api-versioning.service';
import { VersionMiddleware } from './version.middleware';
import { VersionGuard } from './version.guard';
import { VersionInterceptor } from './version.interceptor';
import { VersionRoutingService } from './version-routing.service';
import { ApiDeprecationService } from './api-deprecation.service';
import { ApiMigrationService } from './api-migration.service';

@Module({
  providers: [
    ApiVersioningService,
    VersionMiddleware,
    VersionGuard,
    VersionInterceptor,
    VersionRoutingService,
    ApiDeprecationService,
    ApiMigrationService,
  ],
  exports: [
    ApiVersioningService,
    VersionMiddleware,
    VersionGuard,
    VersionInterceptor,
    VersionRoutingService,
    ApiDeprecationService,
    ApiMigrationService,
  ],
})
export class ApiVersioningModule {}
