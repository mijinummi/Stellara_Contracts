import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleManagerService } from './services/role-manager.service';
import { User } from './entities/user.entity';
import { RoleHierarchy } from './entities/role-hierarchy.entity';
import {
  PermissionAction,
  PermissionAudit,
} from './entities/permission-audit.entity';
import { Permission } from './entities/permission.entity';
import { UserPermission } from './entities/user-permission.entity';
import { Role } from './roles.enum';

describe('RoleManagerService', () => {
  let service: RoleManagerService;
  let userRepository: Repository<User>;
  let roleHierarchyRepository: Repository<RoleHierarchy>;
  let permissionAuditRepository: Repository<PermissionAudit>;
  let permissionRepository: Repository<Permission>;
  let userPermissionRepository: Repository<UserPermission>;

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockRoleHierarchyRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockPermissionAuditRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const mockPermissionRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockUserPermissionRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleManagerService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(RoleHierarchy),
          useValue: mockRoleHierarchyRepository,
        },
        {
          provide: getRepositoryToken(PermissionAudit),
          useValue: mockPermissionAuditRepository,
        },
        {
          provide: getRepositoryToken(Permission),
          useValue: mockPermissionRepository,
        },
        {
          provide: getRepositoryToken(UserPermission),
          useValue: mockUserPermissionRepository,
        },
      ],
    }).compile();

    service = module.get<RoleManagerService>(RoleManagerService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    roleHierarchyRepository = module.get<Repository<RoleHierarchy>>(
      getRepositoryToken(RoleHierarchy),
    );
    permissionAuditRepository = module.get<Repository<PermissionAudit>>(
      getRepositoryToken(PermissionAudit),
    );
    permissionRepository = module.get<Repository<Permission>>(
      getRepositoryToken(Permission),
    );
    userPermissionRepository = module.get<Repository<UserPermission>>(
      getRepositoryToken(UserPermission),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assignRole', () => {
    it('should assign a role to a user', async () => {
      const userId = 'user-1';
      const newRole = Role.ADMIN;
      const assignedBy = 'admin-user';

      const mockUser = { id: userId, role: Role.USER } as User;
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue({ ...mockUser, role: newRole });

      const result = await service.assignRole(userId, newRole, assignedBy);

      expect(result.role).toBe(newRole);
      expect(mockUserRepository.save).toHaveBeenCalledWith({
        ...mockUser,
        role: newRole,
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      const userId = 'non-existent-user';
      const newRole = Role.ADMIN;
      const assignedBy = 'admin-user';

      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.assignRole(userId, newRole, assignedBy),
      ).rejects.toThrow('User not found');
    });
  });

  describe('getUserPermissions', () => {
    it('should return user permissions including role-based permissions', async () => {
      const userId = 'user-1';

      const mockUser = {
        id: userId,
        role: Role.ADMIN,
        userPermissions: [
          {
            isActive: true,
            expiresAt: null,
            permission: { name: 'custom_permission' },
          },
        ],
      } as any;

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.getUserPermissions(userId);

      expect(result).toContain('moderate_content');
      expect(result).toContain('view_audit_logs');
      expect(result).toContain('requeue_jobs');
      expect(result).toContain('register_webhooks');
      expect(result).toContain('custom_permission');
    });

    it('should filter out expired permissions', async () => {
      const userId = 'user-1';
      const expiredDate = new Date(Date.now() - 10000); // 10 seconds ago

      const mockUser = {
        id: userId,
        role: Role.USER,
        userPermissions: [
          {
            isActive: true,
            expiresAt: expiredDate,
            permission: { name: 'expired_permission' },
          },
        ],
      } as any;

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.getUserPermissions(userId);

      expect(result).not.toContain('expired_permission');
    });
  });

  describe('grantUserPermission', () => {
    it('should grant a permission to a user', async () => {
      const userId = 'user-1';
      const permissionName = 'test_permission';
      const grantedBy = 'admin-user';

      const mockUser = { id: userId } as User;
      const mockPermission = {
        id: 'perm-1',
        name: permissionName,
      } as Permission;
      const mockUserPermission = {
        id: 'user-perm-1',
        user: mockUser,
        permission: mockPermission,
        grantedBy,
        isActive: true,
      } as UserPermission;

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockPermissionRepository.findOne.mockResolvedValue(mockPermission);
      mockUserPermissionRepository.findOne.mockResolvedValue(null);
      mockUserPermissionRepository.create.mockReturnValue(mockUserPermission);
      mockUserPermissionRepository.save.mockResolvedValue(mockUserPermission);

      const result = await service.grantUserPermission(
        userId,
        permissionName,
        grantedBy,
      );

      expect(result.permission.name).toBe(permissionName);
      expect(result.grantedBy).toBe(grantedBy);
    });

    it('should reactivate existing permission if it exists', async () => {
      const userId = 'user-1';
      const permissionName = 'existing_permission';
      const grantedBy = 'admin-user';

      const mockUser = { id: userId } as User;
      const mockPermission = {
        id: 'perm-1',
        name: permissionName,
      } as Permission;
      const existingUserPermission = {
        id: 'user-perm-1',
        user: mockUser,
        permission: mockPermission,
        grantedBy: 'previous-admin',
        isActive: false,
        save: jest.fn(),
      } as any;

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockPermissionRepository.findOne.mockResolvedValue(mockPermission);
      mockUserPermissionRepository.findOne.mockResolvedValue(
        existingUserPermission,
      );
      mockUserPermissionRepository.save.mockResolvedValue({
        ...existingUserPermission,
        isActive: true,
      });

      const result = await service.grantUserPermission(
        userId,
        permissionName,
        grantedBy,
      );

      expect(result.isActive).toBe(true);
      expect(result.grantedBy).toBe(grantedBy);
    });
  });

  describe('revokeUserPermission', () => {
    it('should revoke a user permission', async () => {
      const userId = 'user-1';
      const permissionName = 'test_permission';
      const revokedBy = 'admin-user';

      const mockUser = { id: userId } as User;
      const mockPermission = {
        id: 'perm-1',
        name: permissionName,
      } as Permission;
      const mockUserPermission = {
        id: 'user-perm-1',
        user: mockUser,
        permission: mockPermission,
        isActive: true,
        save: jest.fn(),
      } as any;

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockPermissionRepository.findOne.mockResolvedValue(mockPermission);
      mockUserPermissionRepository.findOne.mockResolvedValue(
        mockUserPermission,
      );
      mockUserPermissionRepository.save.mockResolvedValue({
        ...mockUserPermission,
        isActive: false,
      });

      await service.revokeUserPermission(userId, permissionName, revokedBy);

      expect(mockUserPermissionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });
  });

  describe('createRoleHierarchy', () => {
    it('should create a new role hierarchy', async () => {
      const childRole = Role.MODERATOR;
      const parentRole = Role.ADMIN;

      const mockHierarchy = {
        id: 'hierarchy-1',
        childRole,
        parentRole,
        isActive: true,
      } as RoleHierarchy;

      mockRoleHierarchyRepository.findOne.mockResolvedValue(null);
      mockRoleHierarchyRepository.create.mockReturnValue(mockHierarchy);
      mockRoleHierarchyRepository.save.mockResolvedValue(mockHierarchy);

      const result = await service.createRoleHierarchy(childRole, parentRole);

      expect(result.childRole).toBe(childRole);
      expect(result.parentRole).toBe(parentRole);
    });

    it('should return existing hierarchy if it already exists', async () => {
      const childRole = Role.MODERATOR;
      const parentRole = Role.ADMIN;

      const existingHierarchy = {
        id: 'hierarchy-1',
        childRole,
        parentRole,
        isActive: true,
      } as RoleHierarchy;

      mockRoleHierarchyRepository.findOne.mockResolvedValue(existingHierarchy);

      const result = await service.createRoleHierarchy(childRole, parentRole);

      expect(result).toBe(existingHierarchy);
      expect(mockRoleHierarchyRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('getRoleHierarchy', () => {
    it('should return role hierarchy including parent roles', async () => {
      const role = Role.MODERATOR;

      const mockHierarchies = [
        { parentRole: Role.ADMIN },
        { parentRole: Role.SUPERADMIN },
      ] as RoleHierarchy[];

      mockRoleHierarchyRepository.find.mockResolvedValue(mockHierarchies);

      const result = await service.getRoleHierarchy(role);

      expect(result).toEqual([role, Role.ADMIN, Role.SUPERADMIN]);
    });
  });

  describe('hasPermission', () => {
    it('should return true when user has the permission', async () => {
      const userId = 'user-1';
      const permissionName = 'moderate_content';

      mockUserRepository.findOne.mockResolvedValue({
        id: userId,
        role: Role.MODERATOR,
        userPermissions: [],
      });

      const result = await service.hasPermission(userId, permissionName);

      expect(result).toBe(true);
    });

    it('should return false when user does not have the permission', async () => {
      const userId = 'user-1';
      const permissionName = 'admin_only_permission';

      mockUserRepository.findOne.mockResolvedValue({
        id: userId,
        role: Role.USER,
        userPermissions: [],
      });

      const result = await service.hasPermission(userId, permissionName);

      expect(result).toBe(false);
    });
  });

  describe('getPermissionAuditTrail', () => {
    it('should return audit trail for a user', async () => {
      const userId = 'user-1';
      const mockAudits = [
        {
          id: 'audit-1',
          userId,
          action: PermissionAction.GRANTED,
          createdAt: new Date(),
        },
        {
          id: 'audit-2',
          userId,
          action: PermissionAction.REVOKED,
          createdAt: new Date(),
        },
      ] as PermissionAudit[];

      mockPermissionAuditRepository.find.mockResolvedValue(mockAudits);

      const result = await service.getPermissionAuditTrail(userId);

      expect(result).toHaveLength(2);
      expect(result[0].userId).toBe(userId);
    });
  });
});
