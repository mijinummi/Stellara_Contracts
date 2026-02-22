import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantService } from './tenant.service';
import { Tenant } from './entities/tenant.entity';
import { TenantConfig } from './entities/tenant-config.entity';
import { TenantUsage } from './entities/tenant-usage.entity';
import { TenantInvitation } from './entities/tenant-invitation.entity';
import { TenantContextMiddleware } from './middleware/tenant-context.middleware';
import { TenantController } from './tenant.controller';
import { TenantOnboardingService } from './tenant-onboarding.service';
import { TenantConfigService } from './tenant-config.service';
import { TenantGuard } from './guards/tenant.guard';
import { TenantUsageService } from './tenant-usage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tenant,
      TenantConfig,
      TenantUsage,
      TenantInvitation,
    ]),
  ],
  controllers: [TenantController],
  providers: [
    TenantService,
    TenantOnboardingService,
    TenantUsageService,
    TenantConfigService,
    TenantGuard,
    TenantContextMiddleware,
  ],
  exports: [
    TenantService,
    TenantOnboardingService,
    TenantUsageService,
    TenantConfigService,
    TenantGuard,
    TypeOrmModule,
  ],
})
export class TenantModule {}
