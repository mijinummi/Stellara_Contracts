import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CacheStatsDto {
  @ApiProperty({ description: 'Total cache hits' })
  hits: number;

  @ApiProperty({ description: 'Total cache misses' })
  misses: number;

  @ApiProperty({ description: 'Cache hit rate (0-1)' })
  hitRate: number;

  @ApiProperty({ description: 'Total number of cached keys' })
  totalKeys: number;

  @ApiProperty({ description: 'Cache namespace' })
  namespace: string;

  @ApiProperty({ description: 'Stats timestamp' })
  timestamp: Date;
}

export class CacheInvalidateDto {
  @ApiPropertyOptional({
    description: 'Specific cache keys to invalidate',
    type: [String],
  })
  keys?: string[];

  @ApiPropertyOptional({
    description: 'Pattern to match keys for invalidation',
  })
  pattern?: string;

  @ApiPropertyOptional({ description: 'Namespace to invalidate' })
  namespace?: string;
}

export class CacheInvalidateResponseDto {
  @ApiProperty({ description: 'Number of keys invalidated' })
  invalidatedCount: number;

  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;
}
