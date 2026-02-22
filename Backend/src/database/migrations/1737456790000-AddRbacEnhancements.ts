import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
} from 'typeorm';
import { Role } from '../../auth/roles.enum';

export class AddRbacEnhancements1737456790000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create permissions table
    await queryRunner.createTable(
      new Table({
        name: 'permissions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'description',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create permission_groups table
    await queryRunner.createTable(
      new Table({
        name: 'permission_groups',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'description',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create permission_group_permissions junction table
    await queryRunner.createTable(
      new Table({
        name: 'permission_group_permissions',
        columns: [
          {
            name: 'permission_group_id',
            type: 'uuid',
          },
          {
            name: 'permission_id',
            type: 'uuid',
          },
        ],
      }),
      true,
    );

    // Create user_permissions table
    await queryRunner.createTable(
      new Table({
        name: 'user_permissions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'permission_id',
            type: 'uuid',
          },
          {
            name: 'granted_by',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create permission_audits table
    await queryRunner.createTable(
      new Table({
        name: 'permission_audits',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'permission_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'role_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'action',
            type: 'varchar',
          },
          {
            name: 'details',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'performed_by',
            type: 'varchar',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create role_hierarchies table
    await queryRunner.createTable(
      new Table({
        name: 'role_hierarchies',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'child_role',
            type: 'varchar',
          },
          {
            name: 'parent_role',
            type: 'varchar',
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Add foreign key constraints
    await queryRunner.createForeignKey(
      'permission_group_permissions',
      new TableForeignKey({
        columnNames: ['permission_group_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'permission_groups',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'permission_group_permissions',
      new TableForeignKey({
        columnNames: ['permission_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'permissions',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'user_permissions',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'user_permissions',
      new TableForeignKey({
        columnNames: ['permission_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'permissions',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'permission_audits',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'permission_audits',
      new TableForeignKey({
        columnNames: ['permission_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'permissions',
        onDelete: 'SET NULL',
      }),
    );

    // Add role column to users table
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'role',
        type: 'varchar',
        default: `'${Role.USER}'`,
      }),
    );

    // Insert default permissions
    await queryRunner.query(`
      INSERT INTO permissions (name, description) VALUES
      ('view_permissions', 'View user permissions'),
      ('manage_permissions', 'Manage user permissions'),
      ('manage_roles', 'Manage user roles'),
      ('view_audit_logs', 'View permission audit logs'),
      ('moderate_content', 'Moderate content'),
      ('requeue_jobs', 'Requeue background jobs'),
      ('register_webhooks', 'Register webhooks'),
      ('manage_tenant', 'Manage tenant settings');
    `);

    // Insert default role hierarchies
    await queryRunner.query(`
      INSERT INTO role_hierarchies (child_role, parent_role) VALUES
      ('${Role.MODERATOR}', '${Role.USER}'),
      ('${Role.ADMIN}', '${Role.MODERATOR}'),
      ('${Role.TENANT_ADMIN}', '${Role.USER}'),
      ('${Role.SUPERADMIN}', '${Role.ADMIN}'),
      ('${Role.SUPERADMIN}', '${Role.TENANT_ADMIN}');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraints first
    const table = await queryRunner.getTable('permission_group_permissions');
    const userPermissionsTable = await queryRunner.getTable('user_permissions');
    const permissionAuditsTable =
      await queryRunner.getTable('permission_audits');

    if (table) {
      const foreignKeys = table.foreignKeys.filter(
        (fk) =>
          fk.columnNames.indexOf('permission_group_id') !== -1 ||
          fk.columnNames.indexOf('permission_id') !== -1,
      );
      await queryRunner.dropForeignKeys(table, foreignKeys);
    }

    if (userPermissionsTable) {
      const foreignKeys = userPermissionsTable.foreignKeys.filter(
        (fk) =>
          fk.columnNames.indexOf('user_id') !== -1 ||
          fk.columnNames.indexOf('permission_id') !== -1,
      );
      await queryRunner.dropForeignKeys(userPermissionsTable, foreignKeys);
    }

    if (permissionAuditsTable) {
      const foreignKeys = permissionAuditsTable.foreignKeys.filter(
        (fk) =>
          fk.columnNames.indexOf('user_id') !== -1 ||
          fk.columnNames.indexOf('permission_id') !== -1,
      );
      await queryRunner.dropForeignKeys(permissionAuditsTable, foreignKeys);
    }

    // Remove role column from users
    await queryRunner.dropColumn('users', 'role');

    // Drop tables
    await queryRunner.dropTable('role_hierarchies', true);
    await queryRunner.dropTable('permission_audits', true);
    await queryRunner.dropTable('user_permissions', true);
    await queryRunner.dropTable('permission_group_permissions', true);
    await queryRunner.dropTable('permission_groups', true);
    await queryRunner.dropTable('permissions', true);
  }
}
