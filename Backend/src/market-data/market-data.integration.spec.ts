import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MarketDataModule } from './market-data.module';
import { RedisModule } from '../redis/redis.module';

describe('MarketDataController (Integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MarketDataModule, RedisModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /market-data/snapshot', () => {
    it('should return market snapshot', () => {
      return request(app.getHttpServer())
        .get('/market-data/snapshot')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('assets');
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('source');
          expect(Array.isArray(res.body.assets)).toBe(true);
        });
    });

    it('should return filtered assets', () => {
      return request(app.getHttpServer())
        .get('/market-data/snapshot?assets=XLM,USDC')
        .expect(200)
        .expect((res) => {
          expect(res.body.assets.length).toBeGreaterThan(0);
          const codes = res.body.assets.map((a: any) => a.code);
          expect(codes).toContain('XLM');
        });
    });

    it('should serve from cache on second request', async () => {
      // First request - cache miss
      const firstResponse = await request(app.getHttpServer())
        .get('/market-data/snapshot')
        .expect(200);

      expect(firstResponse.body.cached).toBe(false);

      // Second request - should be cache hit
      const secondResponse = await request(app.getHttpServer())
        .get('/market-data/snapshot')
        .expect(200);

      expect(secondResponse.body.cached).toBe(true);
    });

    it('should bypass cache when requested', () => {
      return request(app.getHttpServer())
        .get('/market-data/snapshot?bypassCache=true')
        .expect(200)
        .expect((res) => {
          expect(res.body.cached).toBe(false);
        });
    });
  });

  describe('GET /market-data/news', () => {
    it('should return news articles', () => {
      return request(app.getHttpServer())
        .get('/market-data/news')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('articles');
          expect(res.body).toHaveProperty('total');
          expect(res.body).toHaveProperty('timestamp');
          expect(Array.isArray(res.body.articles)).toBe(true);
        });
    });

    it('should filter by category', () => {
      return request(app.getHttpServer())
        .get('/market-data/news?category=stellar')
        .expect(200)
        .expect((res) => {
          expect(res.body.articles.length).toBeGreaterThan(0);
        });
    });

    it('should limit results', () => {
      return request(app.getHttpServer())
        .get('/market-data/news?limit=5')
        .expect(200)
        .expect((res) => {
          expect(res.body.articles.length).toBeLessThanOrEqual(5);
        });
    });

    it('should serve from cache on second request', async () => {
      // First request - cache miss
      const firstResponse = await request(app.getHttpServer())
        .get('/market-data/news?category=market')
        .expect(200);

      expect(firstResponse.body.cached).toBe(false);

      // Second request - should be cache hit
      const secondResponse = await request(app.getHttpServer())
        .get('/market-data/news?category=market')
        .expect(200);

      expect(secondResponse.body.cached).toBe(true);
    });
  });

  describe('GET /market-data/cache/stats', () => {
    it('should return overall cache statistics', () => {
      return request(app.getHttpServer())
        .get('/market-data/cache/stats')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('totalHits');
          expect(res.body).toHaveProperty('totalMisses');
          expect(res.body).toHaveProperty('hitRate');
          expect(res.body).toHaveProperty('namespaces');
          expect(Array.isArray(res.body.namespaces)).toBe(true);
        });
    });

    it('should return market data cache stats', () => {
      return request(app.getHttpServer())
        .get('/market-data/cache/stats/market')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('hits');
          expect(res.body).toHaveProperty('misses');
          expect(res.body).toHaveProperty('hitRate');
          expect(res.body).toHaveProperty('namespace');
        });
    });

    it('should return news cache stats', () => {
      return request(app.getHttpServer())
        .get('/market-data/cache/stats/news')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('hits');
          expect(res.body).toHaveProperty('misses');
          expect(res.body).toHaveProperty('hitRate');
        });
    });
  });

  describe('POST /market-data/cache/invalidate', () => {
    it('should invalidate cache by namespace', () => {
      return request(app.getHttpServer())
        .post('/market-data/cache/invalidate')
        .send({ namespace: 'market:snapshot' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('success', true);
          expect(res.body).toHaveProperty('invalidatedCount');
          expect(res.body).toHaveProperty('message');
        });
    });

    it('should invalidate cache by pattern', () => {
      return request(app.getHttpServer())
        .post('/market-data/cache/invalidate')
        .send({ pattern: 'XLM' })
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
        });
    });
  });

  describe('POST /market-data/cache/invalidate/market', () => {
    it('should invalidate market data cache', () => {
      return request(app.getHttpServer())
        .post('/market-data/cache/invalidate/market')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body).toHaveProperty('invalidatedCount');
        });
    });
  });

  describe('POST /market-data/cache/invalidate/news', () => {
    it('should invalidate news cache', () => {
      return request(app.getHttpServer())
        .post('/market-data/cache/invalidate/news')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body).toHaveProperty('invalidatedCount');
        });
    });
  });

  describe('Cache behavior validation', () => {
    it('should demonstrate cache hit/miss flow', async () => {
      // Clear cache first
      await request(app.getHttpServer())
        .post('/market-data/cache/invalidate/market')
        .expect(200);

      // First request - should be cache miss
      const firstResponse = await request(app.getHttpServer())
        .get('/market-data/snapshot')
        .expect(200);

      expect(firstResponse.body.cached).toBe(false);

      // Second request - should be cache hit
      const secondResponse = await request(app.getHttpServer())
        .get('/market-data/snapshot')
        .expect(200);

      expect(secondResponse.body.cached).toBe(true);

      // Get cache stats
      const statsResponse = await request(app.getHttpServer())
        .get('/market-data/cache/stats/market')
        .expect(200);

      expect(statsResponse.body.hits).toBeGreaterThan(0);

      // Invalidate cache
      await request(app.getHttpServer())
        .post('/market-data/cache/invalidate/market')
        .expect(200);

      // Next request should be cache miss again
      const afterInvalidateResponse = await request(app.getHttpServer())
        .get('/market-data/snapshot')
        .expect(200);

      expect(afterInvalidateResponse.body.cached).toBe(false);
    });
  });
});
