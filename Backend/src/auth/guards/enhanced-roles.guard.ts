import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleManagerService } from '../services/role-manager.service';

export const PERMISSIONS_KEY = 'permissions';
export const ROLES_KEY = 'roles';

export const Permissions = (...permissions: string[]) => {
  return (
    target: any,
    propertyKey?: string,
    descriptor?: PropertyDescriptor,
  ) => {
    if (propertyKey && descriptor) {
      Reflect.defineMetadata(PERMISSIONS_KEY, permissions, descriptor.value);
      return descriptor;
    }
    Reflect.defineMetadata(PERMISSIONS_KEY, permissions, target);
    return target;
  };
};

export const Roles = (...roles: string[]) => {
  return (
    target: any,
    propertyKey?: string,
    descriptor?: PropertyDescriptor,
  ) => {
    if (propertyKey && descriptor) {
      Reflect.defineMetadata(ROLES_KEY, roles, descriptor.value);
      return descriptor;
    }
    Reflect.defineMetadata(ROLES_KEY, roles, target);
    return target;
  };
};

@Injectable()
export class EnhancedRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RoleManagerService)
    private readonly roleManagerService: RoleManagerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check for required permissions first
    const requiredPermissions = this.reflector.get<string[]>(
      PERMISSIONS_KEY,
      context.getHandler(),
    );

    // Check for required roles
    const requiredRoles = this.reflector.get<string[]>(
      ROLES_KEY,
      context.getHandler(),
    );

    // If no permissions or roles required, allow access
    if (
      (!requiredPermissions || requiredPermissions.length === 0) &&
      (!requiredRoles || requiredRoles.length === 0)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.id) {
      throw new ForbiddenException('User not authenticated');
    }

    // Check role-based access
    if (requiredRoles && requiredRoles.length > 0) {
      const userRoles = await this.roleManagerService.getUserRoleHierarchy(
        user.id,
      );
      const hasRequiredRole = requiredRoles.some((requiredRole) =>
        userRoles.includes(requiredRole as any),
      );

      if (!hasRequiredRole) {
        throw new ForbiddenException(
          `Required roles: ${requiredRoles.join(' or ')}. User roles: ${userRoles.join(', ')}`,
        );
      }
    }

    // Check permission-based access
    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions = await this.roleManagerService.getUserPermissions(
        user.id,
      );

      const hasRequiredPermission = requiredPermissions.every(
        (permission) =>
          userPermissions.includes(permission) || userPermissions.includes('*'),
      );

      if (!hasRequiredPermission) {
        throw new ForbiddenException(
          `Required permissions: ${requiredPermissions.join(', ')}. User permissions: ${userPermissions.join(', ')}`,
        );
      }
    }

    return true;
  }
}
