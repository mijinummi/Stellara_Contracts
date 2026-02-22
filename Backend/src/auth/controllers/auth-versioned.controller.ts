import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { NonceService } from '../services/nonce.service';
import { WalletService } from '../services/wallet.service';
import { JwtAuthService } from '../services/jwt-auth.service';
import { ApiTokenService } from '../services/api-token.service';
import { MetricsService } from '../../logging/metrics.service';
import { StructuredLogger } from '../../logging/structured-logger.service';
import { RequestNonceDto } from '../dto/request-nonce.dto';
import { WalletLoginDto } from '../dto/wallet-login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { CreateApiTokenDto } from '../dto/create-api-token.dto';
import { BindWalletDto } from '../dto/bind-wallet.dto';
import { UnbindWalletDto } from '../dto/unbind-wallet.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RateLimitGuard, RateLimit } from '../guards/rate-limit.guard';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../audit/audit.service';
import {
  ApiVersion,
  ApiVersionDeprecated,
} from '../../api-versioning/version.decorators';

@ApiTags('Authentication')
@Controller('auth')
@UseGuards(RateLimitGuard)
@ApiVersion('v1') // This controller supports v1
export class AuthV1Controller {
  constructor(
    private readonly nonceService: NonceService,
    private readonly walletService: WalletService,
    private readonly jwtAuthService: JwtAuthService,
    private readonly apiTokenService: ApiTokenService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly logger: StructuredLogger,
    private readonly metrics: MetricsService,
  ) {}

