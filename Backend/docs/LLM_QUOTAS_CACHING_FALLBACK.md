# LLM Usage Quotas, Caching & Fallback Implementation

## Overview

This implementation adds three critical features to the Stellara voice engine's LLM pipeline:

1. **Usage Quotas** - Per-user/month and per-session rate limiting
2. **Response Caching** - Redis-backed caching with intelligent invalidation
3. **Graceful Fallback** - Automatic fallback messages when LLM is unavailable

## Architecture

### Components

#### 1. QuotaService (`quota.service.ts`)
Manages rate limiting and usage tracking with three quota levels:

**Monthly Quota (per user)**
- Default: 1000 requests per month
- Customizable per user (admin function)
- Automatic reset at month boundaries
- TTL expires at end of month

**Session Quota (per session)**
- Default: 100 requests per session
- Independent tracking per session
- TTL: 7 days (604800 seconds)
- Resets when session terminates

**Rate Limiting (per minute)**
- Default: 20 requests per minute
- Fixed-window strategy (minute boundaries)
- TTL: 60 seconds per window
- Resets every minute

**Redis Keys**
```
quota:monthly:{userId}:{YYYY-MM}          # Monthly count
quota:monthly:{userId}:limit               # Custom limit override
quota:session:{sessionId}                  # Session count
quota:rpm:{userId}:{minuteTimestamp}      # Rate limit window
```

#### 2. LlmCacheService (`llm-cache.service.ts`)
Intelligent response caching with:

**Features**
- Deterministic cache keys using SHA-256 hashing of normalized prompts
- Case-insensitive and whitespace-normalized prompt matching
- Per-model caching (same prompt, different model = separate cache)
- Hit rate tracking and statistics
- Automatic cache invalidation with granular control
- Cache entry age tracking
- Cache warming capabilities

**Cache Key Generation**
```
llm:cache:{VERSION}:{model}:{sha256(normalized_prompt)}
```

Example: Prompts like "Hello", "  HELLO  ", "hello" all map to same cache key

**Cache Statistics Tracking**
```
llm:cache:total-entries        # Total cached responses
llm:cache:total-hits           # Cumulative cache hits
{cacheKey}:stats:created       # When entry was cached
{cacheKey}:stats:hits          # Hit count per entry
{cacheKey}:stats:model         # Model used for response
{cacheKey}:stats:ttl           # TTL in seconds
```

**Default TTL**: 24 hours (86400 seconds) - customizable per request

#### 3. Updated LlmService (`llm.service.ts`)
Enhanced with quota, cache, and fallback integration.

**Request Pipeline**
```
User Request
    ↓
Check Quotas → FAIL: Return 429
    ↓
Check Cache → HIT: Return cached response
    ↓
Call LLM → FAIL: Return fallback message
    ↓
Cache Response
    ↓
Record Quota Usage
    ↓
Return Response
```

## API Reference

### LlmService Methods

#### `generateResponse(userId, sessionId, prompt, options?): Promise<LlmResponse>`
Generate response with full quota/cache/fallback pipeline.

**Parameters**
- `userId` (string): User identifier for monthly quota tracking
- `sessionId` (string): Session identifier for session-level quota
- `prompt` (string): The prompt to send to LLM
- `options` (LlmResponseOptions, optional):
  - `model?: string` - LLM model (default: 'gpt-3.5-turbo')
  - `useCache?: boolean` - Enable caching (default: true)
  - `recordQuota?: boolean` - Track quota usage (default: true)
  - `cacheTtl?: number` - Custom cache TTL in seconds

**Returns**
```typescript
{
  content: string;           // Response text
  cached: boolean;           // Was response from cache?
  quotaStatus: QuotaStatus;  // Current quota usage
  model: string;             // Model used
}
```

**Errors**
- `429 TOO_MANY_REQUESTS`: Monthly quota exceeded
- `429 TOO_MANY_REQUESTS`: Session quota exceeded
- `429 TOO_MANY_REQUESTS`: Rate limit exceeded

