import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Role } from '../roles.enum';
import { RoleHierarchy } from '../entities/role-hierarchy.entity';
import {
  PermissionAudit,
  PermissionAction,
} from '../entities/permission-audit.entity';
import { Permission } from '../entities/permission.entity';
import { UserPermission } from '../entities/user-permission.entity';

@Injectable()
export class RoleManagerService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RoleHierarchy)
    private readonly roleHierarchyRepository: Repository<RoleHierarchy>,
    @InjectRepository(PermissionAudit)
    private readonly permissionAuditRepository: Repository<PermissionAudit>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(UserPermission)
    private readonly userPermissionRepository: Repository<UserPermission>,
  ) {}

  async assignRole(
    userId: string,
    newRole: Role,
    assignedBy: string,
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const oldRole = user.role;
    user.role = newRole;
    const updatedUser = await this.userRepository.save(user);

    // Log the role change
    await this.logPermissionAudit({
      userId,
      roleId: newRole,
      action: PermissionAction.MODIFIED,
      details: { oldRole, newRole },
      performedBy: assignedBy,
    });

    return updatedUser;
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['userPermissions', 'userPermissions.permission'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get permissions from role
    const rolePermissions = this.getRolePermissions(user.role);

    // Get user-specific permissions
    const userPermissions = user.userPermissions
      .filter(
        (up) => up.isActive && (!up.expiresAt || up.expiresAt > new Date()),
      )
      .map((up) => up.permission.name);

    // Combine and deduplicate
    return [...new Set([...rolePermissions, ...userPermissions])];
  }

  async grantUserPermission(
    userId: string,
    permissionName: string,
    grantedBy: string,
  ): Promise<UserPermission> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const permission = await this.permissionRepository.findOne({
      where: { name: permissionName },
    });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    const existingUserPermission = await this.userPermissionRepository.findOne({
      where: { user: { id: userId }, permission: { id: permission.id } },
    });

    if (existingUserPermission) {
      existingUserPermission.isActive = true;
      existingUserPermission.grantedBy = grantedBy;
      return await this.userPermissionRepository.save(existingUserPermission);
    }

    const userPermission = this.userPermissionRepository.create({
      user,
      permission,
      grantedBy,
      isActive: true,
    });

    const result = await this.userPermissionRepository.save(userPermission);

    await this.logPermissionAudit({
      userId,
      permissionId: permission.id,
      action: PermissionAction.GRANTED,
      details: { permissionName },
      performedBy: grantedBy,
    });

    return result;
  }

  async revokeUserPermission(
    userId: string,
    permissionName: string,
    revokedBy: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const permission = await this.permissionRepository.findOne({
      where: { name: permissionName },
    });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    const userPermission = await this.userPermissionRepository.findOne({
      where: { user: { id: userId }, permission: { id: permission.id } },
    });

    if (userPermission) {
      userPermission.isActive = false;
      await this.userPermissionRepository.save(userPermission);

      await this.logPermissionAudit({
        userId,
        permissionId: permission.id,
        action: PermissionAction.REVOKED,
        details: { permissionName },
        performedBy: revokedBy,
      });
    }
  }

  async createRoleHierarchy(
    childRole: Role,
    parentRole: Role,
  ): Promise<RoleHierarchy> {
    const existing = await this.roleHierarchyRepository.findOne({
      where: { childRole, parentRole },
    });

    if (existing) {
      return existing;
    }

    const hierarchy = this.roleHierarchyRepository.create({
      childRole,
      parentRole,
      isActive: true,
    });

    return await this.roleHierarchyRepository.save(hierarchy);
  }

  async getRoleHierarchy(role: Role): Promise<Role[]> {
    const hierarchies = await this.roleHierarchyRepository.find({
      where: { childRole: role, isActive: true },
    });

    const parentRoles = hierarchies.map((h) => h.parentRole);
    return [role, ...parentRoles];
  }

  async getUserRoleHierarchy(userId: string): Promise<Role[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return await this.getRoleHierarchy(user.role);
  }

  private getRolePermissions(role: Role): string[] {
    // This would integrate with the RBAC config
    const rolePermissionsMap = {
      [Role.USER]: [],
      [Role.MODERATOR]: ['moderate_content'],
      [Role.ADMIN]: [
        'moderate_content',
        'view_audit_logs',
        'requeue_jobs',
        'register_webhooks',
      ],
      [Role.TENANT_ADMIN]: ['manage_tenant'],
      [Role.SUPERADMIN]: ['*'], // All permissions
    };

    return rolePermissionsMap[role] || [];
  }

  private async logPermissionAudit(auditData: {
    userId: string;
    permissionId?: string;
    roleId?: string;
    action: PermissionAction;
    details?: Record<string, any>;
    performedBy: string;
  }): Promise<void> {
    const audit = this.permissionAuditRepository.create(auditData);
    await this.permissionAuditRepository.save(audit);
  }

  async hasPermission(
    userId: string,
    permissionName: string,
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.includes(permissionName) || permissions.includes('*');
  }

  async getPermissionAuditTrail(userId: string): Promise<PermissionAudit[]> {
    return await this.permissionAuditRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }
}