  @Post('nonce')
  @RateLimit({ limit: 5, windowSeconds: 60, keyPrefix: 'nonce' })
  @ApiOperation({ summary: 'Request a nonce for wallet authentication (v1)' })
  @ApiBody({ type: RequestNonceDto })
  @ApiResponse({
    status: 200,
    description: 'Nonce generated successfully',
    schema: {
      properties: {
        nonce: { type: 'string' },
        expiresAt: { type: 'string', format: 'date-time' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async requestNonce(@Body() dto: RequestNonceDto) {
    return await this.nonceService.generateNonce(dto.publicKey);
  }

  @Post('wallet/login')
  @RateLimit({ limit: 5, windowSeconds: 60, keyPrefix: 'login' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with wallet signature (v1)' })
  @ApiBody({ type: WalletLoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string', nullable: true },
            username: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid signature or nonce' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async walletLogin(@Body() dto: WalletLoginDto) {
    try {
      // Validate nonce
      const nonceRecord = await this.nonceService.validateNonce(
        dto.nonce,
        dto.publicKey,
      );

      // Construct message to verify
      const message = `Sign this message to authenticate with Stellara: ${dto.nonce}`;

      // Verify signature
      const isValid = await this.walletService.verifySignature(
        dto.publicKey,
        dto.signature,
        message,
      );

      if (!isValid) {
        throw new Error('Invalid signature');
      }

      // Mark nonce as used
      await this.nonceService.markNonceUsed(dto.nonce);

      // Find or create user
      let user = await this.walletService.findUserByWallet(dto.publicKey);

      let isNewUser = false;

      if (!user) {
        user = await this.walletService.createUserWithWallet(dto.publicKey);
        isNewUser = true;
      }

      if (isNewUser) {
        await this.auditService.logAction('USER_CREATED', user.id, user.id, {
          wallet: dto.publicKey,
        });
      }

      // Update wallet last used
      await this.walletService.updateLastUsed(dto.publicKey);

      // Generate tokens
      const accessToken = await this.jwtAuthService.generateAccessToken(
        user.id,
      );
      const refreshTokenData = await this.jwtAuthService.generateRefreshToken(
        user.id,
      );

      return {
        accessToken,
        refreshTokenId: refreshTokenData.id,
        refreshToken: refreshTokenData.token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          createdAt: user.createdAt,
        },
      };
    } catch (err) {
      this.logger.error('walletLogin failed', err.stack, AuthV1Controller.name);
      this.metrics.incrementError('high', 'auth');
      throw err;
    }
  }

  // Other endpoints would follow the same pattern...
}

// Example of a V2 controller with enhanced features
@ApiTags('Authentication')
@Controller('auth')
@UseGuards(RateLimitGuard)
@ApiVersion('v2') // This controller supports v2
export class AuthV2Controller {
  constructor(
    private readonly nonceService: NonceService,
    private readonly walletService: WalletService,
    private readonly jwtAuthService: JwtAuthService,
    private readonly apiTokenService: ApiTokenService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly logger: StructuredLogger,
    private readonly metrics: MetricsService,
  ) {}

  @Post('nonce')
  @RateLimit({ limit: 10, windowSeconds: 60, keyPrefix: 'nonce' }) // Increased rate limit
  @ApiOperation({ summary: 'Request a nonce for wallet authentication (v2)' })
  @ApiBody({ type: RequestNonceDto })
  @ApiResponse({
    status: 200,
    description: 'Nonce generated successfully with enhanced security',
    schema: {
      properties: {
        nonce: { type: 'string' },
        expiresAt: { type: 'string', format: 'date-time' },
        message: { type: 'string' },
        securityLevel: { type: 'string', enum: ['standard', 'enhanced'] }, // New field
      },
    },
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async requestNonce(@Body() dto: RequestNonceDto) {
    const nonce = await this.nonceService.generateNonce(dto.publicKey);
    return {
      ...nonce,
      securityLevel: 'enhanced', // Enhanced security in v2
    };
  }

  @Post('wallet/login')
  @RateLimit({ limit: 10, windowSeconds: 60, keyPrefix: 'login' }) // Increased rate limit
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with wallet signature (v2) - Enhanced Security',
  })
  @ApiBody({ type: WalletLoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful with enhanced features',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string', nullable: true },
            username: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            lastLoginAt: { type: 'string', format: 'date-time' }, // New field
            securityLevel: { type: 'string', enum: ['standard', 'enhanced'] }, // New field
          },
        },
        sessionInfo: {
          // New object with session details
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            expiresAt: { type: 'string', format: 'date-time' },
            ip: { type: 'string' },
            userAgent: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid signature or nonce' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async walletLogin(@Body() dto: WalletLoginDto, @Request() req) {
    try {
      // Validate nonce
      const nonceRecord = await this.nonceService.validateNonce(
        dto.nonce,
        dto.publicKey,
      );

      // Construct message to verify
      const message = `Sign this message to authenticate with Stellara: ${dto.nonce}`;

      // Verify signature
      const isValid = await this.walletService.verifySignature(
        dto.publicKey,
        dto.signature,
        message,
      );

      if (!isValid) {
        throw new Error('Invalid signature');
      }

      // Mark nonce as used
      await this.nonceService.markNonceUsed(dto.nonce);

      // Find or create user
      let user = await this.walletService.findUserByWallet(dto.publicKey);

      let isNewUser = false;

      if (!user) {
        user = await this.walletService.createUserWithWallet(dto.publicKey);
        isNewUser = true;
      }

      if (isNewUser) {
        await this.auditService.logAction('USER_CREATED', user.id, user.id, {
          wallet: dto.publicKey,
        });
      }

      // Update wallet last used
      await this.walletService.updateLastUsed(dto.publicKey);

      // Generate tokens
      const accessToken = await this.jwtAuthService.generateAccessToken(
        user.id,
      );
      const refreshTokenData = await this.jwtAuthService.generateRefreshToken(
        user.id,
      );

      // Log session information
      const sessionInfo = {
        sessionId: refreshTokenData.id,
        expiresAt: refreshTokenData.expiresAt,
        ip: req.ip,
        userAgent: req.get('User-Agent') || 'unknown',
      };

      await this.auditService.logAction('USER_LOGIN', user.id, user.id, {
        sessionId: sessionInfo.sessionId,
        ip: sessionInfo.ip,
      });

      return {
        accessToken,
        refreshTokenId: refreshTokenData.id,
        refreshToken: refreshTokenData.token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          createdAt: user.createdAt,
          lastLoginAt: new Date().toISOString(), // New field
          securityLevel: 'enhanced', // New field
        },
        sessionInfo, // New object
      };
    } catch (err) {
      this.logger.error('walletLogin failed', err.stack, AuthV2Controller.name);
      this.metrics.incrementError('high', 'auth');
      throw err;
    }
  }
}

// Example of a deprecated endpoint
@ApiTags('Authentication')
@Controller('auth')
@ApiVersionDeprecated('v1', {
  sunsetDate: new Date('2027-03-01'),
  migrationGuide: 'https://docs.stellara.network/api/migration/v1-to-v2',
})
export class AuthDeprecatedController {
  // This controller would contain deprecated endpoints
  // that will be removed after the sunset date
}
