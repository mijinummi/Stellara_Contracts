import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantService } from '../tenant.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly tenantService: TenantService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Get tenant ID from request parameters or headers
    const tenantId = this.extractTenantId(request);

    if (!tenantId) {
      // If no tenant ID is required for this route, allow access
      const isPublic = this.reflector.get<boolean>(
        'isPublic',
        context.getHandler(),
      );
      return isPublic || true;
    }

    // Validate tenant access
    const hasAccess = await this.tenantService.validateTenantAccess(
      tenantId,
      user.id,
    );

    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this tenant');
    }

    // Attach tenant context to request
    request.tenantId = tenantId;
    request.tenant = await this.tenantService.findOne(tenantId);

    return true;
  }

  private extractTenantId(request: any): string | null {
    // Try to get tenant ID from route parameters
    if (request.params?.tenantId) {
      return request.params.tenantId;
    }

    // Try to get tenant ID from query parameters
    if (request.query?.tenantId) {
      return request.query.tenantId;
    }

    // Try to get tenant ID from headers
    if (request.headers?.['x-tenant-id']) {
      return request.headers['x-tenant-id'];
    }

    // Try to get tenant ID from subdomain (if applicable)
    if (request.headers?.host) {
      const host = request.headers.host;
      const subdomainMatch = host.match(/^([^.]+)\./);
      if (subdomainMatch) {
        return subdomainMatch[1];
      }
    }

    return null;
  }
}
