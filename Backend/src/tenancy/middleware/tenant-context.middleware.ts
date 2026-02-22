import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantService } from '../tenant.service';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly tenantService: TenantService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Extract tenant identifier from request
    const tenantId = this.extractTenantId(req);

    if (tenantId) {
      try {
        // Validate and fetch tenant
        const tenant = await this.tenantService.findOne(tenantId);

        if (tenant && tenant.isActive) {
          // Attach tenant context to request
          (req as any).tenantId = tenantId;
          (req as any).tenant = tenant;
        }
      } catch (error) {
        // If tenant not found or inactive, continue without tenant context
        console.warn(`Tenant context not available for ID: ${tenantId}`);
      }
    }

    next();
  }

  private extractTenantId(req: Request): string | null {
    // Try to get tenant ID from headers
    const tenantIdHeader = req.headers['x-tenant-id'];
    if (tenantIdHeader) {
      if (typeof tenantIdHeader === 'string') {
        return tenantIdHeader;
      } else if (Array.isArray(tenantIdHeader) && tenantIdHeader.length > 0) {
        return tenantIdHeader[0];
      }
    }

    // Try to get tenant ID from subdomain
    if (req.headers.host) {
      const host = req.headers.host;
      // Extract subdomain (e.g., "tenant1.example.com" -> "tenant1")
      const subdomainMatch = host.match(/^([^.]+)\./);
      if (subdomainMatch) {
        return subdomainMatch[1];
      }
    }

    // Try to get tenant ID from query parameters
    if (req.query.tenantId && typeof req.query.tenantId === 'string') {
      return req.query.tenantId;
    }

    // Try to get tenant ID from route parameters
    const tenantIdParam = req.params.tenantId;
    if (tenantIdParam) {
      if (typeof tenantIdParam === 'string') {
        return tenantIdParam;
      } else if (Array.isArray(tenantIdParam) && tenantIdParam.length > 0) {
        return tenantIdParam[0];
      }
    }

    return null;
  }
}
