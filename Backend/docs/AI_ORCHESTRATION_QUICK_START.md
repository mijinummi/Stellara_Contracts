# AI Orchestration Layer - Quick Start Guide

## Prerequisites
- Node.js 18+
- Redis server running
- API keys for desired AI providers

## Quick Setup

### 1. Install Dependencies
```bash
npm install @nestjs/event-emitter ioredis uuid
```

### 2. Add Environment Variables
```env
# Required for at least one provider
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
AZURE_OPENAI_API_KEY=your_key_here

# Redis (if not already configured)
REDIS_URL=redis://localhost:6379
```

### 3. Import Module
```typescript
// In app.module.ts
import { AiOrchestrationModule } from './ai/orchestration/ai-orchestration.module';

@Module({
  imports: [
    AiOrchestrationModule,
    // ... other modules
  ],
})
export class AppModule {}
```

### 4. Basic Usage
```typescript
import { AiOrchestrationService } from './ai/orchestration/ai-orchestration.service';

constructor(private readonly aiService: AiOrchestrationService) {}

async handleUserQuery(userId: string, prompt: string) {
  const result = await this.aiService.generateResponse(prompt, {
    userId,
    sessionId: 'session-123',
    useCache: true,
  });
  
  return result.response.content;
}
```

## Key Endpoints

### Generate Response
```bash
curl -X POST http://localhost:3000/ai-orchestration/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain quantum computing in simple terms",
    "options": {
      "userId": "user123",
      "sessionId": "session123",
      "model": "gpt-4",
      "temperature": 0.7
    }
  }'
```

### Check Provider Health
```bash
curl http://localhost:3000/ai-orchestration/health
```

### Get Cache Statistics
```bash
curl http://localhost:3000/ai-orchestration/cache/stats
```

## Common Configuration

### Set Custom User Quotas
```typescript
await quotaService.setUserQuotaConfig('premium-user-123', {
  monthlyRequestLimit: 10000,
  monthlyCostLimit: 500,
});
```

### Warm Cache
```typescript
await cacheService.warmCache([
  {
    prompt: "What is blockchain?",
    response: "Blockchain is a distributed ledger technology...",
    model: "gpt-4"
  }
]);
```

## Monitoring

### Check System Stats
```bash
curl http://localhost:3000/ai-orchestration/stats
curl http://localhost:3000/ai-orchestration/monitoring/stats
```

### Reset Circuit Breaker
```bash
curl -X POST http://localhost:3000/ai-orchestration/circuit-breakers/provider:openai/reset
```

This quick start guide provides the essential steps to get the AI Orchestration Layer running in your application. For detailed configuration and advanced features, refer to the full documentation.