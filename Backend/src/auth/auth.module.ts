import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

// Entities
import { User } from './entities/user.entity';
import { WalletBinding } from './entities/wallet-binding.entity';
import { LoginNonce } from './entities/login-nonce.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { ApiToken } from './entities/api-token.entity';
import { Permission } from './entities/permission.entity';
import { PermissionGroup } from './entities/permission-group.entity';
import { UserPermission } from './entities/user-permission.entity';
import { PermissionAudit } from './entities/permission-audit.entity';
import { RoleHierarchy } from './entities/role-hierarchy.entity';

// Services
import { NonceService } from './services/nonce.service';
import { WalletService } from './services/wallet.service';
import { JwtAuthService } from './services/jwt-auth.service';
import { ApiTokenService } from './services/api-token.service';
import { RateLimitService } from './services/rate-limit.service';
import { RoleManagerService } from './services/role-manager.service';

// Strategies
import { JwtStrategy } from './strategies/jwt.strategy';

// Guards
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiTokenGuard } from './guards/api-token.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RolesGuard } from './guards/roles.guard';
import { EnhancedRolesGuard } from './guards/enhanced-roles.guard';

// Controllers
import { AuthController } from './controllers/auth.controller';
import { PermissionController } from './controllers/permission.controller';

// Import Redis Module
import { RedisModule } from '../redis/redis.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      WalletBinding,
      LoginNonce,
      RefreshToken,
      ApiToken,
      Permission,
      PermissionGroup,
      UserPermission,
      PermissionAudit,
      RoleHierarchy,
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get(
          'JWT_SECRET',
          'default-secret-change-in-production',
        ),
        signOptions: {
          expiresIn: configService.get('JWT_ACCESS_EXPIRATION', '15m'),
        },
      }),
      inject: [ConfigService],
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    RedisModule,
    ScheduleModule.forRoot(),
    AuditModule,
  ],
  controllers: [AuthController, PermissionController],
  providers: [
    // Services
    NonceService,
    WalletService,
    JwtAuthService,
    ApiTokenService,
    RateLimitService,
    RoleManagerService,

    // Strategies
    JwtStrategy,

    // Guards
    JwtAuthGuard,
    ApiTokenGuard,
    RateLimitGuard,
    RolesGuard,
    EnhancedRolesGuard,
  ],
  exports: [
    // Export TypeOrmModule so that repositories defined here (User, WalletBinding, etc.)
    // are available to any module that imports AuthModule (e.g. GdprModule).
    TypeOrmModule,
    JwtAuthService,
    ApiTokenService,
    WalletService,
    JwtAuthGuard,
    ApiTokenGuard,
    RolesGuard,
    EnhancedRolesGuard,
    RoleManagerService,
  ],
})
export class AuthModule {}
