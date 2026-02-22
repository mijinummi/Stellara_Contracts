import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('should include correlation id header and increment metrics on error', async () => {
    const res = await request(app.getHttpServer())
      .get('/nonexistent')
      .expect(404);

    expect(res.headers['x-correlation-id']).toBeDefined();

    // fetch metrics and verify our counter exists with at least one sample
    const metricsRes = await request(app.getHttpServer()).get('/metrics');
    expect(metricsRes.status).toBe(200);
    expect(metricsRes.text).toMatch(
      /application_errors_total\{severity="medium",category="http"\}/,
    );
  });
});
