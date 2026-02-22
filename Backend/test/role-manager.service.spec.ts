import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleManagerService } from '../src/auth/services/role-manager.service';
import { User } from '../src/auth/entities/user.entity';
import { Role } from '../src/auth/roles.enum';
import { RoleHierarchy } from '../src/auth/entities/role-hierarchy.entity';
import {
  PermissionAudit,
  PermissionAction,
} from '../src/auth/entities/permission-audit.entity';
import { Permission } from '../src/auth/entities/permission.entity';
import { UserPermission } from '../src/auth/entities/user-permission.entity';

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
  });
});
