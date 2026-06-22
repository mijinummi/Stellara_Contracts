import { Injectable, ForbiddenException } from '@nestjs/common';

interface QuotaRecord {
  requestCount: number;
  tokenCount: number;
}

@Injectable()
export class QuotaService {
  private readonly MAX_REQUESTS = 1000;
  private quotas = new Map<string, QuotaRecord>();

  private getKey(userId: string): string {
    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    return `${userId}:${month}`;
  }

  async assertQuota(userId: string): Promise<void> {
    const key = this.getKey(userId);
    const quota = this.quotas.get(key);

    if (quota && quota.requestCount >= this.MAX_REQUESTS) {
      throw new ForbiddenException({
        error: 'QuotaExceeded',
        message: 'Monthly AI usage quota exceeded',
      });
    }
  }

  async recordUsage(userId: string, tokens: number): Promise<void> {
    const key = this.getKey(userId);
    const existing = this.quotas.get(key) || { requestCount: 0, tokenCount: 0 };

    this.quotas.set(key, {
      requestCount: existing.requestCount + 1,
      tokenCount: existing.tokenCount + tokens,
    });
  }
}
