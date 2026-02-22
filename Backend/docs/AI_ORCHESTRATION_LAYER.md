# AI Model Integration and Orchestration Layer

## Overview

This comprehensive AI orchestration system provides a robust, scalable, and resilient platform for managing multiple AI providers, implementing intelligent fallback mechanisms, and handling rate limiting, quotas, and caching across the platform.

## Architecture

The system is built with the following core components:

```
AI Orchestration Layer
├── Provider Abstraction Layer
│   ├── OpenAI Provider
│   ├── Anthropic Provider
│   ├── Google Provider
│   └── Azure Provider
├── Provider Factory & Selection
├── Circuit Breaker Pattern
├── Advanced Quota Management
├── Rate Limiting Service
├── Multi-level Caching
├── Health Monitoring
└── Comprehensive Metrics
```

## Key Features

### 1. Multi-Provider Support
- **OpenAI**: GPT-3.5, GPT-4, GPT-4 Turbo models
- **Anthropic**: Claude 3 (Haiku, Sonnet, Opus) models
- **Google**: Gemini Pro, Gemini 1.5 models
- **Azure OpenAI**: Enterprise-grade deployments

### 2. Intelligent Provider Selection
Multiple selection strategies:
- **Performance Strategy**: Selects provider with lowest latency
- **Cost Optimization Strategy**: Selects most cost-effective provider
- **Round Robin Strategy**: Distributes load evenly

### 3. Resilience Patterns
- **Circuit Breaker**: Automatic failover when providers are unhealthy
- **Fallback Mechanisms**: Graceful degradation with system responses
- **Health Monitoring**: Continuous provider health checks

### 4. Advanced Quota Management
Multi-dimensional quotas:
- **Requests**: Monthly, daily, and per-session limits
- **Tokens**: Token-based usage tracking
- **Cost**: Monetary spending limits
- **Customizable**: Per-user quota configuration

### 5. Sophisticated Rate Limiting
- **Time-based Windows**: Per-minute and per-hour limits
- **Burst Detection**: Prevents abuse patterns
- **Multi-metric**: Requests, tokens, and cost-based limits
- **Sliding Window**: Accurate rate limiting

### 6. Multi-level Caching
- **L1 Cache**: In-memory for fastest access
- **L2 Cache**: Redis for distributed caching
- **Semantic Cache**: Vector similarity search (pluggable)
- **Automatic TTL**: Configurable expiration

### 7. Comprehensive Monitoring
- **Real-time Metrics**: Cache hits, provider performance, error rates
- **Provider Health**: Latency, error rates, status tracking
- **Usage Analytics**: Quota utilization, rate limit metrics
- **Event-driven**: Real-time notifications via EventEmitter

## Installation

### 1. Add Dependencies
```bash
npm install @nestjs/event-emitter ioredis uuid
```

### 2. Environment Configuration
Add the following to your `.env` file:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_DEFAULT_MODEL=gpt-3.5-turbo
OPENAI_TIMEOUT_MS=30000
OPENAI_MAX_RETRIES=3

# Anthropic Configuration
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_DEFAULT_MODEL=claude-3-haiku-20240307
ANTHROPIC_TIMEOUT_MS=30000

# Google Configuration
GOOGLE_API_KEY=your_google_api_key
GOOGLE_DEFAULT_MODEL=gemini-pro
GOOGLE_TIMEOUT_MS=30000

# Azure OpenAI Configuration
AZURE_OPENAI_API_KEY=your_azure_api_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=your-deployment-name
```

### 3. Module Integration
Add to your `app.module.ts`:

```typescript
import { AiOrchestrationModule } from './ai/orchestration/ai-orchestration.module';

@Module({
  imports: [
    // ... other modules
    AiOrchestrationModule,
  ],
})
export class AppModule {}
```

## Usage Examples

### Basic Usage
```typescript
import { AiOrchestrationService } from './ai/orchestration/ai-orchestration.service';

constructor(
  private readonly aiService: AiOrchestrationService,
) {}

