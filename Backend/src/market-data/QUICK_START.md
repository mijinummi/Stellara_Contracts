# Market Data Module - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Prerequisites
- Redis server running (localhost:6379)
- NestJS backend application running
- Node.js 18+

### Step 1: Verify Redis Connection
```bash
# Test Redis connection
redis-cli ping
# Expected output: PONG
```

### Step 2: Start the Backend
```bash
cd Backend
npm run start:dev
```

### Step 3: Test the Endpoints

#### Get Market Snapshot
```bash
curl http://localhost:3000/market-data/snapshot
```

Expected response:
```json
{
  "assets": [
    {
      "code": "XLM",
      "issuer": "native",
      "priceUSD": 0.125,
      "change24h": 2.5,
      "volume24h": 125000000,
      "marketCap": 3500000000
    }
  ],
  "timestamp": "2026-01-29T12:00:00.000Z",
  "source": "Stellar DEX / CoinGecko",
  "cached": false
}
```

#### Get News
```bash
curl http://localhost:3000/market-data/news?limit=5
```

#### Check Cache Stats
```bash
curl http://localhost:3000/market-data/cache/stats
```

### Step 4: Verify Caching Works

```bash
# First request (cache miss)
curl http://localhost:3000/market-data/snapshot
# Note: cached: false

# Second request (cache hit)
curl http://localhost:3000/market-data/snapshot
# Note: cached: true

# Check hit rate improved
curl http://localhost:3000/market-data/cache/stats
```

## 📊 Quick Testing Workflow

### 1. Clear Cache
```bash
curl -X POST http://localhost:3000/market-data/cache/invalidate/market
```

### 2. Make Request (Cache Miss)
```bash
curl http://localhost:3000/market-data/snapshot
# Response time: ~500ms (API call)
```

### 3. Make Same Request (Cache Hit)
```bash
curl http://localhost:3000/market-data/snapshot
# Response time: <5ms (from cache)
```

### 4. Check Metrics
```bash
curl http://localhost:3000/market-data/cache/stats/market
```

## 🎯 Common Use Cases

### Filter Specific Assets
```bash
curl "http://localhost:3000/market-data/snapshot?assets=XLM,USDC"
```

### Get Stellar News
```bash
curl "http://localhost:3000/market-data/news?category=stellar&limit=10"
```

### Bypass Cache
```bash
curl "http://localhost:3000/market-data/snapshot?bypassCache=true"
```

### Invalidate Specific Pattern
```bash
curl -X POST http://localhost:3000/market-data/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"pattern": "XLM"}'
```

## 🔍 Monitoring Cache Performance

### View Overall Stats
```bash
curl http://localhost:3000/market-data/cache/stats | jq
```

### Monitor Hit Rate
```bash
# Run this periodically to track hit rate
watch -n 5 'curl -s http://localhost:3000/market-data/cache/stats | jq .hitRate'
```

### Check Individual Namespaces
```bash
# Market data cache
curl http://localhost:3000/market-data/cache/stats/market

# News cache
curl http://localhost:3000/market-data/cache/stats/news
```

## 🧪 Run Tests

### Unit Tests
```bash
npm test market-cache.service.spec.ts
```

### Integration Tests
```bash
npm test market-data.integration.spec.ts
```

### All Market Data Tests
```bash
npm test -- market-data
```

## 📖 Swagger Documentation

Access interactive API documentation:
```
http://localhost:3000/api
```

Navigate to "Market Data" section to:
- See all endpoints
- Test endpoints directly
- View request/response schemas
- Try different parameters

## 🐛 Troubleshooting

### Cache Not Working?

1. **Check Redis Connection**
   ```bash
   redis-cli ping
   ```

2. **Check Redis Keys**
   ```bash
   redis-cli KEYS "market:*"
   ```

3. **Monitor Redis in Real-time**
   ```bash
   redis-cli MONITOR
   ```

### No Data Returned?

- Check logs for errors: `npm run start:dev`
- Verify API endpoints are accessible
- Check if module is registered in `app.module.ts`

### Cache Not Invalidating?

```bash
# Force clear all market cache
redis-cli DEL $(redis-cli KEYS "market:*")

# Or use API endpoint
curl -X POST http://localhost:3000/market-data/cache/invalidate/market
```

## 💡 Pro Tips

### 1. Warm Cache on Startup
```typescript
// In a service or startup script
await marketDataService.getMarketSnapshot(); // Populates cache
await newsService.getNews(NewsCategory.STELLAR, 20); // Populates news
```

### 2. Monitor Cache Hit Rate
Aim for:
- Market Snapshots: 80%+ hit rate
- News: 85%+ hit rate
- Price Data: 60%+ hit rate

### 3. Optimize TTLs Based on Usage
```typescript
// Adjust in cache-config.types.ts
CACHE_TTL_CONFIG = {
  MARKET_SNAPSHOT: 300, // Increase for less volatile data
  NEWS: 900,            // Decrease for breaking news
}
```

### 4. Use Cache Bypass for Admin Tools
```typescript
// For admin dashboards, always get fresh data
const snapshot = await marketDataService.getMarketSnapshot(undefined, true);
```

## 🎓 Learning Path

1. **Beginner**: Use the REST endpoints via cURL
2. **Intermediate**: Explore Swagger UI and try different parameters
3. **Advanced**: Review service implementations and write custom queries
4. **Expert**: Integrate with real APIs and optimize cache strategies

## 📝 Quick Reference

### Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/market-data/snapshot` | Get market snapshot |
| GET | `/market-data/news` | Get news articles |
| GET | `/market-data/cache/stats` | Overall stats |
| POST | `/market-data/cache/invalidate/market` | Clear market cache |

### TTL Defaults
| Namespace | TTL | Use Case |
|-----------|-----|----------|
| market:snapshot | 5 min | Market data |
| news | 15 min | News articles |
| asset:data | 10 min | Asset metadata |
| price:data | 1 min | Real-time prices |

## ✅ Validation Checklist

- [ ] Redis is running and accessible
- [ ] Backend application starts without errors
- [ ] Endpoints return expected data
- [ ] Cache hit/miss works correctly
- [ ] Metrics show accurate hit rates
- [ ] Cache invalidation works
- [ ] Tests pass successfully

## 🎉 Next Steps

Once basics are working:
1. Replace mock data with real APIs
2. Configure custom TTLs for your use case
3. Set up monitoring dashboards
4. Implement cache warming strategies
5. Add performance benchmarks

## 📚 Additional Resources

- [Full README](./README.md) - Complete documentation
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md) - Technical details
- [NestJS Docs](https://docs.nestjs.com/) - Framework documentation
- [Redis Docs](https://redis.io/docs/) - Cache documentation

---

**Happy Caching! 🚀**
