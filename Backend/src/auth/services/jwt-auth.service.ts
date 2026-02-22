import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../../audit/audit.service';
import { AuditEvent } from '../../audit/audit.event';

export interface JwtPayload {
  sub: string; // user id
  walletId?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtAuthService {
  constructor(
    private readonly jwtService: NestJwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditService: AuditService,
  ) {}

  private parseExpirationToDate(exp: string | number): Date {
    const now = new Date();

    if (typeof exp === 'number') {
      // treat as days
      now.setDate(now.getDate() + exp);
      return now;
    }

    // supports formats like '7d', '15m', '24h'
    const match = String(exp).match(/^(\d+)([smhd])$/);
    if (!match) {
      // fallback: if it's just a number, treat as days
      const asNum = parseInt(String(exp), 10);
      now.setDate(now.getDate() + (isNaN(asNum) ? 7 : asNum));
      return now;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        now.setSeconds(now.getSeconds() + value);
        break;
      case 'm':
        now.setMinutes(now.getMinutes() + value);
        break;
      case 'h':
        now.setHours(now.getHours() + value);
        break;
      case 'd':
      default:
        now.setDate(now.getDate() + value);
        break;
    }

    return now;
  }

  async generateAccessToken(
    userId: string,
    walletId?: string,
  ): Promise<string> {
    const payload: JwtPayload = {
      sub: userId,
      walletId,
    };

    return this.jwtService.sign(payload, {
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION', '15m'),
    });
  }

  async generateRefreshToken(
    userId: string,
  ): Promise<{ token: string; id: string; expiresAt: Date }> {
    // token: public identifier (not secret)
    const tokenId = uuidv4();
    // secret: actual secret returned to client and hashed in DB
    const secret = uuidv4();
    const configured = this.configService.get('JWT_REFRESH_EXPIRATION', '7d');
    const expiresAt = this.parseExpirationToDate(configured);

    const saltRounds = Number(
      this.configService.get('REFRESH_TOKEN_SALT_ROUNDS', 10),
    );
    const tokenHash = await bcrypt.hash(secret, saltRounds);

    const refreshToken = this.refreshTokenRepository.create({
      token: tokenId,
      tokenHash,
      userId,
      expiresAt,
      revoked: false,
    });

    const saved = await this.refreshTokenRepository.save(refreshToken);

    // Get user details for audit event
    const user = await this.userRepository.findOne({ where: { id: userId } });

    // Log refresh token creation
    await this.auditService.logAction(
      'REFRESH_TOKEN_CREATED',
      userId,
      saved.id,
      { expiresAt: saved.expiresAt },
    );

    return {
      token: secret,
      id: saved.token,
      expiresAt: saved.expiresAt,
    };
  }

  async validateAccessToken(token: string): Promise<JwtPayload> {
    try {
      const payload = this.jwtService.verify(token);
      return payload as JwtPayload;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  async refreshAccessToken(
    refreshTokenId: string,
    refreshTokenSecret: string,
  ): Promise<{
    accessToken: string;
    newRefreshToken: string;
    newRefreshTokenId: string;
  }> {
    const tokenRecord = await this.refreshTokenRepository.findOne({
      where: { token: refreshTokenId },
      relations: ['user'],
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // If token record exists but already revoked, treat as reuse/compromise.
    if (tokenRecord.revoked) {
      // Revoke all refresh tokens for this user to invalidate sessions
      if (tokenRecord.userId) {
        await this.revokeAllUserRefreshTokens(tokenRecord.userId);
        await this.auditService.logAction(
          'REFRESH_TOKEN_REUSE_DETECTED',
          tokenRecord.userId,
          tokenRecord.id,
          {
            message:
              'Revoked all user refresh tokens due to reuse of revoked token',
          },
        );
      }

      throw new UnauthorizedException(
        'Refresh token has been revoked (possible reuse)',
      );
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Verify secret against stored hash
    const matches = await bcrypt.compare(
      refreshTokenSecret,
      tokenRecord.tokenHash,
    );
    if (!matches) {
      // Secret mismatch — possible tampering. Revoke this token to be safe.
      await this.revokeRefreshToken(tokenRecord.id);
      await this.auditService.logAction(
        'REFRESH_TOKEN_INVALID_SECRET',
        tokenRecord.userId,
        tokenRecord.id,
        { message: 'Provided secret did not match stored hash' },
      );
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!tokenRecord.user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    // Revoke old refresh token (token rotation)
    await this.revokeRefreshToken(tokenRecord.id);

    // Generate new tokens
    const accessToken = await this.generateAccessToken(tokenRecord.userId);
    const newRefreshTokenData = await this.generateRefreshToken(
      tokenRecord.userId,
    );

    await this.auditService.logAction(
      'ACCESS_TOKEN_REFRESHED',
      tokenRecord.userId,
      tokenRecord.id,
    );

    return {
      accessToken,
      newRefreshToken: newRefreshTokenData.token,
      newRefreshTokenId: newRefreshTokenData.id,
    };
  }

  async revokeRefreshToken(tokenId: string): Promise<void> {
    const token = await this.refreshTokenRepository.findOne({
      where: { id: tokenId },
    });

    await this.refreshTokenRepository.update(
      { id: tokenId },
      {
        revoked: true,
        revokedAt: new Date(),
      },
    );

    await this.auditService.logAction(
      'REFRESH_TOKEN_REVOKED',
      token?.userId || tokenId,
      tokenId,
      { revokedAt: new Date() },
    );
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revoked: false },
      {
        revoked: true,
        revokedAt: new Date(),
      },
    );
    await this.auditService.logAction(
      'REFRESH_TOKENS_REVOKED_FOR_USER',
      userId,
      userId,
      { revokedAt: new Date() },
    );
  }

  async getUserFromToken(token: string): Promise<User> {
    const payload = await this.validateAccessToken(token);
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    return user;
  }
}
