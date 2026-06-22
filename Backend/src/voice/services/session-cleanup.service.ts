import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { VoiceSessionService } from './voice-session.service';

@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(private readonly voiceSessionService: VoiceSessionService) {}

  /**
   * Runs every 5 minutes (AC-3).
   * Invokes both cleanup strategies:
   *  1. cleanupStaleSessions — heartbeat timeout (60 s, AC-2)
   *  2. cleanupExpiredSessions — session-level TTL field
   */
  @Cron('*/5 * * * *')
  async performCleanup() {
    try {
      this.logger.debug('Starting scheduled session cleanup...');

      const [staleCount, expiredCount] = await Promise.all([
        this.voiceSessionService.cleanupStaleSessions(),
        this.voiceSessionService.cleanupExpiredSessions(),
      ]);

      const total = staleCount + expiredCount;
      if (total > 0) {
        this.logger.log(
          `Session cleanup complete: ${staleCount} stale, ${expiredCount} expired (total: ${total})`,
        );
      } else {
        this.logger.debug('No sessions to clean up');
      }
    } catch (error) {
      this.logger.error('Error during session cleanup:', error);
    }
  }

  /** Manual trigger for testing or admin use */
  async triggerCleanup(): Promise<{ stale: number; expired: number }> {
    const [stale, expired] = await Promise.all([
      this.voiceSessionService.cleanupStaleSessions(),
      this.voiceSessionService.cleanupExpiredSessions(),
    ]);
    return { stale, expired };
  }
}