#### `generateResponseWithFallback(userId, sessionId, prompt, options?): Promise<LlmResponse>`
Generate response with automatic fallback on errors (never throws).

Useful for critical user-facing flows where graceful degradation is required.

#### `getQuotaStatus(userId, sessionId, config?): Promise<QuotaStatus>`
Get current quota usage without enforcing limits.

```typescript
{
  monthlyUsage: number;
  monthlyLimit: number;
  sessionUsage: number;
  sessionLimit: number;
  requestsThisMinute: number;
  requestsPerMinuteLimit: number;
}
```

#### `getCacheStats(): Promise<CacheStats>`
Get cache performance metrics.

```typescript
{
  totalEntries: number;
  totalHits: number;
  hitRate: number;           // 0.0 to 1.0
  oldestEntry: {
    key: string;
    age: number;             // seconds
  } | null;
}
```

#### `invalidateCache(prompt, model?): Promise<number>`
Remove cached entries for a prompt.

- `model` specified: Invalidate only for that model
- No `model`: Invalidate for all models

**Returns**: Number of cache entries deleted

#### `invalidateAllCache(): Promise<number>`
Clear entire LLM response cache.

Use when updating model weights or fixing systematic issues.

#### `resetUserQuota(userId): Promise<void>`
Reset monthly quota for a user (admin function).

Use to restore quota for users, grant extensions, etc.

#### `warmCache(entries): Promise<number>`
Pre-populate cache with common prompts and responses.

```typescript
warmCache([
  {
    prompt: "What is blockchain?",
    response: "Blockchain is a distributed ledger...",
    model: "gpt-3.5-turbo",
    ttl: 86400  // optional
  },
  // more entries...
])
```

**Use Cases**
- Pre-cache FAQ responses
- Reduce cold start latency
- Improve cache hit rates

### QuotaService Methods

#### `enforceQuota(userId, sessionId, config?): Promise<QuotaStatus>`
Check all quota limits and throw if exceeded.

#### `recordRequest(userId, sessionId): Promise<void>`
Increment quota counters after successful request.

#### `setUserMonthlyQuota(userId, limit): Promise<void>`
Set custom monthly quota for a user (overrides default).

#### `getUserMonthlyQuota(userId): Promise<number>`
Get effective monthly quota (custom or default).

#### `resetSessionQuota(sessionId): Promise<void>`
Clear session quota tracking (called on session termination).

### LlmCacheService Methods

#### `get(prompt, model): Promise<string | null>`
Retrieve cached response or null if not found.

#### `set(prompt, response, model, ttl?): Promise<void>`
Cache a response with optional custom TTL.

#### `invalidate(prompt, model?): Promise<number>`
Remove cached entries (specific model or all).

#### `invalidateAll(): Promise<number>`
Clear all cache entries.

#### `pruneOldEntries(maxAgeSeconds): Promise<number>`
Delete cache entries older than specified age.

Use periodically to manage Redis memory usage.

#### `warmCache(entries): Promise<number>`
Pre-populate cache with entries.

#### `getStats(): Promise<CacheStats>`
Get cache performance statistics.

## Usage Examples

### Basic LLM Request with Quotas & Caching

```typescript
// In your controller or gateway
constructor(
  private readonly llmService: LlmService,
) {}

async processPrompt(userId: string, sessionId: string, prompt: string) {
  try {
    const response = await this.llmService.generateResponse(
      userId,
      sessionId,
      prompt,
      {
        model: 'gpt-4',
        useCache: true,
        recordQuota: true,
      }
    );

    return {
      message: response.content,
      cached: response.cached,
      quotaRemaining: response.quotaStatus.monthlyLimit - response.quotaStatus.monthlyUsage,
    };
  } catch (error) {
    if (error instanceof HttpException && error.getStatus() === 429) {
      return { error: 'Rate limit exceeded', retryAfter: 60 };
    }
    throw error;
  }
}
```

### Using Fallback for Critical Flows

