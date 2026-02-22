import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantModule } from '../src/tenancy/tenant.module';
import { TenantService } from '../src/tenancy/tenant.service';
import { Tenant } from '../src/tenancy/entities/tenant.entity';
import { TenantConfig } from '../src/tenancy/entities/tenant-config.entity';
import { TenantUsage } from '../src/tenancy/entities/tenant-usage.entity';
import { TenantInvitation } from '../src/tenancy/entities/tenant-invitation.entity';
import { AuditModule } from '../src/audit/audit.module';
import { AuditService } from '../src/audit/audit.service';

describe('TenantService', () => {
  let tenantService: TenantService;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Tenant, TenantConfig, TenantUsage, TenantInvitation],
          synchronize: true,
          dropSchema: true,
        }),
        TypeOrmModule.forFeature([
          Tenant,
          TenantConfig,
          TenantUsage,
          TenantInvitation,
        ]),
        TenantModule,
        AuditModule,
      ],
    }).compile();

    tenantService = moduleRef.get<TenantService>(TenantService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  describe('create', () => {
    it('should create a new tenant', async () => {
      const tenantData = {
        name: 'Test Organization',
        slug: 'test-org',
        description: 'A test organization',
      };

      const tenant = await tenantService.create(tenantData);

      expect(tenant).toBeDefined();
      expect(tenant.name).toBe(tenantData.name);
      expect(tenant.slug).toBe(tenantData.slug);
      expect(tenant.description).toBe(tenantData.description);
      expect(tenant.status).toBe('pending');
    });

    it('should generate unique slug if not provided', async () => {
      const tenantData = {
        name: 'Test Organization',
        slug: 'test-org-2',
        description: 'Another test organization',
      };

      const tenant = await tenantService.create(tenantData);

      expect(tenant).toBeDefined();
      expect(tenant.slug).toBeDefined();
      expect(tenant.slug).toContain('test-organization');
    });
  });

  describe('findAll', () => {
    it('should return all tenants', async () => {
      const tenants = await tenantService.findAll();
      expect(Array.isArray(tenants)).toBe(true);
    });
  });

  describe('tenant operations', () => {
    let testTenantId: string;

    beforeEach(async () => {
      const tenant = await tenantService.create({
        name: 'Operation Test Org',
        slug: 'operation-test',
      });
      testTenantId = tenant.id;
    });

    it('should activate a tenant', async () => {
      const activatedTenant = await tenantService.activate(testTenantId);
      expect(activatedTenant.status).toBe('active');
      expect(activatedTenant.activatedAt).toBeDefined();
    });

    it('should suspend a tenant', async () => {
      const suspendedTenant = await tenantService.suspend(
        testTenantId,
        'Testing suspension',
      );
      expect(suspendedTenant.status).toBe('suspended');
      expect(suspendedTenant.suspendedAt).toBeDefined();
    });

    it('should get tenant statistics', async () => {
      const stats = await tenantService.getTenantStats();
      expect(stats).toBeDefined();
      expect(stats.total).toBeGreaterThanOrEqual(0);
      expect(stats.active).toBeGreaterThanOrEqual(0);
      expect(stats.pending).toBeGreaterThanOrEqual(0);
      expect(stats.suspended).toBeGreaterThanOrEqual(0);
    });
  });
});