async processUserQuery(userId: string, prompt: string) {
  try {
    const result = await this.aiService.generateResponse(prompt, {
      userId,
      sessionId: 'session-123',
      model: 'gpt-4',
      temperature: 0.7,
      useCache: true,
    });

    console.log('Response:', result.response.content);
    console.log('Provider used:', result.orchestrationMetadata.providerSelected);
    console.log('Processing time:', result.orchestrationMetadata.processingTimeMs, 'ms');

    return result.response;
  } catch (error) {
    console.error('AI request failed:', error);
    throw error;
  }
}
```

### With Fallback (Never Throws)
```typescript
async getResponseWithFallback(userId: string, prompt: string) {
  // This will never throw - returns fallback on any error
  const response = await this.aiService.generateResponseWithFallback(prompt, {
    userId,
    sessionId: 'session-123',
    useCache: true,
  });

  return response.content; // Safe to use directly
}
```

### Custom Quota Configuration
```typescript
// Set custom quotas for premium users
await this.quotaService.setUserQuotaConfig('user-123', {
  monthlyRequestLimit: 5000,
  monthlyTokenLimit: 5000000,
  monthlyCostLimit: 500, // $500
  dailyRequestLimit: 500,
  perSessionRequestLimit: 100,
});
```

### Rate Limit Management
```typescript
// Check rate limits before processing
const rateLimit = await this.rateLimitService.checkRateLimit('user-123', 100, 0.5);
if (!rateLimit.canMakeRequest) {
  throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
}

// Record usage after successful request
await this.rateLimitService.recordRequest('user-123', 150, 0.75);
```

### Cache Management
```typescript
// Warm cache with common responses
await this.cacheService.warmCache([
  {
    prompt: "What is blockchain?",
    response: "Blockchain is a distributed ledger technology...",
    model: "gpt-4",
    ttl: 86400 // 24 hours
  },
  // ... more entries
]);

// Get cache statistics
const stats = this.cacheService.getStats();
console.log(`Cache hit rate: ${stats.hitRate * 100}%`);
```

### Provider Health Monitoring
```typescript
// Get current provider health status
const health = await this.orchestrationService.getProviderHealth();
Object.entries(health).forEach(([provider, status]) => {
  console.log(`${provider}: ${status.status} (${status.latencyMs}ms)`);
});

// Get only healthy providers
const healthyProviders = await this.orchestrationService.getHealthyProviders();
console.log('Healthy providers:', healthyProviders);
```

## API Endpoints

### Core Endpoints
```
POST /ai-orchestration/generate
POST /ai-orchestration/generate-with-fallback
GET  /ai-orchestration/health
GET  /ai-orchestration/healthy-providers
GET  /ai-orchestration/stats
```

### Management Endpoints
```
GET  /ai-orchestration/circuit-breakers
POST /ai-orchestration/circuit-breakers/:circuitId/reset
GET  /ai-orchestration/quotas/:userId
POST /ai-orchestration/quotas/:userId/reset
GET  /ai-orchestration/rate-limits/:userId
POST /ai-orchestration/rate-limits/:userId/reset
GET  /ai-orchestration/cache/stats
POST /ai-orchestration/cache/clear
POST /ai-orchestration/cache/warm
GET  /ai-orchestration/monitoring/stats
POST /ai-orchestration/monitoring/reset
```

## Configuration

### Provider Configuration Example
```typescript
const providerConfig = {
  name: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  defaultModel: 'gpt-3.5-turbo',
  models: {
    'gpt-3.5-turbo': {
      name: 'gpt-3.5-turbo',
      maxTokens: 4096,
      inputCostPerToken: 0.0000015,
      outputCostPerToken: 0.000002,
      contextWindow: 16385,
      supportsStreaming: true,
      supportsFunctions: true,
    },
    // ... other models
  },
  timeoutMs: 30000,
  maxRetries: 3,
  retryDelayMs: 1000,
};
```

### Quota Configuration
```typescript
const defaultQuota = {
  monthlyRequestLimit: 1000,
  monthlyTokenLimit: 1000000,
  monthlyCostLimit: 100, // $100
  dailyRequestLimit: 100,
  dailyTokenLimit: 100000,
  dailyCostLimit: 10, // $10
  perSessionRequestLimit: 50,
  perSessionTokenLimit: 50000,
  perSessionCostLimit: 5, // $5
};
```

### Rate Limit Configuration
```typescript
const defaultRateLimits = {
  requestsPerMinute: 20,
  requestsPerHour: 1000,
  tokensPerMinute: 100000,
  tokensPerHour: 1000000,
  costPerMinute: 1.0, // $1 per minute
  costPerHour: 50.0, // $50 per hour
  burstLimit: 5,
  burstWindowMs: 10000, // 10 seconds
};
```

## Monitoring & Observability

### Key Metrics Tracked
- **Cache Performance**: Hit rates, memory usage, eviction rates
- **Provider Performance**: Latency, success rates, error rates
- **Quota Usage**: Monthly/daily/session utilization
- **Rate Limiting**: Request patterns, burst detection
- **Circuit Breaker**: Open/closed states, failure rates

### Health Checks
- **Provider Health**: Continuous API health monitoring
- **System Health**: Overall orchestration system status
- **Component Health**: Individual service health status

### Event-driven Notifications
```typescript
// Listen for quota exceeded events
this.eventEmitter.on('quota.exceeded', (event) => {
  console.log(`Quota exceeded for user ${event.userId}: ${event.quotaType}`);
  // Send notification, log alert, etc.
});