```typescript
async getCriticalResponse(userId: string, sessionId: string, prompt: string) {
  // This will never throw - returns fallback on any error
  const response = await this.llmService.generateResponseWithFallback(
    userId,
    sessionId,
    prompt
  );

  return response.content; // Safe to use directly
}
```

### Cache Management

```typescript
// Warm cache with common FAQs
async initializeCache() {
  const commonQuestions = [
    {
      prompt: 'What is a blockchain?',
      response: 'A blockchain is a distributed ledger...',
      model: 'gpt-3.5-turbo',
    },
    // ... more entries
  ];

  await this.llmService.warmCache(commonQuestions);
}

// Monitor cache performance
async getCacheMetrics() {
  return await this.llmService.getCacheStats();
}

// Clear cache on model update
async updateLLMModel(newModel: string) {
  await this.llmService.invalidateAllCache();
  // Redeploy with new model...
}
```

### Admin Functions

```typescript
// Grant user quota extension
async grantQuotaExtension(userId: string, additionalRequests: number) {
  const current = await this.quotaService.getUserMonthlyQuota(userId);
  await this.quotaService.setUserMonthlyQuota(userId, current + additionalRequests);
}

// Check user quota status
async getUserQuotaStatus(userId: string, sessionId: string) {
  return await this.llmService.getQuotaStatus(userId, sessionId);
}

// Reset quota for abused user
async resetUserQuota(userId: string) {
  await this.llmService.resetUserQuota(userId);
}
```

### Session Integration

```typescript
// When creating a session
async createSession(userId: string, context: any) {
  const session = await this.voiceSessionService.createSession(
    userId,
    context
  );

  // Initialize session quota tracking
  // (QuotaService auto-initializes on first request)

  return session;
}

// When terminating a session
async terminateSession(sessionId: string) {
  // Clean up session quota data
  await this.quotaService.resetSessionQuota(sessionId);
  
  // Terminate session normally
  return await this.voiceSessionService.terminateSession(sessionId);
}
```

## Configuration

### Default Quotas

Modify in `quota.service.ts`:

```typescript
private readonly defaultConfig: QuotaConfig = {
  monthlyLimit: 1000,        // Requests per month per user
  perSessionLimit: 100,      // Requests per session
  requestsPerMinute: 20,     // Rate limit
};
```

### Cache TTL

```typescript
// Global default (24 hours)
private readonly DEFAULT_TTL = 86400;

// Per-request override
generateResponse(userId, sessionId, prompt, {
  cacheTtl: 3600  // 1 hour for this response
})
```

### Custom Per-User Quotas

```typescript
// Set higher quota for premium users
await quotaService.setUserMonthlyQuota('user123', 5000);

// Get current quota
const quota = await quotaService.getUserMonthlyQuota('user123');
// Returns: 5000 (or default 1000 if not set)
```

## Redis Memory Optimization

### Monitoring

```typescript
// Check cache size
const stats = await llmService.getCacheStats();
console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
console.log(`Oldest entry: ${stats.oldestEntry?.age || 'N/A'} seconds old`);
```

### Pruning Old Entries

```typescript
// Run periodically (e.g., daily cron job)
const pruned = await cacheService.pruneOldEntries(
  86400  // Delete entries older than 24 hours
);
console.log(`Pruned ${pruned} old cache entries`);
```

### Quota Cleanup

Monthly quota keys automatically expire at month boundaries via Redis TTL. Session quota keys expire after 7 days.

## Testing

Comprehensive test suites included:

- `quota.service.spec.ts` - Quota enforcement tests (60+ assertions)
- `llm-cache.service.spec.ts` - Cache behavior tests (50+ assertions)
- `llm.service.spec.ts` - Updated LLM service tests (40+ assertions)
- `llm-integration.spec.ts` - End-to-end pipeline tests (100+ assertions)

**Run tests:**
```bash
npm test src/voice/services/quota.service.spec.ts
npm test src/voice/services/llm-cache.service.spec.ts
npm test src/voice/services/llm.service.spec.ts
npm test src/voice/services/llm-integration.spec.ts

# Or all voice tests
npm test src/voice/
```

