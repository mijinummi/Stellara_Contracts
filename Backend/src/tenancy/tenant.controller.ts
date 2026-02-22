import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { TenantService } from './tenant.service';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatus, BillingPlan } from './entities/tenant.entity';
import { Role } from '../auth/roles.enum';
import { TenantUsageService } from './tenant-usage.service';
import { TenantOnboardingService } from './tenant-onboarding.service';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly onboardingService: TenantOnboardingService,
    private readonly usageService: TenantUsageService,
  ) {}

  @Post()
  @Roles(Role.ADMIN)
  async createTenant(
    @Body()
    createTenantDto: {
      name: string;
      slug?: string;
      description?: string;
      billingPlan?: BillingPlan;
    },
    @Request() req,
  ) {
    const slug =
      createTenantDto.slug ||
      (await this.tenantService.generateUniqueSlug(createTenantDto.name));

    const tenant = await this.tenantService.create({
      name: createTenantDto.name,
      slug,
      description: createTenantDto.description,
      billingPlan: createTenantDto.billingPlan,
      createdByUserId: req.user.id,
    });

    return {
      success: true,
      message: 'Tenant created successfully',
      data: tenant,
    };
  }

  @Get()
  @Roles(Role.ADMIN)
  async getAllTenants() {
    const tenants = await this.tenantService.findAll();
    return {
      success: true,
      data: tenants,
    };
  }

  @Get('stats')
  @Roles(Role.ADMIN)
  async getTenantStats() {
    const stats = await this.tenantService.getTenantStats();
    return {
      success: true,
      data: stats,
    };
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.TENANT_ADMIN)
  async getTenant(@Param('id') id: string, @Request() req) {
    // Check if user has access to this tenant
    if (req.user.role !== 'admin') {
      const hasAccess = await this.tenantService.validateTenantAccess(
        id,
        req.user.id,
      );
      if (!hasAccess) {
        throw new Error('Unauthorized access to tenant');
      }
    }

    const tenant = await this.tenantService.findOne(id);
    return {
      success: true,
      data: tenant,
    };
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.TENANT_ADMIN)
  async updateTenant(
    @Param('id') id: string,
    @Body() updateTenantDto: Partial<any>,
    @Request() req,
  ) {
    // Check if user has access to this tenant
    if (req.user.role !== 'admin') {
      const hasAccess = await this.tenantService.validateTenantAccess(
        id,
        req.user.id,
      );
      if (!hasAccess) {
        throw new Error('Unauthorized access to tenant');
      }
    }

    const tenant = await this.tenantService.update(id, updateTenantDto);
    return {
      success: true,
      message: 'Tenant updated successfully',
      data: tenant,
    };
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  async deleteTenant(@Param('id') id: string) {
    await this.tenantService.remove(id);
    return {
      success: true,
      message: 'Tenant deleted successfully',
    };
  }

  @Post(':id/activate')
  @Roles(Role.ADMIN)
  async activateTenant(@Param('id') id: string) {
    const tenant = await this.tenantService.activate(id);
    return {
      success: true,
      message: 'Tenant activated successfully',
      data: tenant,
    };
  }

  @Post(':id/suspend')
  @Roles(Role.ADMIN)
  async suspendTenant(
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const tenant = await this.tenantService.suspend(id, body.reason);
    return {
      success: true,
      message: 'Tenant suspended successfully',
      data: tenant,
    };
  }

  @Get(':id/usage')
  @Roles(Role.ADMIN, Role.TENANT_ADMIN)
  async getTenantUsage(
    @Param('id') id: string,
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('metric') metric?: string,
  ) {
    // Check if user has access to this tenant
    if (req.user.role !== 'admin') {
      const hasAccess = await this.tenantService.validateTenantAccess(
        id,
        req.user.id,
      );
      if (!hasAccess) {
        throw new Error('Unauthorized access to tenant');
      }
    }

    const usage = await this.usageService.getTenantUsage(
      id,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      metric,
    );

    return {
      success: true,
      data: usage,
    };
  }

  @Post(':id/onboard')
  @Roles(Role.ADMIN)
  async startOnboarding(
    @Param('id') id: string,
    @Body()
    body: {
      adminEmail: string;
      adminName?: string;
      companyInfo?: any;
    },
  ) {
    const result = await this.onboardingService.startOnboarding(id, {
      email: body.adminEmail,
      name: body.adminName,
      companyInfo: body.companyInfo,
    });

    return {
      success: true,
      message: 'Onboarding process started',
      data: result,
    };
  }

  @Get(':id/onboarding-status')
  @Roles(Role.ADMIN, Role.TENANT_ADMIN)
  async getOnboardingStatus(@Param('id') id: string, @Request() req) {
    // Check if user has access to this tenant
    if (req.user.role !== 'admin') {
      const hasAccess = await this.tenantService.validateTenantAccess(
        id,
        req.user.id,
      );
      if (!hasAccess) {
        throw new Error('Unauthorized access to tenant');
      }
    }

    const status = await this.onboardingService.getOnboardingStatus(id);
    return {
      success: true,
      data: status,
    };
  }

  @Get('slug/:slug')
  @Roles(Role.ADMIN, Role.TENANT_ADMIN)
  async getTenantBySlug(@Param('slug') slug: string) {
    const tenant = await this.tenantService.findBySlug(slug);
    return {
      success: true,
      data: tenant,
    };
  }
}