// Listen for rate limit exceeded events
this.eventEmitter.on('rate-limit.exceeded', (event) => {
  console.log(`Rate limit exceeded for user ${event.userId}: ${event.limitType}`);
});
```

## Best Practices

### 1. Error Handling
Always use the fallback method for critical user-facing flows:
```typescript
// Good - user experience never breaks
const response = await aiService.generateResponseWithFallback(prompt, options);

// Okay - but may throw errors
try {
  const result = await aiService.generateResponse(prompt, options);
} catch (error) {
  // Handle error appropriately
}
```

### 2. Caching Strategy
- Enable caching for frequently asked questions
- Use appropriate TTL values based on content volatility
- Warm cache during low-traffic periods
- Monitor cache hit rates and adjust strategy

### 3. Quota Management
- Set appropriate limits based on user tiers
- Monitor quota usage patterns
- Implement proactive quota reset policies
- Provide clear quota exceeded messaging

### 4. Rate Limiting
- Configure limits based on your provider's constraints
- Monitor for abuse patterns
- Implement gradual rate limiting increases
- Use burst detection for DDoS protection

### 5. Provider Selection
- Monitor provider performance regularly
- Implement automatic failover strategies
- Use cost optimization for batch processing
- Consider provider-specific capabilities

## Troubleshooting

### Common Issues

**High Cache Miss Rate**
- Check prompt normalization logic
- Increase TTL for frequently accessed content
- Warm cache with common queries
- Verify cache key generation

**Quota Limits Hit Too Often**
- Increase default quota limits
- Implement user-specific quota overrides
- Monitor for abusive usage patterns
- Consider premium tier pricing

**Provider Failures**
- Check provider API keys and credentials
- Verify provider health status
- Adjust circuit breaker thresholds
- Implement provider fallback chains

**Performance Issues**
- Monitor individual component latencies
- Optimize Redis connection pooling
- Review cache eviction policies
- Analyze provider selection strategy

## Future Enhancements

### Planned Features
- [ ] Semantic caching with vector databases
- [ ] ML-based query optimization
- [ ] Cost-based provider selection
- [ ] Advanced analytics dashboard
- [ ] A/B testing framework
- [ ] Streaming response support
- [ ] Fine-tuning integration
- [ ] Embedding model support

### Scalability Improvements
- [ ] Horizontal scaling support
- [ ] Multi-region deployment
- [ ] Load balancing strategies
- [ ] Database sharding

This orchestration layer provides a production-ready foundation for AI integration with enterprise-grade reliability, monitoring, and management capabilities.