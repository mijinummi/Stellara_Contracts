import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class AddTenantSchema1737456789000 implements MigrationInterface {
  name = 'AddTenantSchema1737456789000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create tenants table
    await queryRunner.createTable(
      new Table({
        name: 'tenants',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'slug',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'name',
            type: 'varchar',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'inactive', 'suspended', 'pending'],
            default: `'pending'`,
          },
          {
            name: 'billingPlan',
            type: 'enum',
            enum: ['free', 'starter', 'pro', 'enterprise'],
            default: `'free'`,
          },
          {
            name: 'stripeCustomerId',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            default: `'{}'`,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'suspendedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'activatedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
    );

    // Create tenant_configs table
    await queryRunner.createTable(
      new Table({
        name: 'tenant_configs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'tenantId',
            type: 'uuid',
          },
          {
            name: 'configType',
            type: 'enum',
            enum: ['general', 'auth', 'billing', 'features', 'integrations'],
            default: `'general'`,
          },
          {
            name: 'key',
            type: 'varchar',
          },
          {
            name: 'value',
            type: 'jsonb',
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
    );

    // Create tenant_usage table
    await queryRunner.createTable(
      new Table({
        name: 'tenant_usage',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'tenantId',
            type: 'uuid',
          },
          {
            name: 'metric',
            type: 'enum',
            enum: [
              'api_calls',
              'storage_bytes',
              'users_count',
              'transactions',
              'workflow_executions',
            ],
          },
          {
            name: 'value',
            type: 'bigint',
          },
          {
            name: 'date',
            type: 'date',
          },
          {
            name: 'metadata',
            type: 'jsonb',
            default: `'{}'`,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
    );

    // Create tenant_invitations table
    await queryRunner.createTable(
      new Table({
        name: 'tenant_invitations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'tenantId',
            type: 'uuid',
          },
          {
            name: 'email',
            type: 'varchar',
          },
          {
            name: 'role',
            type: 'varchar',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'accepted', 'expired', 'revoked'],
            default: `'pending'`,
          },
          {
            name: 'token',
            type: 'varchar',
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
          },
          {
            name: 'metadata',
            type: 'jsonb',
            default: `'{}'`,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'acceptedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
    );

    // Add tenantId column to users table
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'tenantId',
        type: 'uuid',
        isNullable: true,
      }),
    );

    // Create foreign key constraints
    await queryRunner.createForeignKey(
      'tenant_configs',
      new TableForeignKey({
        columnNames: ['tenantId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'tenants',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'tenant_usage',
      new TableForeignKey({
        columnNames: ['tenantId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'tenants',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'tenant_invitations',
      new TableForeignKey({
        columnNames: ['tenantId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'tenants',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        columnNames: ['tenantId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'tenants',
        onDelete: 'SET NULL',
      }),
    );

    // Create indexes for better performance
    await queryRunner.createIndex(
      'tenants',
      new TableIndex({
        name: 'IDX_TENANTS_SLUG',
        columnNames: ['slug'],
      }),
    );

    await queryRunner.createIndex(
      'tenants',
      new TableIndex({
        name: 'IDX_TENANTS_STATUS',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'tenant_configs',
      new TableIndex({
        name: 'IDX_TENANT_CONFIGS_TENANT_ID',
        columnNames: ['tenantId'],
      }),
    );

    await queryRunner.createIndex(
      'tenant_configs',
      new TableIndex({
        name: 'IDX_TENANT_CONFIGS_KEY',
        columnNames: ['key'],
      }),
    );

    await queryRunner.createIndex(
      'tenant_usage',
      new TableIndex({
        name: 'IDX_TENANT_USAGE_TENANT_ID',
        columnNames: ['tenantId'],
      }),
    );

    await queryRunner.createIndex(
      'tenant_usage',
      new TableIndex({
        name: 'IDX_TENANT_USAGE_METRIC',
        columnNames: ['metric'],
      }),
    );

    await queryRunner.createIndex(
      'tenant_usage',
      new TableIndex({
        name: 'IDX_TENANT_USAGE_DATE',
        columnNames: ['date'],
      }),
    );

    await queryRunner.createIndex(
      'tenant_invitations',
      new TableIndex({
        name: 'IDX_TENANT_INVITATIONS_TENANT_ID',
        columnNames: ['tenantId'],
      }),
    );

    await queryRunner.createIndex(
      'tenant_invitations',
      new TableIndex({
        name: 'IDX_TENANT_INVITATIONS_TOKEN',
        columnNames: ['token'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'tenant_invitations',
      new TableIndex({
        name: 'IDX_TENANT_INVITATIONS_EMAIL',
        columnNames: ['email'],
      }),
    );

    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'IDX_USERS_TENANT_ID',
        columnNames: ['tenantId'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.dropIndex('users', 'IDX_USERS_TENANT_ID');
    await queryRunner.dropIndex(
      'tenant_invitations',
      'IDX_TENANT_INVITATIONS_EMAIL',
    );
    await queryRunner.dropIndex(
      'tenant_invitations',
      'IDX_TENANT_INVITATIONS_TOKEN',
    );
    await queryRunner.dropIndex(
      'tenant_invitations',
      'IDX_TENANT_INVITATIONS_TENANT_ID',
    );
    await queryRunner.dropIndex('tenant_usage', 'IDX_TENANT_USAGE_DATE');
    await queryRunner.dropIndex('tenant_usage', 'IDX_TENANT_USAGE_METRIC');
    await queryRunner.dropIndex('tenant_usage', 'IDX_TENANT_USAGE_TENANT_ID');
    await queryRunner.dropIndex('tenant_configs', 'IDX_TENANT_CONFIGS_KEY');
    await queryRunner.dropIndex(
      'tenant_configs',
      'IDX_TENANT_CONFIGS_TENANT_ID',
    );
    await queryRunner.dropIndex('tenants', 'IDX_TENANTS_STATUS');
    await queryRunner.dropIndex('tenants', 'IDX_TENANTS_SLUG');

    // Drop foreign key constraints
    const tableNames = [
      'tenant_configs',
      'tenant_usage',
      'tenant_invitations',
      'users',
    ];
    for (const tableName of tableNames) {
      const table = await queryRunner.getTable(tableName);
      if (table) {
        const foreignKeys = table.foreignKeys.filter(
          (fk) => fk.columnNames.indexOf('tenantId') !== -1,
        );
        for (const foreignKey of foreignKeys) {
          await queryRunner.dropForeignKey(tableName, foreignKey);
        }
      }
    }

    // Remove tenantId column from users table
    await queryRunner.dropColumn('users', 'tenantId');

    // Drop tables
    await queryRunner.dropTable('tenant_invitations');
    await queryRunner.dropTable('tenant_usage');
    await queryRunner.dropTable('tenant_configs');
    await queryRunner.dropTable('tenants');
  }
}
