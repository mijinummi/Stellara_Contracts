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
} from '@nestjs/common';
import { RoleManagerService } from '../services/role-manager.service';
import {
  EnhancedRolesGuard,
  Permissions,
  Roles,
} from '../guards/enhanced-roles.guard';
import { Role } from '../roles.enum';

@Controller('permissions')
@UseGuards(EnhancedRolesGuard)
export class PermissionController {
  constructor(private readonly roleManagerService: RoleManagerService) {}

  @Get('user/:userId')
  @Permissions('view_permissions')
  async getUserPermissions(@Param('userId') userId: string) {
    return await this.roleManagerService.getUserPermissions(userId);
  }

  @Post('user/:userId/grant')
  @Permissions('manage_permissions')
  async grantUserPermission(
    @Param('userId') userId: string,
    @Body() body: { permissionName: string },
    @Body('performedBy') performedBy: string,
  ) {
    return await this.roleManagerService.grantUserPermission(
      userId,
      body.permissionName,
      performedBy,
    );
  }

  @Delete('user/:userId/revoke')
  @Permissions('manage_permissions')
  async revokeUserPermission(
    @Param('userId') userId: string,
    @Body() body: { permissionName: string },
    @Body('performedBy') performedBy: string,
  ) {
    await this.roleManagerService.revokeUserPermission(
      userId,
      body.permissionName,
      performedBy,
    );
    return { message: 'Permission revoked successfully' };
  }

  @Put('user/:userId/role')
  @Permissions('manage_roles')
  async assignRole(
    @Param('userId') userId: string,
    @Body() body: { role: Role; assignedBy: string },
  ) {
    return await this.roleManagerService.assignRole(
      userId,
      body.role,
      body.assignedBy,
    );
  }

  @Post('hierarchy')
  @Permissions('manage_roles')
  async createRoleHierarchy(
    @Body() body: { childRole: Role; parentRole: Role },
  ) {
    return await this.roleManagerService.createRoleHierarchy(
      body.childRole,
      body.parentRole,
    );
  }

  @Get('user/:userId/audit')
  @Permissions('view_audit_logs')
  async getPermissionAuditTrail(@Param('userId') userId: string) {
    return await this.roleManagerService.getPermissionAuditTrail(userId);
  }

  @Get('user/:userId/has/:permission')
  @Permissions('view_permissions')
  async hasPermission(
    @Param('userId') userId: string,
    @Param('permission') permissionName: string,
  ) {
    return {
      userId,
      permission: permissionName,
      hasPermission: await this.roleManagerService.hasPermission(
        userId,
        permissionName,
      ),
    };
  }

  @Get('user/:userId/roles')
  @Permissions('view_permissions')
  async getUserRoleHierarchy(@Param('userId') userId: string) {
    return await this.roleManagerService.getUserRoleHierarchy(userId);
  }
}
