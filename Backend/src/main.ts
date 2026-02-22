import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './websocket/redis-io.adapter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { ThrottleGuard } from './throttle/throttle.guard';
import { StructuredLogger } from './logging/structured-logger.service';
import { AllExceptionsFilter } from './logging/all-exceptions.filter';
import { MetricsService } from './logging/metrics.service';
import { ErrorTrackingService } from './logging/error-tracking.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // swap out Nest's default logger with our structured implementation
  const logger = app.get(StructuredLogger);
  app.useLogger(logger);

  // monkey‑patch Nest's Logger prototype so `new Logger()` instances
  // also use the structured logger logic and include correlation IDs.
  const nestProto: any = require('@nestjs/common').Logger.prototype;
  ['log', 'error', 'warn', 'debug', 'verbose'].forEach((method) => {
    const orig = nestProto[method];
    nestProto[method] = function (message: any, ...args: any[]) {
      // delegate to our global structured logger
      (logger as any)[method](message, ...args);
    };
  });

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Configure Swagger
  const config = new DocumentBuilder()
    .setTitle('Stellara API')
    .setDescription(
      'API for authentication, monitoring Stellar network events, and delivering webhooks',
    )
    .setVersion('1.0')
    .addTag('Authentication')
    .addTag('Stellar Monitor')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();

  app.useWebSocketAdapter(redisIoAdapter);
  app.useGlobalGuards(app.get(ThrottleGuard));

  // register an exception filter so all uncaught errors are handled centrally
  const errorTracker = app.get(ErrorTrackingService);
  const metricsService = app.get(MetricsService);
  const globalFilter = new AllExceptionsFilter(errorTracker, metricsService);
  app.useGlobalFilters(globalFilter);

  // expose Prometheus metrics on a simple endpoint via the underlying
  // Express application rather than the Nest `get` which is meant for
  // resolving providers.  The previous call resulted in a type error.
  const expressApp: any = app.getHttpAdapter().getInstance();
  expressApp.get('/metrics', async (_req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(await metricsService.getMetrics());
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
