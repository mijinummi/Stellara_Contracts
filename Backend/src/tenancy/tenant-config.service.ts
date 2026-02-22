import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantConfig, ConfigType } from './entities/tenant-config.entity';
import { Tenant } from './entities/tenant.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TenantConfigService {
  constructor(
    @InjectRepository(TenantConfig)
    private readonly configRepository: Repository<TenantConfig>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    private readonly auditService: AuditService,
  ) {}

  async getConfig(tenantId: string, key: string): Promise<any> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    const config = await this.configRepository.findOne({
      where: {
        tenant: { id: tenantId },
        key,
        isActive: true,
      },
    });

    return config ? config.value : null;
  }

  async getAllConfig(
    tenantId: string,
    configType?: ConfigType,
  ): Promise<Record<string, any>> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    const where: any = {
      tenant: { id: tenantId },
      isActive: true,
    };

    if (configType) {
      where.configType = configType;
    }

    const configs = await this.configRepository.find({ where });

    const configMap: Record<string, any> = {};
    configs.forEach((config) => {
      configMap[config.key] = config.value;
    });

    return configMap;
  }

  async setConfig(
    tenantId: string,
    key: string,
    value: any,
    configType: ConfigType = ConfigType.GENERAL,
  ): Promise<TenantConfig> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    // Deactivate existing config with same key
    await this.configRepository.update(
      {
        tenant: { id: tenantId },
        key,
        isActive: true,
      },
      { isActive: false },
    );

    // Create new config
    const config = this.configRepository.create({
      tenant: { id: tenantId } as Tenant,
      key,
      value,
      configType,
      isActive: true,
    });

    const savedConfig = await this.configRepository.save(config);

    // Audit log
    await this.auditService.logAction(
      'tenant.config.updated',
      'system',
      tenantId,
      { key, value, configType },
    );

    return savedConfig;
  }

  async updateConfig(
    tenantId: string,
    key: string,
    value: any,
  ): Promise<TenantConfig> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    const config = await this.configRepository.findOne({
      where: {
        tenant: { id: tenantId },
        key,
        isActive: true,
      },
    });

    if (!config) {
      throw new NotFoundException(
        `Config key ${key} not found for tenant ${tenantId}`,
      );
    }

    config.value = value;
    const updatedConfig = await this.configRepository.save(config);

    // Audit log
    await this.auditService.logAction(
      'tenant.config.updated',
      'system',
      tenantId,
      { key, value, updated: true },
    );

    return updatedConfig;
  }

  async deleteConfig(tenantId: string, key: string): Promise<void> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    await this.configRepository.update(
      {
        tenant: { id: tenantId },
        key,
      },
      { isActive: false },
    );

    // Audit log
    await this.auditService.logAction(
      'tenant.config.deleted',
      'system',
      tenantId,
      { key },
    );
  }

  async getConfigByType(
    tenantId: string,
    configType: ConfigType,
  ): Promise<Record<string, any>> {
    return this.getAllConfig(tenantId, configType);
  }

  // Helper methods for common configurations
  async getAuthConfig(tenantId: string): Promise<Record<string, any>> {
    return this.getConfigByType(tenantId, ConfigType.AUTH);
  }

  async getBillingConfig(tenantId: string): Promise<Record<string, any>> {
    return this.getConfigByType(tenantId, ConfigType.BILLING);
  }

  async getFeaturesConfig(tenantId: string): Promise<Record<string, any>> {
    return this.getConfigByType(tenantId, ConfigType.FEATURES);
  }

  async getGeneralConfig(tenantId: string): Promise<Record<string, any>> {
    return this.getConfigByType(tenantId, ConfigType.GENERAL);
  }

  async getIntegrationsConfig(tenantId: string): Promise<Record<string, any>> {
    return this.getConfigByType(tenantId, ConfigType.INTEGRATIONS);
  }

  async setAuthConfig(
    tenantId: string,
    config: Record<string, any>,
  ): Promise<TenantConfig[]> {
    const configs: TenantConfig[] = [];
    for (const [key, value] of Object.entries(config)) {
      configs.push(await this.setConfig(tenantId, key, value, ConfigType.AUTH));
    }
    return configs;
  }

  async setBillingConfig(
    tenantId: string,
    config: Record<string, any>,
  ): Promise<TenantConfig[]> {
    const configs: TenantConfig[] = [];
    for (const [key, value] of Object.entries(config)) {
      configs.push(
        await this.setConfig(tenantId, key, value, ConfigType.BILLING),
      );
    }
    return configs;
  }

  async setFeaturesConfig(
    tenantId: string,
    config: Record<string, any>,
  ): Promise<TenantConfig[]> {
    const configs: TenantConfig[] = [];
    for (const [key, value] of Object.entries(config)) {
      configs.push(
        await this.setConfig(tenantId, key, value, ConfigType.FEATURES),
      );
    }
    return configs;
  }

  async setIntegrationsConfig(
    tenantId: string,
    config: Record<string, any>,
  ): Promise<TenantConfig[]> {
    const configs: TenantConfig[] = [];
    for (const [key, value] of Object.entries(config)) {
      configs.push(
        await this.setConfig(tenantId, key, value, ConfigType.INTEGRATIONS),
      );
    }
    return configs;
  }

  async getConfigKeys(
    tenantId: string,
    configType?: ConfigType,
  ): Promise<string[]> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    const where: any = {
      tenant: { id: tenantId },
      isActive: true,
    };

    if (configType) {
      where.configType = configType;
    }

    const configs = await this.configRepository.find({
      where,
      select: ['key'],
    });

    return configs.map((config) => config.key);
  }

  async migrateConfig(
    tenantId: string,
    newConfigs: Record<string, any>,
  ): Promise<void> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    // Get all existing active configs
    const existingConfigs = await this.configRepository.find({
      where: {
        tenant: { id: tenantId },
        isActive: true,
      },
    });

    // Create map of existing config keys
    const existingConfigKeys = new Set(
      existingConfigs.map((config) => config.key),
    );

    // Update or create configs
    const configEntries = Object.entries(newConfigs);
    const configsToUpdate: Array<{
      key: string;
      value: any;
      type: ConfigType;
    }> = [];
    const configsToCreate: Array<{
      key: string;
      value: any;
      type: ConfigType;
    }> = [];

    for (const [key, configObject] of configEntries) {
      const value = configObject.value;
      const type = configObject.type || ConfigType.GENERAL;

      if (existingConfigKeys.has(key)) {
        configsToUpdate.push({ key, value, type });
      } else {
        configsToCreate.push({ key, value, type });
      }
    }

    // Update existing configs
    for (const { key, value, type } of configsToUpdate) {
      await this.updateConfig(tenantId, key, value);
      // Update type if needed
      const config = await this.configRepository.findOne({
        where: { tenant: { id: tenantId }, key, isActive: true },
      });
      if (config && config.configType !== type) {
        config.configType = type;
        await this.configRepository.save(config);
      }
    }

    // Create new configs
    for (const { key, value, type } of configsToCreate) {
      await this.setConfig(tenantId, key, value, type);
    }

    // Audit log
    await this.auditService.logAction(
      'tenant.config.migrated',
      'system',
      tenantId,
      {
        updated: configsToUpdate.length,
        created: configsToCreate.length,
        total: configEntries.length,
      },
    );
  }
}
