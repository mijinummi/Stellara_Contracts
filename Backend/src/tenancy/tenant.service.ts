import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Tenant, TenantStatus, BillingPlan } from './entities/tenant.entity';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../audit/audit.event';

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly auditService: AuditService,
  ) {}

  async create(createTenantDto: {
    name: string;
    slug: string;
    description?: string;
    billingPlan?: BillingPlan;
    createdByUserId?: string;
  }): Promise<Tenant> {
    // Validate slug uniqueness
    const existingTenant = await this.tenantRepository.findOne({
      where: { slug: createTenantDto.slug },
    });

    if (existingTenant) {
      throw new BadRequestException('Tenant slug already exists');
    }

    const tenant = this.tenantRepository.create({
      ...createTenantDto,
      billingPlan: createTenantDto.billingPlan || BillingPlan.FREE,
      status: TenantStatus.PENDING,
    });

    const savedTenant = await this.tenantRepository.save(tenant);

    // Audit log
    await this.auditService.logAction(
      'tenant.created',
      'system',
      savedTenant.id,
      { tenant: savedTenant },
    );

    return savedTenant;
  }

  async findAll(): Promise<Tenant[]> {
    return this.tenantRepository.find({
      relations: ['users', 'configs', 'usageRecords'],
    });
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({
      where: { id },
      relations: ['users', 'configs', 'usageRecords'],
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    return tenant;
  }

  async findBySlug(slug: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({
      where: { slug },
      relations: ['users', 'configs', 'usageRecords'],
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with slug ${slug} not found`);
    }

    return tenant;
  }

  async update(id: string, updateTenantDto: Partial<Tenant>): Promise<Tenant> {
    const tenant = await this.findOne(id);

    // Prevent status changes through regular update
    if (updateTenantDto.status && updateTenantDto.status !== tenant.status) {
      throw new ForbiddenException(
        'Use specific activation/suspension methods',
      );
    }

    Object.assign(tenant, updateTenantDto);
    const updatedTenant = await this.tenantRepository.save(tenant);

    // Audit log
    await this.auditService.logAction('tenant.updated', 'system', id, {
      changes: updateTenantDto,
    });

    return updatedTenant;
  }

  async remove(id: string): Promise<void> {
    const tenant = await this.findOne(id);

    // Soft delete - mark as inactive instead of hard delete
    await this.tenantRepository.update(id, {
      status: TenantStatus.INACTIVE,
    });

    // Audit log
    await this.auditService.logAction('tenant.deleted', 'system', id, {
      tenant,
    });
  }

  async activate(id: string): Promise<Tenant> {
    const tenant = await this.findOne(id);

    if (tenant.status === TenantStatus.ACTIVE) {
      throw new BadRequestException('Tenant is already active');
    }

    tenant.status = TenantStatus.ACTIVE;
    tenant.activatedAt = new Date();

    const updatedTenant = await this.tenantRepository.save(tenant);

    // Audit log
    await this.auditService.logAction('tenant.activated', 'system', id, {
      tenant: updatedTenant,
    });

    return updatedTenant;
  }

  async suspend(id: string, reason?: string): Promise<Tenant> {
    const tenant = await this.findOne(id);

    if (tenant.status === TenantStatus.SUSPENDED) {
      throw new BadRequestException('Tenant is already suspended');
    }

    tenant.status = TenantStatus.SUSPENDED;
    tenant.suspendedAt = new Date();

    const updatedTenant = await this.tenantRepository.save(tenant);

    // Audit log
    await this.auditService.logAction('tenant.suspended', 'system', id, {
      tenant: updatedTenant,
      reason,
    });

    return updatedTenant;
  }

  async getActiveTenants(): Promise<Tenant[]> {
    return this.tenantRepository.find({
      where: { status: TenantStatus.ACTIVE },
      relations: ['users'],
    });
  }

  async getTenantStats(): Promise<{
    total: number;
    active: number;
    pending: number;
    suspended: number;
    byPlan: Record<string, number>;
  }> {
    const tenants = await this.tenantRepository.find();

    const stats = {
      total: tenants.length,
      active: tenants.filter((t) => t.status === TenantStatus.ACTIVE).length,
      pending: tenants.filter((t) => t.status === TenantStatus.PENDING).length,
      suspended: tenants.filter((t) => t.status === TenantStatus.SUSPENDED)
        .length,
      byPlan: {} as Record<string, number>,
    };

    // Count by billing plan
    tenants.forEach((tenant) => {
      const plan = tenant.billingPlan;
      stats.byPlan[plan] = (stats.byPlan[plan] || 0) + 1;
    });

    return stats;
  }

  async validateTenantAccess(
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
      relations: ['users'],
    });

    if (!tenant) {
      return false;
    }

    // Check if user belongs to this tenant
    return tenant.users?.some((user) => user.id === userId) || false;
  }

  async generateUniqueSlug(baseName: string): Promise<string> {
    let slug = this.slugify(baseName);
    let counter = 1;

    while (await this.tenantRepository.findOne({ where: { slug } })) {
      slug = `${this.slugify(baseName)}-${counter}`;
      counter++;
    }

    return slug;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