**Coverage:**
- ✅ Monthly quota enforcement
- ✅ Session quota enforcement
- ✅ Rate limit enforcement
- ✅ Cache hit tracking
- ✅ Cache invalidation (specific + all)
- ✅ Cache warming
- ✅ Fallback scenarios
- ✅ Quota status retrieval
- ✅ Error handling and graceful degradation

## Performance Considerations

### Cache Key Normalization
Prompts are normalized before hashing:
- Trimmed of whitespace
- Converted to lowercase
- SHA-256 hashed

**Example:** These all map to the same cache key:
```
"What is TypeScript?"
"  what is typescript?  "
"WHAT IS TYPESCRIPT?"
```

### Quota Atomic Operations
Redis `INCR` is used for all quota counters to ensure atomicity across concurrent requests.

### Cache Hit Rate
Monitor via `getCacheStats()`:
- High hit rate (>80%) indicates good cache warming
- Low hit rate (<30%) suggests short TTL or low query repetition

## Migration Guide

### For Existing Code

**Old API:**
```typescript
const { content, cached } = await llmService.generateResponse(userId, prompt);
```

**New API:**
```typescript
const { content, cached, quotaStatus, model } = await llmService.generateResponse(
  userId,
  sessionId,  // NEW: required for session-level quota
  prompt,
  { model: 'gpt-3.5-turbo' }  // NEW: options object
);
```

**Required Changes:**
1. All `generateResponse` calls must provide `sessionId`
2. Handle `429` HTTP exceptions for quota limits
3. Update error handling for new quota-exceeded scenarios

### Updating Voice Gateway

```typescript
// In voice.gateway.ts
@SubscribeMessage('voice:message')
async onMessage(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: VoiceMessageDto,
) {
  const session = await this.voiceSessionService.getSession(data.sessionId);
  
  try {
    const response = await this.llmService.generateResponse(
      session.userId,
      data.sessionId,      // NEW
      data.content,
      { model: 'gpt-4' }
    );

    client.emit('voice:response', {
      content: response.content,
      cached: response.cached,
      quotaRemaining: response.quotaStatus.monthlyLimit - response.quotaStatus.monthlyUsage,
    });
  } catch (error) {
    if (error.status === 429) {
      client.emit('voice:quota-exceeded', {
        retryAfter: 60,
      });
    } else {
      client.emit('voice:error', { message: 'Processing failed' });
    }
  }
}
```

## Monitoring & Observability

### Key Metrics to Track

1. **Quota Usage**
   - Monthly per-user distribution
   - Peak requests per minute
   - Session quota violations

2. **Cache Performance**
   - Hit rate over time
   - Cache memory consumption
   - Old entries pruned per day

3. **Errors & Fallbacks**
   - Quota exceeded events
   - Cache misses
   - LLM provider failures

### Logging

Services log important events:

```
[LlmService] Cache hit for prompt (gpt-3.5-turbo)
[LlmService] Cached response for prompt (gpt-4)
[QuotaService] User user123 exceeded monthly quota: 1001/1000
[QuotaService] User user456 exceeded rate limit: 21/20 RPM
[LlmCacheService] Invalidated 5 cache entries for prompt
[LlmCacheService] Pruned 42 old cache entries
```

## Troubleshooting

### High Cache Miss Rate
- Prompt normalization not working? Check SHA-256 hashing
- TTL too short? Increase `DEFAULT_TTL` or use per-request override
- Not warmed? Use `warmCache()` for common queries

### Quota Limits Hit Too Often
- Increase `monthlyLimit` or `perSessionLimit`
- Use `setUserMonthlyQuota()` for premium users
- Check for bot activity or abuse

### Memory Issues
- Run `pruneOldEntries()` more frequently
- Reduce `DEFAULT_TTL`
- Use `invalidateCache()` on model updates

## Future Enhancements

- [ ] Sliding window rate limiting
- [ ] ML-based query clustering for improved cache hits
- [ ] Cost-based quota allocation (different prices per model)
- [ ] User-level analytics dashboard
- [ ] A/B testing cache configurations
